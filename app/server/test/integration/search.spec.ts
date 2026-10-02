import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Search against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('finds items and tags as you type, only in spaces the person can open', async () => {
    const alice = await member('finder');
    const bob = await member('hider');
    const shared = (await bob.call('POST', '/spaces', { name: 'Flat' })).body;
    await strata.join(shared.id, alice, SpaceRole.VIEWER);
    const list = await strata.item(alice.personalSpaceId, 'Shopping list');
    const flatList = await strata.item(shared.id, 'Shopping rota');
    await strata.item(bob.personalSpaceId, 'Shopping secrets');
    const trashed = await strata.item(alice.personalSpaceId, 'Shopping receipts');
    await strata.prisma.item.update({ where: { id: trashed.id }, data: { trashedAt: new Date() } });
    await alice.call('POST', `/spaces/${alice.personalSpaceId}/tags`, { name: 'Shops' });
    await bob.call('POST', `/spaces/${bob.personalSpaceId}/tags`, { name: 'Shopping spree' });

    const found = (await alice.call('GET', '/search?q=shop')).body;
    expect(found.items.map((item: { id: string }) => item.id).sort()).toEqual([list.id, flatList.id].sort());
    expect(found.items.find((item: { id: string }) => item.id === flatList.id)).toMatchObject({
      spaceName: 'Flat',
      kind: 'note',
      title: 'Shopping rota',
    });
    expect(found.tags.map((tag: { name: string }) => tag.name)).toEqual(['Shops']);

    await alice.call('PATCH', `/items/${list.id}`, { title: 'Groceries' });
    expect((await alice.call('GET', '/search?q=groc')).body.items.map((item: { id: string }) => item.id)).toEqual([list.id]);
    expect((await alice.call('GET', '/search?q=shopping list')).body.items).toEqual([]);

    await strata.prisma.searchDocument.update({ where: { itemId: flatList.id }, data: { bodyText: 'bins on tuesday' } });
    expect((await alice.call('GET', '/search?q=tuesday bins')).body.items.map((item: { id: string }) => item.id)).toEqual([
      flatList.id,
    ]);
    expect((await alice.call('GET', '/search?q=%21%21%21')).body).toEqual({ items: [], tags: [] });
    expect((await alice.call('GET', '/search?q=')).status).toBe(400);
  });
});
