import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchPublic } from '../widgets/safe-fetch';
import { articleBlocks, articleText } from './article';
import { CreateBookmarkDto, ListBookmarksDto, SaveArticleDto } from './dto/bookmarks.dto';

const bookmarkFields = {
  id: true,
  spaceId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  bookmark: { select: { url: true, siteName: true, description: true, readAt: true } },
} satisfies Prisma.ItemSelect;

function present(row: Prisma.ItemGetPayload<{ select: typeof bookmarkFields }>) {
  const details = row.bookmark!;
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    url: details.url,
    siteName: details.siteName,
    description: details.description,
    readAt: details.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class BookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
  ) {}

  async create(userId: string, spaceId: string, input: CreateBookmarkDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const saved = await this.prisma.item.findFirst({
      where: { spaceId, kind: ItemKind.BOOKMARK, trashedAt: null, bookmark: { url: input.url } },
      select: { id: true },
    });
    if (saved) throw new ConflictException('This link is already saved in this space');
    const title = new URL(input.url).hostname.replace(/^www\./, '');
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: { spaceId, kind: ItemKind.BOOKMARK, title, createdById: userId, updatedById: userId, bookmark: { create: { url: input.url } } },
        select: { id: true },
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title } });
      return item.id;
    });
    return { bookmark: await this.get(userId, id), ...(await this.page(input.url)) };
  }

  async list(userId: string, query: ListBookmarksDto) {
    const rows = await this.prisma.item.findMany({
      where: {
        ...this.access.itemsOf(userId),
        kind: ItemKind.BOOKMARK,
        trashedAt: null,
        archivedAt: null,
        bookmark: query.status ? { readAt: query.status === 'read' ? { not: null } : null } : undefined,
      },
      orderBy: [{ createdAt: query.status === 'unread' ? 'asc' : 'desc' }, { id: 'asc' }],
      take: 500,
      select: bookmarkFields,
    });
    return rows.map(present);
  }

  async get(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    const row = await this.prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      select: { ...bookmarkFields, bookmark: { select: { ...bookmarkFields.bookmark.select, article: true } } },
    });
    if (!row.bookmark) throw new NotFoundException('That item is not a bookmark');
    return { ...present(row), article: row.bookmark.article };
  }

  async markRead(userId: string, itemId: string, read: boolean) {
    await this.editable(userId, itemId);
    await this.prisma.bookmark.update({ where: { itemId }, data: { readAt: read ? new Date() : null } });
    return this.get(userId, itemId);
  }

  async fetchAgain(userId: string, itemId: string) {
    return this.page((await this.editable(userId, itemId)).url);
  }

  async saveArticle(userId: string, itemId: string, input: SaveArticleDto) {
    await this.editable(userId, itemId);
    const blocks = articleBlocks(input.blocks);
    const description = input.description || null;
    await this.prisma.$transaction([
      this.prisma.item.update({
        where: { id: itemId },
        data: {
          title: input.title || undefined,
          updatedById: userId,
          bookmark: {
            update: { siteName: input.siteName || null, description, article: { byline: input.byline || null, blocks } as Prisma.InputJsonObject },
          },
        },
      }),
      this.prisma.searchDocument.updateMany({
        where: { itemId },
        data: { bodyText: [description, articleText(blocks)].filter(Boolean).join('\n'), updatedAt: new Date() },
      }),
    ]);
    return this.get(userId, itemId);
  }

  private async page(url: string) {
    try {
      return { html: await fetchPublic(url, { accept: 'text/html, application/xhtml+xml;q=0.9', maxBytes: 2_000_000, timeoutMs: 10_000 }), fetchError: null };
    } catch (error) {
      return { html: null, fetchError: error instanceof Error ? error.message : 'The page could not be fetched' };
    }
  }

  private async editable(userId: string, itemId: string) {
    const found = await this.access.assertItem(userId, itemId, 'edit');
    if (found.trashedAt) throw new BadRequestException('Restore this bookmark from the trash before changing it');
    const details = await this.prisma.bookmark.findUnique({ where: { itemId }, select: { url: true } });
    if (!details) throw new NotFoundException('That item is not a bookmark');
    return details;
  }
}
