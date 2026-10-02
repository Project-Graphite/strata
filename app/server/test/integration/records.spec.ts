import { describe, expect, it } from 'vitest';
import { JobsService } from '../../src/jobs/jobs.service';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
import { integrationApp, password } from './harness';

const dayMs = 24 * 60 * 60 * 1000;

describe('Activity, the security log, the inbox and background work against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('records what happens in a space for its members only, and tells people in their inbox', async () => {
    const owner = await member('keeper');
    const joiner = await member('joiner');
    const outsider = await member('nosy');
    const space = (await owner.call('POST', '/spaces', { name: 'Allotment' })).body;
    const note = await strata.item(space.id, 'Seeds');

    const invite = await owner.call('POST', `/spaces/${space.id}/invitations`, { handle: joiner.handle, role: 'editor' });
    const [invited] = (await joiner.call('GET', '/me/inbox')).body.results;
    expect(invited).toMatchObject({ kind: 'invitation', title: 'keeper invited you to Allotment', link: '/invitations', read: false });
    await joiner.call('POST', `/invitations/${invite.body.invitation.id}/accept`);
    expect((await owner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({
      kind: 'member_joined',
      title: 'joiner joined Allotment',
    });

    await joiner.call('PATCH', `/items/${note.id}`, { title: 'Seed list' });
    await joiner.call('POST', `/items/${note.id}/trash`);
    await joiner.call('POST', `/items/${note.id}/trash`);
    await joiner.call('POST', `/items/${note.id}/restore`);
    await owner.call('POST', `/spaces/${space.id}/tags`, { name: 'Spring' });
    await owner.call('PATCH', `/spaces/${space.id}/members/${joiner.id}`, { role: 'viewer' });

    const activity = (await joiner.call('GET', `/spaces/${space.id}/activity`)).body.results;
    expect(activity.map((event: { verb: string }) => event.verb)).toEqual([
      'member.role_changed',
      'tag.created',
      'item.restored',
      'item.trashed',
      'item.updated',
      'member.joined',
    ]);
    expect(activity[4]).toMatchObject({
      actor: { handle: joiner.handle, displayName: 'joiner' },
      item: { id: note.id, kind: 'note', title: 'Seed list' },
      data: { title: 'Seed list', renamedFrom: 'Seeds' },
    });
    expect((await joiner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({
      kind: 'role_changed',
      title: 'You are now a viewer in Allotment',
    });
    expect((await outsider.call('GET', `/spaces/${space.id}/activity`)).status).toBe(404);
  });

  it('marks inbox notifications read for their owner only', async () => {
    const owner = await member('reader');
    const other = await member('peeker');
    await strata.prisma.inboxNotification.createMany({
      data: [
        { userId: owner.id, kind: 'invitation', title: 'First' },
        { userId: owner.id, kind: 'invitation', title: 'Second' },
      ],
    });
    const [latest] = (await owner.call('GET', '/me/inbox')).body.results;

    expect((await owner.call('GET', '/me/inbox/summary')).body).toEqual({ unread: 2 });
    expect((await other.call('PATCH', `/me/inbox/${latest.id}`, { read: true })).status).toBe(404);
    expect((await owner.call('PATCH', `/me/inbox/${latest.id}`, { read: true })).status).toBe(204);
    expect((await owner.call('GET', '/me/inbox/summary')).body).toEqual({ unread: 1 });
    expect((await owner.call('POST', '/me/inbox/read')).status).toBe(204);
    expect((await owner.call('GET', '/me/inbox/summary')).body).toEqual({ unread: 0 });
  });

  it('keeps a security log that only its owner can read', async () => {
    const owner = await member('guarded');
    const other = await member('watcher');
    const signIn = (secret: string) =>
      strata.anonymous('POST', '/auth/login', { email: owner.email, password: secret });

    expect((await signIn('not the password at all')).status).toBe(401);
    expect((await signIn(password)).status).toBe(201);

    const log = (await owner.call('GET', '/me/audit')).body.results;
    expect(log.map((event: { action: string }) => event.action)).toEqual(['signed_in', 'sign_in_failed']);
    expect(log[1].data).toMatchObject({ reason: 'password' });
    expect((await other.call('GET', '/me/audit')).body.results).toEqual([]);
  });

  it('runs due jobs once, retries failures with backoff and gives up after five attempts', async () => {
    const jobs = strata.service(JobsService);
    const ran: string[] = [];
    jobs.handle('integration.ok', async (payload) => {
      ran.push(String((payload as { name: string }).name));
    });
    jobs.handle('integration.fail', () => Promise.reject(new Error('still broken')));
    const now = new Date();
    const ok = await jobs.schedule('integration.ok', new Date(now.getTime() - 1_000), { name: 'due' });
    const later = await jobs.schedule('integration.ok', new Date(now.getTime() + dayMs), { name: 'later' });
    const failing = await jobs.schedule('integration.fail', new Date(now.getTime() - 1_000));

    await jobs.runDue(now);
    await jobs.runDue(now);
    expect(ran).toEqual(['due']);
    expect(await strata.prisma.scheduledJob.findUniqueOrThrow({ where: { id: ok.id } })).toMatchObject({
      attempts: 1,
      doneAt: expect.any(Date),
    });
    expect(await strata.prisma.scheduledJob.findUniqueOrThrow({ where: { id: later.id } })).toMatchObject({ attempts: 0 });
    const retried = await strata.prisma.scheduledJob.findUniqueOrThrow({ where: { id: failing.id } });
    expect(retried).toMatchObject({ attempts: 1, lastError: 'still broken', claimedAt: null, failedAt: null });
    expect(retried.runAt.getTime()).toBeGreaterThan(now.getTime());

    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await jobs.runDue(new Date(now.getTime() + attempt * dayMs));
    }
    expect(await strata.prisma.scheduledJob.findUniqueOrThrow({ where: { id: failing.id } })).toMatchObject({
      attempts: 5,
      failedAt: expect.any(Date),
    });
    await strata.prisma.scheduledJob.deleteMany({ where: { id: { in: [ok.id, later.id, failing.id] } } });
  });

  it('empties the trash after 30 days and keeps newer items', async () => {
    const owner = await member('tidier');
    const old = await strata.item(owner.personalSpaceId, 'Old');
    const recent = await strata.item(owner.personalSpaceId, 'Recent');
    const now = new Date();
    await strata.prisma.item.update({ where: { id: old.id }, data: { trashedAt: new Date(now.getTime() - 31 * dayMs) } });
    await strata.prisma.item.update({ where: { id: recent.id }, data: { trashedAt: new Date(now.getTime() - 29 * dayMs) } });

    await strata.service(MaintenanceScheduler).run(now);

    expect(await strata.prisma.item.findMany({ where: { id: { in: [old.id, recent.id] } }, select: { title: true } })).toEqual([
      { title: 'Recent' },
    ]);
  });
});
