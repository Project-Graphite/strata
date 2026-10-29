import { SpaceRole, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from '../../src/crypto/secret-box.service';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
import { integrationApp, password, type Member } from './harness';

const dayMs = 24 * 60 * 60 * 1000;

describe('The security log against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  const log = async (who: Member) =>
    (await strata.prisma.auditEvent.findMany({ where: { userId: who.id }, orderBy: { createdAt: 'asc' } })).map(({ action, actorId, data }) => ({ action, actorId, data }));

  it('records share links, page grants and member role changes against the person who made them', async () => {
    const owner = await member('auditor');
    const guest = await member('audited-guest');
    const space = (await owner.call('POST', '/spaces', { name: 'Audited' })).body;
    await strata.join(space.id, guest, SpaceRole.EDITOR);
    const note = await strata.item(space.id, 'Shared notes');

    const link = (await owner.call('POST', `/items/${note.id}/share-links`, { access: 'view' })).body;
    expect((await owner.call('DELETE', `/items/${note.id}/share-links/${link.id}`)).status).toBe(204);
    expect((await owner.call('PUT', `/notes/${note.id}/people`, { email: guest.email, role: 'comment' })).status).toBe(200);
    expect((await owner.call('DELETE', `/notes/${note.id}/people/${guest.id}`)).status).toBe(204);
    expect((await owner.call('PATCH', `/spaces/${space.id}/members/${guest.id}`, { role: 'viewer' })).status).toBe(200);
    expect((await owner.call('PATCH', `/spaces/${space.id}/members/${guest.id}`, { role: 'nobody' })).status).toBe(400);

    expect(await log(owner)).toEqual([
      { action: 'share_link_created', actorId: owner.id, data: { itemId: note.id, linkId: link.id, access: 'view' } },
      { action: 'share_link_revoked', actorId: owner.id, data: { itemId: note.id, linkId: link.id } },
      { action: 'page_grant_saved', actorId: owner.id, data: { itemId: note.id, recipientId: guest.id, role: 'comment' } },
      { action: 'page_grant_removed', actorId: owner.id, data: { itemId: note.id, recipientId: guest.id } },
      { action: 'member_role_changed', actorId: owner.id, data: { spaceId: space.id, memberId: guest.id, role: 'viewer' } },
    ]);
    expect(await log(guest)).toEqual([]);
  });

  it('records webhooks being created, changed and deleted', async () => {
    const owner = await member('hook-auditor');
    const created = (await owner.call('POST', '/me/webhooks', { url: 'https://hooks.example/in?token=secret', events: ['task.completed'] })).body;
    expect((await owner.call('PATCH', `/me/webhooks/${created.id}`, { active: false })).status).toBe(200);
    expect((await owner.call('DELETE', `/me/webhooks/${created.id}`)).status).toBe(204);

    const events = await log(owner);
    expect(events).toEqual([
      { action: 'webhook_created', actorId: owner.id, data: { webhookId: created.id, host: 'hooks.example' } },
      { action: 'webhook_updated', actorId: owner.id, data: { webhookId: created.id, active: false, events: ['task.completed'] } },
      { action: 'webhook_deleted', actorId: owner.id, data: { webhookId: created.id } },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('records admin changes to the site settings', async () => {
    const admin = await member('site-auditor', UserRole.ADMIN);
    const before = (await strata.anonymous('GET', '/site')).body;
    expect((await admin.call('PATCH', '/admin/site', { fileQuotaMb: before.fileQuotaMb + 1 })).status).toBe(200);
    await admin.call('PATCH', '/admin/site', { fileQuotaMb: before.fileQuotaMb });

    expect((await log(admin)).slice(0, 1)).toEqual([{ action: 'site_settings_changed', actorId: admin.id, data: { fileQuotaMb: before.fileQuotaMb + 1 } }]);
  });

  it('keeps a record of a deleted account once the account and its own log are gone', async () => {
    const leaving = await member('leaver');
    await strata.anonymous('POST', '/auth/login', { email: leaving.email, password: 'not the password at all' });
    expect((await leaving.call('DELETE', '/me', { password })).status).toBe(204);

    expect(await strata.prisma.auditEvent.count({ where: { userId: leaving.id } })).toBe(0);
    const [deleted] = await strata.prisma.auditEvent.findMany({ where: { action: 'account_deleted', data: { path: ['userId'], equals: leaving.id } } });
    expect(deleted).toMatchObject({ userId: null, actorId: null, data: { userId: leaving.id, address: expect.stringMatching(/^[0-9a-f]{16}$/), agent: expect.any(String) } });
    await strata.prisma.auditEvent.delete({ where: { id: deleted!.id } });
  });

  it('stores a hashed address and browser family on sign-in events, never the address', async () => {
    const owner = await member('networked');
    const response = await fetch(`${strata.base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0' },
      body: JSON.stringify({ email: owner.email, password: 'not the password at all' }),
    });
    expect(response.status).toBe(401);

    const [failed] = await log(owner);
    expect(failed).toMatchObject({ action: 'sign_in_failed', data: { reason: 'password', address: expect.stringMatching(/^[0-9a-f]{16}$/), agent: 'Firefox' } });
    expect(JSON.stringify(failed)).not.toContain('127.0.0.1');
  });

  it('records a replayed refresh token, signs every device out and emails the owner once an hour', async () => {
    const owner = await member('replayed');
    const token = randomBytes(48).toString('base64url');
    await strata.prisma.refreshSession.create({
      data: {
        userId: owner.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        deviceLabel: 'Firefox on Linux',
        revokedAt: new Date(Date.now() - 5 * 60_000),
        expiresAt: new Date(Date.now() + dayMs),
      },
    });
    const replay = () => fetch(`${strata.base}/auth/refresh`, { method: 'POST', headers: { Origin: 'http://localhost:4104', Cookie: `strata_refresh=${token}` } });
    const alerts = () => strata.mail.filter((message) => message.to === owner.email && message.subject === 'Someone may have your session');

    expect((await replay()).status).toBe(401);
    expect(await strata.prisma.refreshSession.count({ where: { userId: owner.id, revokedAt: null } })).toBe(0);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]!.text).toContain('Firefox on Linux');
    expect((await replay()).status).toBe(401);
    expect(alerts()).toHaveLength(1);

    expect((await log(owner)).map(({ action, data }) => ({ action, data }))).toEqual([
      { action: 'refresh_token_reused', data: { device: 'Firefox on Linux', emailed: true, address: expect.stringMatching(/^[0-9a-f]{16}$/), agent: expect.any(String) } },
      { action: 'refresh_token_reused', data: { device: 'Firefox on Linux', emailed: false, address: expect.stringMatching(/^[0-9a-f]{16}$/), agent: expect.any(String) } },
    ]);
  });

  it('keeps sign-in events for a year and other events for 90 days', async () => {
    const owner = await member('retained');
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() - days * dayMs);
    await strata.prisma.auditEvent.createMany({
      data: [
        { userId: owner.id, actorId: owner.id, action: 'signed_in', createdAt: at(200) },
        { userId: owner.id, actorId: owner.id, action: 'signed_in', createdAt: at(366) },
        { userId: owner.id, actorId: owner.id, action: 'webhook_created', createdAt: at(89) },
        { userId: owner.id, actorId: owner.id, action: 'webhook_created', createdAt: at(91) },
      ],
    });

    await strata.service(MaintenanceScheduler).run(now);

    expect((await strata.prisma.auditEvent.findMany({ where: { userId: owner.id }, orderBy: { createdAt: 'asc' } })).map(({ action, createdAt }) => [action, createdAt])).toEqual([
      ['signed_in', at(200)],
      ['webhook_created', at(89)],
    ]);
  });

  it('seals capture suggestions left in clear by earlier versions and still reads them', async () => {
    const owner = await member('legacy-texter');
    const box = strata.service(SecretBox);
    const suggestion = { direction: 'spent', amountMinor: 1299, currency: 'USD', merchant: 'NETFLIX.COM', cardDigits: '9876', accountId: null, availableMinor: null, title: 'NETFLIX.COM', category: null };
    const legacy = await strata.prisma.capturedMessage.create({
      data: { spaceId: owner.personalSpaceId, userId: owner.id, sender: 'CIB', textSealed: box.seal('Your card 9876 was charged USD 12.99 at NETFLIX.COM'), hash: randomBytes(16).toString('hex'), receivedAt: new Date(), suggestion },
    });
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/captures`)).body[0].suggestion).toEqual(suggestion);

    await strata.service(MaintenanceScheduler).run(new Date());

    const sealed = (await strata.prisma.capturedMessage.findUniqueOrThrow({ where: { id: legacy.id } })).suggestion as { sealed: string };
    expect(Object.keys(sealed)).toEqual(['sealed']);
    expect(JSON.stringify(sealed)).not.toContain('NETFLIX');
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/captures`)).body[0].suggestion).toEqual(suggestion);
  });
});
