import { SpaceRole } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublic } from '../../src/widgets/safe-fetch';
import { integrationApp } from './harness';

vi.mock('../../src/widgets/safe-fetch', async (original) => ({ ...(await original<typeof import('../../src/widgets/safe-fetch')>()), fetchPublic: vi.fn() }));

const page = '<html><head><title>Slow bread</title></head><body><article><p>Sourdough needs patience.</p></article></body></html>';

describe('Bookmarks and read-later against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  afterEach(() => vi.mocked(fetchPublic).mockReset());

  it('saves a link with its page, once per space, and only for editors', async () => {
    const owner = await member('collector');
    const viewer = await member('browser');
    const space = (await owner.call('POST', '/spaces', { name: 'Kitchen' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    vi.mocked(fetchPublic).mockResolvedValue(page);

    expect((await owner.call('POST', `/spaces/${space.id}/bookmarks`, { url: 'ftp://bread.example/slow' })).status).toBe(400);
    expect((await viewer.call('POST', `/spaces/${space.id}/bookmarks`, { url: 'https://bread.example/slow' })).status).toBe(403);
    const saved = await owner.call('POST', `/spaces/${space.id}/bookmarks`, { url: 'https://www.bread.example/slow' });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({
      bookmark: { spaceId: space.id, title: 'bread.example', url: 'https://www.bread.example/slow', readAt: null, article: null },
      html: page,
      fetchError: null,
    });
    expect(vi.mocked(fetchPublic)).toHaveBeenLastCalledWith('https://www.bread.example/slow', expect.objectContaining({ maxBytes: 2_000_000 }));
    expect((await owner.call('POST', `/spaces/${space.id}/bookmarks`, { url: 'https://www.bread.example/slow' })).status).toBe(409);

    vi.mocked(fetchPublic).mockRejectedValueOnce(new Error('Only https:// addresses are allowed'));
    const unfetched = await owner.call('POST', `/spaces/${space.id}/bookmarks`, { url: 'http://plain.example/' });
    expect(unfetched.status).toBe(201);
    expect(unfetched.body).toMatchObject({ bookmark: { title: 'plain.example' }, html: null, fetchError: 'Only https:// addresses are allowed' });
  });

  it('keeps the article as plain blocks, finds it in search and shows it to readers', async () => {
    const owner = await member('reader');
    const viewer = await member('peeker');
    const outsider = await member('passer');
    const space = (await owner.call('POST', '/spaces', { name: 'Reading' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    vi.mocked(fetchPublic).mockResolvedValue(page);
    const { bookmark } = (await owner.call('POST', `/spaces/${space.id}/bookmarks`, { url: 'https://bread.example/levain' })).body;

    const article = {
      title: 'Slow bread',
      siteName: 'Bread Weekly',
      description: 'Why sourdough takes time',
      byline: 'A. Baker',
      blocks: [
        { type: 'heading', level: 2, content: [{ text: 'Starter' }] },
        { type: 'paragraph', content: [{ text: 'Feed the ' }, { text: 'levain', href: 'https://bread.example/levain-guide' }, { text: ' twice a day.' }] },
        { type: 'list', ordered: true, items: [[{ text: 'Flour' }], [{ text: 'Water' }]] },
        { type: 'code', text: 'hydration = 0.75' },
        { type: 'image', src: 'https://bread.example/loaf.jpg', alt: 'A crusty loaf' },
      ],
    };
    expect((await viewer.call('PUT', `/bookmarks/${bookmark.id}/article`, article)).status).toBe(403);
    for (const blocks of [
      [{ type: 'paragraph', content: [{ text: 'Click', href: 'javascript:alert(1)' }] }],
      [{ type: 'script', text: 'alert(1)' }],
      [{ type: 'heading', level: 1, content: [] }],
    ]) {
      expect((await owner.call('PUT', `/bookmarks/${bookmark.id}/article`, { ...article, blocks })).status).toBe(400);
    }
    const stored = await owner.call('PUT', `/bookmarks/${bookmark.id}/article`, article);
    expect(stored.body).toMatchObject({
      title: 'Slow bread',
      siteName: 'Bread Weekly',
      description: 'Why sourdough takes time',
      article: { byline: 'A. Baker', blocks: article.blocks },
    });

    expect((await viewer.call('GET', `/bookmarks/${bookmark.id}`)).body).toMatchObject({ title: 'Slow bread', article: { byline: 'A. Baker' } });
    expect((await outsider.call('GET', `/bookmarks/${bookmark.id}`)).status).toBe(404);
    expect((await viewer.call('GET', '/search?q=levain twice')).body.items).toEqual([expect.objectContaining({ id: bookmark.id, kind: 'bookmark' })]);

    await owner.call('PUT', `/bookmarks/${bookmark.id}/article`, { blocks: [] });
    expect((await owner.call('GET', `/bookmarks/${bookmark.id}`)).body).toMatchObject({ title: 'Slow bread', siteName: null, article: { blocks: [] } });

    vi.mocked(fetchPublic).mockResolvedValue('<html>new</html>');
    expect((await owner.call('POST', `/bookmarks/${bookmark.id}/fetch`)).body).toEqual({ html: '<html>new</html>', fetchError: null });
    expect((await viewer.call('POST', `/bookmarks/${bookmark.id}/fetch`)).status).toBe(403);
  });

  it('lists read-later links oldest first and moves them to read', async () => {
    const owner = await member('saver');
    const outsider = await member('nosy');
    vi.mocked(fetchPublic).mockResolvedValue(page);
    const first = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/bookmarks`, { url: 'https://one.example/' })).body.bookmark;
    const second = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/bookmarks`, { url: 'https://two.example/' })).body.bookmark;
    const trashed = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/bookmarks`, { url: 'https://three.example/' })).body.bookmark;
    await strata.prisma.item.update({ where: { id: trashed.id }, data: { trashedAt: new Date() } });

    const ids = async (status = '') => (await owner.call('GET', `/me/bookmarks${status}`)).body.map((entry: { id: string }) => entry.id);
    expect(await ids('?status=unread')).toEqual([first.id, second.id]);
    expect(await ids()).toEqual([second.id, first.id]);
    expect((await outsider.call('GET', '/me/bookmarks')).body).toEqual([]);
    expect((await outsider.call('PATCH', `/bookmarks/${first.id}`, { read: true })).status).toBe(404);

    expect((await owner.call('PATCH', `/bookmarks/${first.id}`, { read: true })).body.readAt).toEqual(expect.any(String));
    expect(await ids('?status=unread')).toEqual([second.id]);
    expect(await ids('?status=read')).toEqual([first.id]);
    await owner.call('PATCH', `/bookmarks/${first.id}`, { read: false });
    expect(await ids('?status=read')).toEqual([]);
    expect((await owner.call('PATCH', `/bookmarks/${trashed.id}`, { read: true })).status).toBe(400);
  });
});
