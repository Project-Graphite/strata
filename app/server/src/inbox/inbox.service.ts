import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const pageSize = 20;

export type InboxKind =
  | 'invitation'
  | 'member_joined'
  | 'role_changed'
  | 'removed_from_space'
  | 'task_assigned'
  | 'task_due'
  | 'subscription_due'
  | 'event_soon'
  | 'tidy_summary';

export interface InboxEntry {
  userId: string;
  kind: InboxKind;
  title: string;
  body?: string;
  link?: string;
}

const notificationFields = {
  id: true,
  kind: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.InboxNotificationSelect;

function present(notification: Prisma.InboxNotificationGetPayload<{ select: typeof notificationFields }>) {
  return {
    id: notification.id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    read: notification.readAt !== null,
    createdAt: notification.createdAt,
  };
}

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  notify(client: Prisma.TransactionClient, entries: InboxEntry[]) {
    return client.inboxNotification.createMany({ data: entries });
  }

  async list(userId: string, page: number) {
    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.inboxNotification.count({ where: { userId } }),
      this.prisma.inboxNotification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: notificationFields,
      }),
    ]);
    return {
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      totalResults: total,
      results: notifications.map(present),
    };
  }

  async summary(userId: string) {
    return { unread: await this.prisma.inboxNotification.count({ where: { userId, readAt: null } }) };
  }

  async setRead(userId: string, id: string, read: boolean) {
    const { count } = await this.prisma.inboxNotification.updateMany({
      where: { id, userId },
      data: { readAt: read ? new Date() : null },
    });
    if (!count) {
      throw new NotFoundException('Notification not found');
    }
  }

  async readAll(userId: string) {
    await this.prisma.inboxNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
