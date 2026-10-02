import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';

const pageSize = 50;

export type ActivityVerb =
  | 'space.updated'
  | 'member.joined'
  | 'member.left'
  | 'member.removed'
  | 'member.role_changed'
  | 'item.created'
  | 'item.updated'
  | 'item.trashed'
  | 'item.restored'
  | 'item.deleted'
  | 'task.completed'
  | 'task.reopened'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.resumed'
  | 'tag.created'
  | 'tag.updated'
  | 'tag.deleted';

export interface ActivityEntry {
  spaceId: string;
  actorId: string | null;
  verb: ActivityVerb;
  itemId?: string;
  data?: Prisma.InputJsonObject;
}

const eventFields = {
  id: true,
  verb: true,
  data: true,
  createdAt: true,
  actor: { select: { handle: true, displayName: true } },
  item: { select: { id: true, kind: true, title: true } },
} satisfies Prisma.ActivityEventSelect;

function present(event: Prisma.ActivityEventGetPayload<{ select: typeof eventFields }>) {
  return {
    id: event.id,
    verb: event.verb,
    actor: event.actor,
    item: event.item && { ...event.item, kind: event.item.kind.toLowerCase() },
    data: event.data,
    createdAt: event.createdAt,
  };
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  record(client: Prisma.TransactionClient, entry: ActivityEntry) {
    return client.activityEvent.create({ data: { ...entry, data: entry.data ?? {} } });
  }

  async list(userId: string, spaceId: string, page: number) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const [total, events] = await this.prisma.$transaction([
      this.prisma.activityEvent.count({ where: { spaceId } }),
      this.prisma.activityEvent.findMany({
        where: { spaceId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: eventFields,
      }),
    ]);
    return {
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      totalResults: total,
      results: events.map(present),
    };
  }
}
