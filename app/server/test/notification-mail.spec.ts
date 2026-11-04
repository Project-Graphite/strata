import { describe, expect, it, vi } from 'vitest';
import { NotificationMailService, notificationMailDelayMs } from '../src/inbox/notification-mail.service';

const now = new Date('2026-11-05T10:00:00Z');
const since = new Date('2026-11-05T09:55:00Z');

function setup({ pending = 0, configured = true, user = {} as Record<string, unknown>, due = [] as { id: string; title: string; body: string | null; link: string | null; readAt: Date | null }[] } = {}) {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'sam', emailKinds: ['task_assigned', 'comment'] }]),
      findUnique: vi.fn().mockResolvedValue({ email: 'sam@example.com', displayName: 'Sam', emailKinds: ['task_assigned', 'comment'], isActive: true, verifiedAt: now, ...user }),
    },
    scheduledJob: { count: vi.fn().mockResolvedValue(pending) },
    inboxNotification: { findMany: vi.fn().mockResolvedValue(due), updateMany: vi.fn() },
  };
  const jobs = { handle: vi.fn(), schedule: vi.fn() };
  const mail = { configured, send: vi.fn(), link: (path: string) => `https://strata.example${path}` };
  return { prisma, jobs, mail, service: new NotificationMailService(prisma as never, jobs as never, mail as never) };
}

describe('Email notifications', () => {
  it('waits a few minutes before emailing, so notifications that pile up go out together', async () => {
    const { jobs, prisma, service } = setup();
    await service.queue(prisma as never, [{ userId: 'sam', kind: 'task_assigned', title: 'Task' }], now);
    expect(jobs.schedule).toHaveBeenCalledWith('mail.notifications', new Date(now.getTime() + notificationMailDelayMs), { userId: 'sam', since: now.toISOString() }, prisma);
  });

  it('adds to the email already on its way instead of queueing another', async () => {
    const { jobs, prisma, service } = setup({ pending: 1 });
    await service.queue(prisma as never, [{ userId: 'sam', kind: 'comment', title: 'Comment' }], now);
    expect(jobs.schedule).not.toHaveBeenCalled();
  });

  it('queues nothing for kinds someone did not choose, or when email is not set up', async () => {
    const off = setup();
    await off.service.queue(off.prisma as never, [{ userId: 'sam', kind: 'birthday', title: 'Birthday' }], now);
    expect(off.jobs.schedule).not.toHaveBeenCalled();
    const unconfigured = setup({ configured: false });
    await unconfigured.service.queue(unconfigured.prisma as never, [{ userId: 'sam', kind: 'comment', title: 'Comment' }], now);
    expect(unconfigured.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('emails the unread ones in one message, skips those already read, and marks all of them emailed', async () => {
    const { mail, prisma, service } = setup({
      due: [
        { id: 'a', title: 'Ana assigned you a task', body: null, link: '/tasks?task=1', readAt: null },
        { id: 'b', title: 'Already seen', body: null, link: null, readAt: now },
        { id: 'c', title: 'Ana commented', body: 'Looks good', link: '/pages/p', readAt: null },
      ],
    });
    await service.deliver({ userId: 'sam', since: since.toISOString() }, now);
    expect(prisma.inboxNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'sam', emailedAt: null, kind: { in: ['task_assigned', 'comment'] }, createdAt: { gte: since, lte: now } },
    }));
    expect(mail.send).toHaveBeenCalledTimes(1);
    const [message] = mail.send.mock.calls[0] as [{ to: string; subject: string; text: string; html: string; headers: Record<string, string> }];
    expect(message).toMatchObject({ to: 'sam@example.com', subject: '2 new notifications on Strata', headers: { 'List-Unsubscribe': '<https://strata.example/settings/notifications>' } });
    expect(message.text).toContain('Ana assigned you a task');
    expect(message.text).toContain('Looks good');
    expect(message.text).not.toContain('Already seen');
    expect(prisma.inboxNotification.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b', 'c'] } }, data: { emailedAt: now } });
  });

  it('sends nothing when everything was read in the app, but still marks it emailed', async () => {
    const { mail, prisma, service } = setup({ due: [{ id: 'a', title: 'Seen', body: null, link: null, readAt: now }] });
    await service.deliver({ userId: 'sam', since: since.toISOString() }, now);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.inboxNotification.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a'] } }, data: { emailedAt: now } });
  });

  it('leaves notifications unmarked when the email fails, so the retry sends them', async () => {
    const { mail, prisma, service } = setup({ due: [{ id: 'a', title: 'Task', body: null, link: null, readAt: null }] });
    mail.send.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(service.deliver({ userId: 'sam', since: since.toISOString() }, now)).rejects.toThrow('SMTP down');
    expect(prisma.inboxNotification.updateMany).not.toHaveBeenCalled();
  });

  it('never emails an account that is inactive or not verified', async () => {
    for (const user of [{ isActive: false }, { verifiedAt: null }]) {
      const { mail, prisma, service } = setup({ user, due: [{ id: 'a', title: 'Task', body: null, link: null, readAt: null }] });
      await service.deliver({ userId: 'sam', since: since.toISOString() }, now);
      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.inboxNotification.findMany).not.toHaveBeenCalled();
    }
  });
});
