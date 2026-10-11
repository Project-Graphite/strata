import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import webpush, { WebPushError } from 'web-push';
import { InboxService } from '../../src/inbox/inbox.service';
import { JobsService } from '../../src/jobs/jobs.service';
import { integrationApp } from './harness';

vi.mock('web-push', async (original) => {
  const actual = await original<typeof import('web-push')>();
  return { ...actual, default: { ...actual.default, sendNotification: vi.fn() } };
});

const vapid = webpush.generateVAPIDKeys();
Object.assign(process.env, { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:push@example.com' });

describe('Push notifications against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;
  const keys = { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') };

  afterEach(() => vi.mocked(webpush.sendNotification).mockReset());
  afterAll(() => {
    for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) delete process.env[name];
  });

  it('keeps a device per endpoint, only for browser push services', async () => {
    const owner = await member('pusher');
    const other = await member('bystander');
    const endpoint = `https://fcm.googleapis.com/fcm/send/${owner.id}`;

    expect((await owner.call('GET', '/push/key')).body).toEqual({ publicKey: vapid.publicKey });
    for (const address of ['https://example.com/push', 'http://fcm.googleapis.com/fcm/send/x', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.evil.example/x', 'not a url']) {
      expect((await owner.call('PUT', '/me/push-subscriptions', { endpoint: address, keys, kinds: ['comment'] })).status).toBe(400);
    }
    expect((await owner.call('PUT', '/me/push-subscriptions', { endpoint, keys, kinds: ['comment', 'nonsense'] })).status).toBe(400);
    expect((await owner.call('PUT', '/me/push-subscriptions', { endpoint, keys, kinds: ['comment'] })).body).toEqual({ kinds: ['comment'] });
    expect((await owner.call('POST', '/me/push-subscriptions/find', { endpoint })).body).toEqual({ kinds: ['comment'] });
    expect((await other.call('POST', '/me/push-subscriptions/find', { endpoint })).status).toBe(404);

    expect((await other.call('PUT', '/me/push-subscriptions', { endpoint, keys, kinds: ['task_due'] })).body).toEqual({ kinds: ['task_due'] });
    expect((await owner.call('POST', '/me/push-subscriptions/find', { endpoint })).status).toBe(404);
    expect((await other.call('DELETE', '/me/push-subscriptions', { endpoint })).status).toBe(204);
    expect(await strata.prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });

  it('sends the inbox notices a device chose, and forgets devices the push service no longer knows', async () => {
    const owner = await member('notified');
    const endpoint = `https://updates.push.services.mozilla.com/wpush/v2/${owner.id}`;
    await owner.call('PUT', '/me/push-subscriptions', { endpoint, keys, kinds: ['task_due'] });
    const inbox = strata.service(InboxService);
    const jobs = strata.service(JobsService);
    const pending = () => strata.prisma.scheduledJob.count({ where: { kind: 'push.deliver', doneAt: null, payload: { path: ['entries', '0', 'userId'], equals: owner.id } } });

    await inbox.notify(strata.prisma, [{ userId: owner.id, kind: 'comment', title: 'Sam commented', link: '/notes/x' }]);
    expect(await pending()).toBe(0);

    vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    await inbox.notify(strata.prisma, [{ userId: owner.id, kind: 'task_due', title: 'Pay rent is due today', link: '/today' }]);
    expect(await pending()).toBe(1);
    await jobs.runDue(new Date(Date.now() + 1_000));
    expect(vi.mocked(webpush.sendNotification)).toHaveBeenCalledWith(
      { endpoint, keys },
      JSON.stringify({ title: 'Pay rent is due today', link: '/today' }),
      expect.objectContaining({ vapidDetails: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'mailto:push@example.com' } }),
    );
    expect(await pending()).toBe(0);
    expect(await strata.prisma.inboxNotification.count({ where: { userId: owner.id } })).toBe(2);

    vi.mocked(webpush.sendNotification).mockRejectedValue(new WebPushError('Gone', 410, {}, '', endpoint));
    await inbox.notify(strata.prisma, [{ userId: owner.id, kind: 'task_due', title: 'Water the plants', link: '/today' }]);
    await jobs.runDue(new Date(Date.now() + 1_000));
    expect(await strata.prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });
});
