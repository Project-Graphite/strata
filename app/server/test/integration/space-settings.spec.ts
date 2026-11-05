import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Space settings against Postgres', () => {
  const strata = integrationApp();
  const { member, upload } = strata;

  it('lets owners decide who invites people and who makes share links, and how long links last', async () => {
    const owner = await member('policy-owner');
    const editor = await member('policy-editor');
    const space = (await owner.call('POST', '/spaces', { name: 'Policies' })).body;
    await strata.join(space.id, editor, SpaceRole.EDITOR);
    const page = (await editor.call('POST', `/spaces/${space.id}/notes`, { title: 'Plan' })).body;

    expect((await editor.call('POST', `/spaces/${space.id}/invitations`, { email: 'someone@example.com', role: 'viewer' })).status).toBe(403);
    expect((await owner.call('PATCH', `/spaces/${space.id}/settings`, { defaults: { access: { inviters: 'editors', sharers: 'owners', linkDays: 7 } } })).body.defaults.access).toMatchObject({ inviters: 'editors', sharers: 'owners', linkDays: 7 });
    expect((await editor.call('POST', `/spaces/${space.id}/invitations`, { email: 'someone@example.com', role: 'viewer' })).status).toBe(201);
    expect((await editor.call('POST', `/spaces/${space.id}/invitations`, { email: 'boss@example.com', role: 'owner' })).status).toBe(403);
    expect((await editor.call('POST', `/items/${page.id}/share-links`, { access: 'view' })).status).toBe(403);

    const link = (await owner.call('POST', `/items/${page.id}/share-links`, { access: 'view' })).body;
    const days = (Date.parse(link.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await owner.call('PATCH', `/spaces/${space.id}/settings`, { defaults: { access: { linkDays: 400 } } })).status).toBe(400);
  });

  it('hands a space to another member, archives it and reports its storage', async () => {
    const owner = await member('handing-owner');
    const heir = await member('handing-heir');
    const space = (await owner.call('POST', '/spaces', { name: 'Heirloom' })).body;
    await strata.join(space.id, heir, SpaceRole.EDITOR);
    await upload(owner, space.id, 'one.txt', Buffer.from('twelve bytes'), 'text/plain');

    expect((await owner.call('GET', `/spaces/${space.id}/storage`)).body).toEqual({ files: 1, sizeBytes: 12 });
    expect((await owner.call('PUT', `/spaces/${space.id}/archive`)).body).toMatchObject({ archived: true });
    expect((await heir.call('GET', '/spaces')).body.find((shown: { id: string }) => shown.id === space.id)).toMatchObject({ archived: true });
    expect((await heir.call('PUT', `/spaces/${space.id}/archive`)).status).toBe(403);
    expect((await owner.call('DELETE', `/spaces/${space.id}/archive`)).body).toMatchObject({ archived: false });

    expect((await owner.call('POST', `/spaces/${space.id}/transfer`, { userId: owner.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/transfer`, { userId: heir.id })).body).toMatchObject({ role: 'owner' });
    const roles = (await heir.call('GET', `/spaces/${space.id}/members`)).body.map((shown: { userId: string; role: string }) => [shown.userId, shown.role]);
    expect(roles).toEqual(expect.arrayContaining([[owner.id, 'editor'], [heir.id, 'owner']]));
  });

  it('starts blank pages from the space’s default template and leaves chosen content alone', async () => {
    const owner = await member('template-owner');
    const space = (await owner.call('POST', '/spaces', { name: 'Meetings' })).body;
    expect((await owner.call('PATCH', `/spaces/${space.id}/settings`, { defaults: { page: { template: 'meeting' } } })).status).toBe(200);
    const blank = (await owner.call('POST', `/spaces/${space.id}/notes`, {})).body;
    const written = (await owner.call('POST', `/spaces/${space.id}/notes`, { text: 'Just this' })).body;
    expect(blank.draft).toBe(false);
    expect((await strata.prisma.searchDocument.findUnique({ where: { itemId: written.id } }))?.bodyText).toBe('Just this');
  });
});
