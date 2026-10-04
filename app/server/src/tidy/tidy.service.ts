import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma, SpaceRole, TidyAction } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ItemsService } from '../items/items.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dayMs } from '../recurrence/dates';
import { subscriptionFields, SubscriptionsService, unused, yearlyCost, type Details } from '../subscriptions/subscriptions.service';
import { presentTag, tagFields } from '../tags/tags.service';
import { TidyActionDto, type TidyActionName } from './dto/tidy.dto';

const largeFileBytes = 5 * 1024 * 1024;

const fileFields = {
  id: true,
  spaceId: true,
  title: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  file: { select: { sha256: true, mimeType: true, sizeBytes: true } },
} satisfies Prisma.ItemSelect;

const batchFields = {
  id: true,
  action: true,
  itemCount: true,
  createdAt: true,
  undoneAt: true,
  tag: { select: tagFields },
  rule: { select: { id: true, titleContains: true } },
  _count: { select: { changes: true } },
} satisfies Prisma.TidyBatchSelect;

function stateFields(userId: string) {
  return {
    id: true,
    spaceId: true,
    kind: true,
    title: true,
    archivedAt: true,
    trashedAt: true,
    tags: { select: { tagId: true } },
    subscription: { select: { cancelledOn: true } },
    space: { select: { members: { where: { userId }, select: { role: true } } } },
  } satisfies Prisma.ItemSelect;
}

type ItemState = Prisma.ItemGetPayload<{ select: ReturnType<typeof stateFields> }>;

