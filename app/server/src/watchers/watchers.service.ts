import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, type Prisma } from '@prisma/client';
import { InboxService } from '../inbox/inbox.service';
import { PageAccessService } from '../notes/page-access.service';
import { PrismaService } from '../prisma/prisma.service';

export function watchedLink(item: { id: string; kind: ItemKind; spaceId: string | null }) {
  if (item.kind === ItemKind.TASK) return `/tasks?task=${item.id}`;
  if (item.kind === ItemKind.NOTE) return `/pages/${item.id}`;
  if (item.kind === ItemKind.BOARD) return `/boards/${item.id}`;
  return `/spaces/${item.spaceId}/items`;
}

export interface WatchedChange {
  title: string;
  body?: string;
  link: string;
}

@Injectable()
export class WatchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly pages: PageAccessService,
  ) {}

  async watch(client: Prisma.TransactionClient, itemId: string, userIds: (string | null | undefined)[]) {
    const data = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))].map((userId) => ({ itemId, userId }));
    if (data.length > 0) await client.itemWatcher.createMany({ data, skipDuplicates: true });
  }

  async notify(client: Prisma.TransactionClient, itemId: string, actorId: string | null, change: WatchedChange, skip: (string | null | undefined)[] = []) {
    const item = await client.item.findUnique({ where: { id: itemId }, select: { spaceId: true } });
    if (!item?.spaceId) return;
    const left = [actorId, ...skip].filter((userId): userId is string => Boolean(userId));
    const watchers = (await client.itemWatcher.findMany({ where: { itemId, userId: { notIn: left }, user: { isActive: true } }, select: { userId: true } })).map((watcher) => watcher.userId);
    if (watchers.length === 0) return;
    const [members, guests] = await Promise.all([
      client.spaceMember.findMany({ where: { spaceId: item.spaceId, userId: { in: watchers } }, select: { userId: true } }),
      client.pageGrant.findMany({ where: { itemId, userId: { in: watchers } }, select: { userId: true } }),
    ]);
    const recipients = [...new Set([...members, ...guests].map((reader) => reader.userId))];
    if (recipients.length > 0) await this.inbox.notify(client, recipients.map((userId) => ({ userId, kind: 'watching' as const, ...change })));
  }

  async actorName(client: Prisma.TransactionClient, userId: string) {
    return (await client.user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? 'Someone';
  }

  async status(userId: string, itemId: string) {
    await this.pages.assertReference(userId, itemId, 'read');
    const watchers = await this.prisma.itemWatcher.findMany({ where: { itemId }, orderBy: { createdAt: 'asc' }, select: { user: { select: { id: true, displayName: true } } } });
    return { watching: watchers.some((watcher) => watcher.user.id === userId), watchers: watchers.map((watcher) => watcher.user) };
  }

  async setWatching(userId: string, itemId: string, watching: boolean) {
    await this.pages.assertReference(userId, itemId, 'read');
    if (watching) await this.watch(this.prisma, itemId, [userId]);
    else await this.prisma.itemWatcher.deleteMany({ where: { itemId, userId } });
    return this.status(userId, itemId);
  }

  async setOtherWatching(userId: string, itemId: string, watcherId: string, watching: boolean) {
    await this.pages.assertReference(userId, itemId, 'edit');
    if (watching) {
      await this.pages.assertReference(watcherId, itemId, 'read').catch((error: unknown) => {
        if (error instanceof NotFoundException) throw new BadRequestException('Choose someone who can see this');
        throw error;
      });
      await this.watch(this.prisma, itemId, [watcherId]);
    } else {
      await this.prisma.itemWatcher.deleteMany({ where: { itemId, userId: watcherId } });
    }
    return this.status(userId, itemId);
  }
}