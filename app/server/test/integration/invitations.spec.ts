import { SpaceRole, UserRole } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

const inviteCode = (text: string) => /\/invite\/([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? '';

describe('Invitations, the invite-only switch and share links against Postgres', () => {
  const strata = integrationApp();
  const { member, mail } = strata;

  function signUp(name: string, invite?: string, email = strata.email(name)) {
    return strata.anonymous('POST', '/auth/register', {
      email,
      handle: strata.handle(name),
      displayName: name,
      password: 'a long password for sign-up',
      ...(invite ? { invite } : {}),
    });
  }

  afterAll(() => strata.prisma.siteSettings.deleteMany({ where: { id: 1 } }));

  it('invites people into a shared space by handle, and only the invitee can answer', async () => {
    const owner = await member('host');
    const viewer = await member('watcher');
    const guest = await member('guest');
    const outsider = await member('outsider');
    const space = (await owner.call('POST', '/spaces', { name: 'Garden' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);

    expect((await owner.call('POST', `/spaces/${owner.personalSpaceId}/invitations`, { handle: guest.handle, role: 'editor' })).status).toBe(400);
    expect((await viewer.call('POST', `/spaces/${space.id}/invitations`, { handle: guest.handle, role: 'editor' })).status).toBe(403);
    expect((await outsider.call('POST', `/spaces/${space.id}/invitations`, { handle: guest.handle, role: 'editor' })).status).toBe(404);
    expect((await owner.call('POST', `/spaces/${space.id}/invitations`, { handle: viewer.handle, role: 'editor' })).status).toBe(409);
    expect((await owner.call('POST', `/spaces/${space.id}/invitations`, { handle: 'nobody-here', role: 'editor' })).status).toBe(404);
    expect(
      (await owner.call('POST', `/spaces/${space.id}/invitations`, { handle: guest.handle, role: 'editor', note: 'see www.example.com' })).status,
    ).toBe(400);

    const sent = await owner.call('POST', `/spaces/${space.id}/invitations`, {
      handle: `@${guest.handle}`,
      role: 'editor',
      note: 'Come help with the tomatoes',
    });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ emailed: true, invitation: { status: 'pending', role: 'editor' } });
    expect(mail.at(-1)).toMatchObject({ to: guest.email, text: expect.stringContaining('/invitations') });
    expect((await owner.call('GET', `/spaces/${space.id}/invitations`)).body).toHaveLength(1);
    expect((await viewer.call('GET', `/spaces/${space.id}/invitations`)).status).toBe(403);

    const received = (await guest.call('GET', '/me/invitations')).body;
    expect(received).toEqual([
      {
        id: sent.body.invitation.id,
        space: { id: space.id, name: 'Garden', color: 'gray' },
        role: 'editor',
        inviter: { handle: owner.handle, displayName: 'host' },
        note: 'Come help with the tomatoes',
        expiresAt: expect.any(String),
      },
    ]);
    expect((await outsider.call('GET', '/me/invitations')).body).toEqual([]);
    expect((await outsider.call('POST', `/invitations/${sent.body.invitation.id}/accept`)).status).toBe(404);
    expect((await outsider.call('DELETE', `/invitations/${sent.body.invitation.id}`)).status).toBe(404);

    expect((await guest.call('POST', `/invitations/${sent.body.invitation.id}/accept`)).body).toEqual({ spaceId: space.id });
    expect((await guest.call('GET', `/spaces/${space.id}`)).body).toMatchObject({ role: 'editor' });
    expect((await guest.call('POST', `/invitations/${sent.body.invitation.id}/accept`)).status).toBe(404);
    expect((await owner.call('GET', `/spaces/${space.id}/invitations`)).body).toEqual([]);

    const declined = await owner.call('POST', `/spaces/${space.id}/invitations`, { handle: outsider.handle, role: 'viewer' });
    expect((await outsider.call('POST', `/invitations/${declined.body.invitation.id}/decline`)).status).toBe(204);
    expect((await outsider.call('POST', `/invitations/${declined.body.invitation.id}/accept`)).status).toBe(404);
    expect((await outsider.call('GET', `/spaces/${space.id}`)).status).toBe(404);
  });

  it('lets someone join a space from an email invite, and only with that email', async () => {
    const owner = await member('organiser');
    const existing = await member('regular');
    const space = (await owner.call('POST', '/spaces', { name: 'Choir' })).body;

    await owner.call('POST', `/spaces/${space.id}/invitations`, { email: strata.email('singer'), role: 'viewer' });
    expect(mail.at(-1)).toMatchObject({
      subject: 'You are invited to a space on Strata',
      text: expect.stringContaining('organiser invited you to join the space "Choir"'),
    });
    const forNewcomer = inviteCode(mail.at(-1)!.text);
    expect((await strata.anonymous('GET', `/invitations/lookup/${forNewcomer}`)).body).toEqual({
      kind: 'space',
      email: strata.email('singer'),
      space: 'Choir',
      inviter: 'organiser',
    });

    expect((await signUp('impostor', forNewcomer)).status).toBe(403);
    expect(await strata.prisma.user.count({ where: { email: strata.email('impostor') } })).toBe(0);
    expect((await signUp('singer', forNewcomer)).status).toBe(201);
    const singer = await strata.prisma.user.findUniqueOrThrow({
      where: { email: strata.email('singer') },
      select: { memberships: { select: { spaceId: true, role: true } } },
    });
    expect(singer.memberships).toEqual(
      expect.arrayContaining([{ spaceId: space.id, role: SpaceRole.VIEWER }]),
    );
    expect((await strata.anonymous('GET', `/invitations/lookup/${forNewcomer}`)).status).toBe(404);

    await owner.call('POST', `/spaces/${space.id}/invitations`, { email: existing.email, role: 'editor' });
    const forExisting = inviteCode(mail.at(-1)!.text);
    expect((await owner.call('POST', '/invitations/redeem', { code: forExisting })).status).toBe(403);
    expect((await existing.call('POST', '/invitations/redeem', { code: forExisting })).body).toEqual({ spaceId: space.id });
    expect((await existing.call('GET', `/spaces/${space.id}`)).body).toMatchObject({ role: 'editor' });

    await owner.call('POST', `/spaces/${space.id}/invitations`, { email: strata.email('late'), role: 'viewer' });
    const withdrawn = inviteCode(mail.at(-1)!.text);
    const [pending] = (await owner.call('GET', `/spaces/${space.id}/invitations`)).body;
    expect((await owner.call('DELETE', `/invitations/${pending.id}`)).status).toBe(204);
    expect((await strata.anonymous('GET', `/invitations/lookup/${withdrawn}`)).status).toBe(404);
  });

  it('closes sign-up while invite-only, apart from people holding an invite', async () => {
    const manager = await member('manager', UserRole.SYSTEM_MANAGER);
    const inviter = await member('friend');

    expect((await inviter.call('PATCH', '/admin/site', { inviteOnly: true })).status).toBe(403);
    expect((await manager.call('PATCH', '/admin/site', { inviteOnly: true })).body).toEqual({ inviteOnly: true, fileQuotaMb: 100 });
    expect((await strata.anonymous('GET', '/site')).body).toEqual({ inviteOnly: true, fileQuotaMb: 100 });
    expect((await signUp('uninvited')).status).toBe(403);

    const invite = await inviter.call('POST', '/invitations', { email: strata.email('invited'), note: 'Try this' });
    expect(invite.body).toMatchObject({ emailed: true, invitation: { kind: 'app', status: 'pending' } });
    expect(mail.at(-1)).toMatchObject({ to: strata.email('invited'), text: expect.stringContaining('Try this') });
    expect((await signUp('invited', inviteCode(invite.body.link))).status).toBe(201);

    const [sent] = (await inviter.call('GET', '/invitations')).body;
    expect(sent).toMatchObject({ status: 'used', joined: [{ handle: strata.handle('invited'), displayName: 'invited' }] });
    expect((await manager.call('PATCH', '/admin/site', { inviteOnly: false })).body).toEqual({ inviteOnly: false, fileQuotaMb: 100 });
  });

  it('shares one item through a guest link that can be turned off', async () => {
    const owner = await member('sharer');
    const viewer = await member('looker');
    const outsider = await member('stranger');
    const space = (await owner.call('POST', '/spaces', { name: 'Trip' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const note = await strata.item(space.id, 'Packing list');

    expect((await viewer.call('POST', `/items/${note.id}/share-links`, { access: 'view' })).status).toBe(403);
    expect((await outsider.call('GET', `/items/${note.id}/share-links`)).status).toBe(404);
    const shared = await owner.call('POST', `/items/${note.id}/share-links`, { access: 'view', expiresInDays: 7 });
    expect(shared.body).toMatchObject({ access: 'view', link: expect.stringContaining('/share/') });
    const code = shared.body.link.split('/share/')[1];

    expect((await strata.anonymous('GET', `/share/${code}`)).body).toEqual({
      access: 'view',
      item: { kind: 'note', title: 'Packing list' },
      event: null,
    });
    expect((await owner.call('GET', `/items/${note.id}/share-links`)).body).toHaveLength(1);

    await strata.prisma.item.update({ where: { id: note.id }, data: { trashedAt: new Date() } });
    expect((await strata.anonymous('GET', `/share/${code}`)).status).toBe(404);
    await strata.prisma.item.update({ where: { id: note.id }, data: { trashedAt: null } });

    expect((await owner.call('DELETE', `/items/${note.id}/share-links/${shared.body.id}`)).status).toBe(204);
    expect((await strata.anonymous('GET', `/share/${code}`)).status).toBe(404);
    expect((await strata.anonymous('GET', `/share/${'x'.repeat(43)}`)).status).toBe(404);
  });
});
