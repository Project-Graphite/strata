export interface FeedItem {
  title: string;
  link: string;
  published: string | null;
}

export interface Feed {
  title: string;
  items: FeedItem[];
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function text(raw: string) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
      if (name[0] === '#') {
        const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return entities[name.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function element(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? text(match[1]!) : '';
}

function webLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function atomLink(block: string) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(([, attributes]) => ({
    href: attributes!.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? '',
    rel: attributes!.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'alternate',
  }));
  return text(links.find((link) => link.rel === 'alternate')?.href ?? links[0]?.href ?? '');
}

function date(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function parseFeed(xml: string, limit = 20): Feed {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(atom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map(([block]) => block);
  const head = xml.slice(0, xml.search(atom ? /<entry\b/i : /<item\b/i) >>> 0);
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('That address is not an RSS or Atom feed');
  return {
    title: element(head, 'title'),
    items: blocks
      .map((block) => ({
        title: element(block, 'title') || 'Untitled',
        link: webLink(atom ? atomLink(block) : element(block, 'link') || element(block, 'guid')),
        published: date(element(block, atom ? 'updated' : 'pubDate') || element(block, 'published') || element(block, 'dc:date')),
      }))
      .filter((item) => item.link)
      .slice(0, limit),
  };
}
