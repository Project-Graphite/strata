import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JobsService } from '../jobs/jobs.service';
import { MailService } from '../mail/mail.service';
import { notificationsEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import type { InboxEntry } from './inbox-kinds';

const deliverKind = 'mail.notifications';
export const notificationMailDelayMs = 5 * 60_000;

@Injectable()
export class NotificationMailService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.jobs.handle(deliverKind, (payload) => this.deliver(payload as { userId: string; since: string }));
  }

  async queue(client: Prisma.TransactionClient, entries: InboxEntry[], now = new Date()) {
    if (!this.mail.configured || entries.length === 0) return;
    const users = await client.user.findMany({
      where: { id: { in: [...new Set(entries.map((entry) => entry.userId))] }, isActive: true, verifiedAt: { not: null } },
      select: { id: true, emailKinds: true },
    });
    for (const user of users) {
      if (!entries.some((entry) => entry.userId === user.id && user.emailKinds.includes(entry.kind))) continue;
      const pending = await client.scheduledJob.count({
        where: { kind: deliverKind, doneAt: null, failedAt: null, payload: { path: ['userId'], equals: user.id } },
      });
      if (pending === 0) await this.jobs.schedule(deliverKind, new Date(now.getTime() + notificationMailDelayMs), { userId: user.id, since: now.toISOString() }, client);
    }
  }

  async deliver({ userId, since }: { userId: string; since: string }, now = new Date()) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true, emailKinds: true, isActive: true, verifiedAt: true } });
    if (!user?.isActive || !user.verifiedAt) return;
    const where = { userId, emailedAt: null, kind: { in: user.emailKinds }, createdAt: { gte: new Date(since), lte: now } };
    const due = await this.prisma.inboxNotification.findMany({ where, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, body: true, link: true, readAt: true } });
    const unread = due.filter((entry) => entry.readAt === null);
    if (unread.length > 0) {
      await this.mail.send({
        to: user.email,
        ...notificationsEmail(this.mail.link, { name: user.displayName, entries: unread }),
        headers: { 'List-Unsubscribe': `<${this.mail.link('/settings/notifications')}>` },
      });
    }
    await this.prisma.inboxNotification.updateMany({ where: { id: { in: due.map((entry) => entry.id) } }, data: { emailedAt: now } });
  }
}
