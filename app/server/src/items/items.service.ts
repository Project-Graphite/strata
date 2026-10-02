import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, LinkKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService, type ActivityVerb } from '../activity/activity.service';
import { uniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { presentTag, tagFields } from '../tags/tags.service';
import { CreateLinkDto, ListItemsDto, UpdateItemDto } from './dto/items.dto';

const pageSize = 50;

const itemFields = {
  id: true,
  spaceId: true,
  kind: true,
  title: true,
  archivedAt: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: tagFields } }, orderBy: { tag: { name: 'asc' } } },
  file: { select: { mimeType: true, sizeBytes: true, width: true, height: true } },
} satisfies Prisma.ItemSelect;

const linkedFields = { id: true, spaceId: true, kind: true, title: true } satisfies Prisma.ItemSelect;

function presentItem(item: Prisma.ItemGetPayload<{ select: typeof itemFields }>) {
  return {
    id: item.id,
    spaceId: item.spaceId,
    kind: item.kind.toLowerCase(),
    title: item.title,
    tags: item.tags.map(({ tag }) => presentTag(tag)),
    file: item.file,
    archivedAt: item.archivedAt,
    trashedAt: item.trashedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function presentLink(
  link: { id: string; kind: LinkKind },
  item: Prisma.ItemGetPayload<{ select: typeof linkedFields }>,
) {
  return {
    id: link.id,
    kind: link.kind.toLowerCase(),
    item: { id: item.id, spaceId: item.spaceId, kind: item.kind.toLowerCase(), title: item.title },
  };
}

function assertNotTrashed(item: { trashedAt: Date | null }) {
  if (item.trashedAt) {
    throw new BadRequestException('Restore this item from the trash before changing it');
  }
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string, spaceId: string, query: ListItemsDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.page(
      {
        spaceId,
        trashedAt: null,
        archivedAt: query.archived ? { not: null } : null,
        kind: query.kind ? (query.kind.toUpperCase() as ItemKind) : undefined,
        tags: query.tag ? { some: { tagId: query.tag } } : undefined,
      },
      { updatedAt: 'desc' },
      query.page,
    );
  }

  listTrash(userId: string, page: number) {
    return this.page(
      { trashedAt: { not: null }, ...this.access.itemsOf(userId, 'edit') },
      { trashedAt: 'desc' },
      page,
    );
  }

  async get(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    return presentItem(await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: itemFields }));
  }

  async update(userId: string, itemId: string, input: UpdateItemDto) {
    const found = await this.access.assertItem(userId, itemId, 'edit');
    assertNotTrashed(found);
    const [item] = await this.prisma.$transaction([
      this.prisma.item.update({
        where: { id: itemId },
        data: {
          title: input.title,
          archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
          updatedById: userId,
        },
        select: itemFields,
      }),
      this.activity.record(this.prisma, {
        spaceId: found.spaceId,
        actorId: userId,
        itemId,
        verb: 'item.updated',
        data: {
          title: input.title ?? found.title,
          ...(input.title !== undefined && input.title !== found.title ? { renamedFrom: found.title } : {}),
          ...(input.archived === undefined ? {} : { archived: input.archived }),
        },
      }),
    ]);
    return presentItem(item);
  }

  async setTags(userId: string, itemId: string, tagIds: string[]) {
    const item = await this.access.assertItem(userId, itemId, 'edit');
    assertNotTrashed(item);
    if ((await this.prisma.tag.count({ where: { id: { in: tagIds }, spaceId: item.spaceId } })) !== tagIds.length) {
      throw new BadRequestException("Choose tags from this item's space");
    }
    const [, , updated] = await this.prisma.$transaction([
      this.prisma.itemTag.deleteMany({ where: { itemId, tagId: { notIn: tagIds } } }),
      this.prisma.itemTag.createMany({ data: tagIds.map((tagId) => ({ itemId, tagId })), skipDuplicates: true }),
      this.prisma.item.update({ where: { id: itemId }, data: { updatedById: userId }, select: itemFields }),
    ]);
    return presentItem(updated);
  }

  async moveToTrash(userId: string, itemId: string) {
    await this.changeTrash(userId, itemId, 'item.trashed', (transaction) =>
      transaction.item.updateMany({
        where: { id: itemId, trashedAt: null },
        data: { trashedAt: new Date(), updatedById: userId },
      }),
    );
  }

  async restore(userId: string, itemId: string) {
    await this.changeTrash(userId, itemId, 'item.restored', (transaction) =>
      transaction.item.updateMany({
        where: { id: itemId, trashedAt: { not: null } },
        data: { trashedAt: null, updatedById: userId },
      }),
    );
  }

  async remove(userId: string, itemId: string) {
    const deleted = await this.changeTrash(userId, itemId, 'item.deleted', (transaction) =>
      transaction.item.deleteMany({ where: { id: itemId, trashedAt: { not: null } } }),
    );
    if (deleted === 0) {
      throw new BadRequestException('Move this item to the trash first');
    }
  }

  async links(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    const visible = { trashedAt: null, ...this.access.itemsOf(userId) };
    const [outgoing, backlinks] = await Promise.all([
      this.prisma.itemLink.findMany({
        where: { sourceItemId: itemId, target: visible },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, kind: true, target: { select: linkedFields } },
      }),
      this.prisma.itemLink.findMany({
        where: { targetItemId: itemId, source: visible },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, kind: true, source: { select: linkedFields } },
      }),
    ]);
    return {
      outgoing: outgoing.map((link) => presentLink(link, link.target)),
      backlinks: backlinks.map((link) => presentLink(link, link.source)),
    };
  }

  async link(userId: string, itemId: string, input: CreateLinkDto) {
    assertNotTrashed(await this.access.assertItem(userId, itemId, 'edit'));
    if (input.targetId === itemId) {
      throw new BadRequestException('An item cannot link to itself');
    }
    await this.access.assertItem(userId, input.targetId, 'read');
    const link = await this.prisma.itemLink
      .create({
        data: {
          sourceItemId: itemId,
          targetItemId: input.targetId,
          kind: input.kind.toUpperCase() as LinkKind,
          createdById: userId,
        },
        select: { id: true, kind: true, target: { select: linkedFields } },
      })
      .catch((error: unknown) => {
        if (uniqueViolation(error)) {
          throw new ConflictException('These items are already linked that way');
        }
        throw error;
      });
    return presentLink(link, link.target);
  }

  async unlink(userId: string, itemId: string, linkId: string) {
    await this.access.assertItem(userId, itemId, 'edit');
    const deleted = await this.prisma.itemLink.deleteMany({ where: { id: linkId, sourceItemId: itemId } });
    if (deleted.count === 0) {
      throw new NotFoundException('That link is already gone');
    }
  }

  private async changeTrash(
    userId: string,
    itemId: string,
    verb: Extract<ActivityVerb, 'item.trashed' | 'item.restored' | 'item.deleted'>,
    change: (transaction: Prisma.TransactionClient) => Promise<{ count: number }>,
  ) {
    const item = await this.access.assertItem(userId, itemId, 'edit');
    return this.prisma.$transaction(async (transaction) => {
      const { count } = await change(transaction);
      if (count === 1) {
        await this.activity.record(transaction, {
          spaceId: item.spaceId,
          actorId: userId,
          itemId: verb === 'item.deleted' ? undefined : itemId,
          verb,
          data: { title: item.title },
        });
      }
      return count;
    });
  }

  private async page(
    where: Prisma.ItemWhereInput,
    order: Prisma.ItemOrderByWithRelationInput,
    page: number,
  ) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        orderBy: [order, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: itemFields,
      }),
    ]);
    return {
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      totalResults: total,
      results: items.map(presentItem),
    };
  }
}
