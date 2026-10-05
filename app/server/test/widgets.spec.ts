import { describe, expect, it } from 'vitest';
import { parseFeed } from '../src/widgets/feed';
import { checkedUrl, fetchPublic, isPublicAddress, UnsafeUrlError } from '../src/widgets/safe-fetch';

describe('parseFeed', () => {
  it('reads RSS items with entities, CDATA and dates, and drops unsafe links', () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <rss version="2.0"><channel><title>Tom &amp; Jerry News</title>
        <item><title><![CDATA[Cats <b>win</b>]]></title><link>https://example.com/cats</link><pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate></item>
        <item><title>Mice &#8217;s turn &#x2014; again</title><link>javascript:alert(1)</link></item>
        <item><title>No date</title><guid>https://example.com/guid</guid></item>
      </channel></rss>`);
    expect(feed).toEqual({
      title: 'Tom & Jerry News',
      items: [
        { title: 'Cats win', link: 'https://example.com/cats', published: '2026-10-04T09:00:00.000Z' },
        { title: 'No date', link: 'https://example.com/guid', published: null },
      ],
    });
  });

  it('reads Atom entries using the alternate link', () => {
    const feed = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
      <entry><title type="html">First post</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/first"/><updated>2026-10-03T10:00:00Z</updated></entry>
    </feed>`);
    expect(feed.items).toEqual([{ title: 'First post', link: 'https://example.com/first', published: '2026-10-03T10:00:00.000Z' }]);
  });

  it('refuses documents that are not feeds', () => {
    expect(() => parseFeed('<html><title>Shop</title></html>')).toThrow('not an RSS or Atom feed');
  });
});

describe('the feed address guard', () => {
  it('only treats public addresses as public', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect({ address, public: isPublicAddress(address) }).toEqual({ address, public: false });
    }
    for (const address of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) {
      expect({ address, public: isPublicAddress(address) }).toEqual({ address, public: true });
    }
  });

  it('accepts only plain https addresses on the standard port', () => {
    expect(checkedUrl('https://example.com/feed.xml').hostname).toBe('example.com');
    for (const url of ['http://example.com/feed', 'ftp://example.com/feed', 'https://user:pass@example.com/', 'https://example.com:8443/', 'not a url']) {
      expect(() => checkedUrl(url)).toThrow(UnsafeUrlError);
    }
  });

  it('refuses to connect to loopback, private and metadata addresses', async () => {
    for (const url of ['https://localhost/feed', 'https://127.0.0.1/feed', 'https://[::1]/feed', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.1/']) {
      await expect(fetchPublic(url, { accept: '*/*', maxBytes: 1024, timeoutMs: 2_000 })).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });
});