function presentFile(item: Prisma.ItemGetPayload<{ select: typeof fileFields }>) {
  return {
    id: item.id,
    spaceId: item.spaceId,
    title: item.title,
    mimeType: item.file!.mimeType,
    sizeBytes: item.file!.sizeBytes,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function presentSubscription(row: { id: string; spaceId: string; title: string; subscription: Details }) {
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.title,
    category: row.subscription.category,
    amountMinor: row.subscription.amountMinor,
    currency: row.subscription.currency,
    yearlyMinor: yearlyCost(row.subscription),
    lastUsedOn: dateText(row.subscription.lastUsedOn),
  };
}

function presentBatch(batch: Prisma.TidyBatchGetPayload<{ select: typeof batchFields }>) {
  return {
    id: batch.id,
    action: batch.action.toLowerCase(),
    tag: batch.tag && presentTag(batch.tag),
    rule: batch.rule,
    itemCount: batch.itemCount,
    remaining: batch._count.changes,
    createdAt: batch.createdAt,
    undoneAt: batch.undoneAt,
  };
}

function presentChange(item: ItemState) {
  return { id: item.id, spaceId: item.spaceId, kind: item.kind.toLowerCase(), title: item.title };
}

function groupedBy<T>(entries: T[], key: (entry: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const name = key(entry);
    if (name !== null) groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  return [...groups].filter(([, members]) => members.length > 1);
}

function canEdit(item: ItemState) {
  const role = item.space.members[0]?.role;
  return role === SpaceRole.OWNER || role === SpaceRole.EDITOR;
}

function refusal(item: ItemState | undefined, action: TidyActionName, tag: { id: string; spaceId: string } | null) {
  if (!item) return 'Not found';
  if (!canEdit(item)) return 'You can only view this space';
  if (item.trashedAt) return action === 'trash' ? 'Already in the trash' : 'In the trash';
  if (action === 'archive' && item.archivedAt) return 'Already archived';
  if (action === 'tag' && item.spaceId !== tag!.spaceId) return 'The tag belongs to another space';
  if (action === 'tag' && item.tags.some(({ tagId }) => tagId === tag!.id)) return 'Already has this tag';
  if (action === 'cancel' && !item.subscription) return 'Not a subscription';
  if (action === 'cancel' && item.subscription!.cancelledOn) return 'Already cancelled';
  return null;
}

function undoRefusal(item: ItemState, action: TidyAction, tagId: string | null) {
  if (!canEdit(item)) return 'You can no longer edit this space';
  if (action === TidyAction.TRASH) return item.trashedAt ? null : 'No longer in the trash';
  if (item.trashedAt) return 'In the trash';
  if (action === TidyAction.ARCHIVE) return item.archivedAt ? null : 'No longer archived';
  if (action === TidyAction.CANCEL) return item.subscription?.cancelledOn ? null : 'No longer cancelled';
  if (!tagId) return 'The tag was deleted';
  return item.tags.some((tag) => tag.tagId === tagId) ? null : 'No longer has this tag';
}

@Injectable()
export class TidyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly items: ItemsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async scan(userId: string) {
    const editable = { ...this.access.itemsOf(userId, 'edit'), trashedAt: null } satisfies Prisma.ItemWhereInput;
    const groups = await this.prisma.file.groupBy({
      by: ['sha256'],
      where: { item: editable },
      having: { sha256: { _count: { gt: 1 } } },
      _count: { _all: true },
      _max: { sizeBytes: true },
    });
    const biggest = groups
      .map((group) => ({ sha256: group.sha256, sizeBytes: group._max.sizeBytes ?? 0, copies: group._count._all }))
      .sort((a, b) => (b.copies - 1) * b.sizeBytes - (a.copies - 1) * a.sizeBytes)
      .slice(0, 20);
    const [copies, large, old, subscriptions] = await Promise.all([
      this.prisma.item.findMany({
        where: { ...editable, file: { sha256: { in: biggest.map((group) => group.sha256) } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: fileFields,
      }),
      this.prisma.file.findMany({
        where: { sizeBytes: { gte: largeFileBytes }, item: editable },
        orderBy: [{ sizeBytes: 'desc' }, { itemId: 'asc' }],
        take: 20,
        select: { item: { select: fileFields } },
      }),
      this.prisma.item.findMany({
        where: { ...editable, kind: ItemKind.FILE, archivedAt: null, updatedAt: { lt: new Date(Date.now() - 365 * dayMs) } },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: fileFields,
      }),
      this.prisma.item.findMany({
        where: { ...editable, kind: ItemKind.SUBSCRIPTION, subscription: { cancelledOn: null } },
        select: subscriptionFields,
      }),
    ]);
    const active = subscriptions
      .map((row) => ({ row: { ...row, subscription: row.subscription! }, view: presentSubscription({ ...row, subscription: row.subscription! }) }))
      .sort((a, b) => b.view.yearlyMinor - a.view.yearlyMinor);
    const views = active.map(({ view }) => view);
    return {
      files: {
        duplicates: biggest.map((group) => ({
          sizeBytes: group.sizeBytes,
          savingBytes: (group.copies - 1) * group.sizeBytes,
          items: copies.filter((copy) => copy.file!.sha256 === group.sha256).map(presentFile),
        })),
        large: large.map(({ item }) => presentFile(item)),
        old: old.map(presentFile),
      },
      subscriptions: {
        unused: active.filter(({ row }) => unused(row)).map(({ view }) => view),
        duplicates: groupedBy(views, (view) => view.name.toLowerCase().replace(/\s+/g, ' ')).map(([, items]) => ({
          name: items[0]!.name,
          items,
        })),
        overlapping: groupedBy(views, (view) => (view.category === 'other' ? null : view.category)).map(([category, items]) => ({
          category,
          items,
        })),
      },
    };
  }

  async preview(userId: string, input: TidyActionDto) {
    const { changes, skipped } = await this.plan(userId, input);
    return { changes: changes.map(presentChange), skipped };
  }

  async apply(userId: string, input: TidyActionDto) {
    const { changes, skipped, tag } = await this.plan(userId, input);
    if (changes.length === 0) return { batch: null, skipped };
    const batch = await this.prisma.tidyBatch.create({
      data: { userId, action: input.action.toUpperCase() as TidyAction, tagId: tag?.id, itemCount: 0 },
      select: { id: true },
    });
    const done: string[] = [];
    try {
      if (input.action === 'tag') {
        await this.prisma.$transaction([
          this.prisma.itemTag.createMany({ data: changes.map(({ id }) => ({ itemId: id, tagId: tag!.id })), skipDuplicates: true }),
          this.prisma.tidyChange.createMany({ data: changes.map(({ id }) => ({ batchId: batch.id, itemId: id })) }),
        ]);
        done.push(...changes.map(({ id }) => id));
      } else {
        for (const { id } of changes) {
          await this.change(userId, input.action, id);
          await this.prisma.tidyChange.create({ data: { batchId: batch.id, itemId: id } });
          done.push(id);
        }
      }
    } finally {
      await (done.length
        ? this.prisma.tidyBatch.update({ where: { id: batch.id }, data: { itemCount: done.length } })
        : this.prisma.tidyBatch.delete({ where: { id: batch.id } }));
    }
    return {
      batch: presentBatch(await this.prisma.tidyBatch.findUniqueOrThrow({ where: { id: batch.id }, select: batchFields })),
      skipped,
    };
  }

  async history(userId: string) {
    const batches = await this.prisma.tidyBatch.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: batchFields,
    });
    return batches.map(presentBatch);
  }

  async undo(userId: string, batchId: string) {
    const batch = await this.prisma.tidyBatch.findFirst({
      where: { id: batchId, userId },
      select: { action: true, tagId: true, undoneAt: true, changes: { select: { item: { select: stateFields(userId) } } } },
    });
    if (!batch) throw new NotFoundException('That change is not in your history');
    if (batch.undoneAt) throw new BadRequestException('This change was already undone');
    const skipped: { id: string; title: string | null; reason: string }[] = [];
    const reversible: ItemState[] = [];
    for (const { item } of batch.changes) {
      const reason = undoRefusal(item, batch.action, batch.tagId);
      if (reason) skipped.push({ id: item.id, title: canEdit(item) ? item.title : null, reason });
      else reversible.push(item);
    }
    if (batch.action === TidyAction.TAG && reversible.length > 0) {
      await this.prisma.itemTag.deleteMany({ where: { tagId: batch.tagId!, itemId: { in: reversible.map(({ id }) => id) } } });
    }
    let restored = batch.action === TidyAction.TAG ? reversible.length : 0;
    for (const item of batch.action === TidyAction.TAG ? [] : reversible) {
      try {
        await this.reverse(userId, batch.action, item.id);
        restored += 1;
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        skipped.push({ id: item.id, title: item.title, reason: error.message });
      }
    }
    await this.prisma.tidyBatch.updateMany({ where: { id: batchId, undoneAt: null }, data: { undoneAt: new Date() } });
    return { restored, skipped };
  }

  private async plan(userId: string, input: TidyActionDto) {
    const tag =
      input.action === 'tag'
        ? await this.prisma.tag.findFirst({ where: { id: input.tagId, space: this.access.spacesOf(userId) }, select: { id: true, spaceId: true } })
        : null;
    if (input.action === 'tag' && !tag) throw new BadRequestException('Choose a tag from the list');
    const found = await this.prisma.item.findMany({
      where: { id: { in: input.itemIds }, ...this.access.itemsOf(userId) },
      select: stateFields(userId),
    });
    const byId = new Map(found.map((item) => [item.id, item]));
    const changes: ItemState[] = [];
    const skipped: { id: string; title: string | null; reason: string }[] = [];
    for (const id of input.itemIds) {
      const item = byId.get(id);
      const reason = refusal(item, input.action, tag);
      if (reason) skipped.push({ id, title: item?.title ?? null, reason });
      else changes.push(item!);
    }
    return { changes, skipped, tag };
  }

  private change(userId: string, action: Exclude<TidyActionName, 'tag'>, itemId: string) {
    if (action === 'archive') return this.items.update(userId, itemId, { archived: true });
    if (action === 'trash') return this.items.moveToTrash(userId, itemId);
    return this.subscriptions.cancel(userId, itemId);
  }

  private reverse(userId: string, action: TidyAction, itemId: string) {
    if (action === TidyAction.ARCHIVE) return this.items.update(userId, itemId, { archived: false });
    if (action === TidyAction.TRASH) return this.items.restore(userId, itemId);
    return this.subscriptions.resume(userId, itemId);
  }
}
