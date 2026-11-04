import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { unexpiredLink } from '../share-links/live-share-link';

const driveKinds = [ItemKind.FOLDER, ItemKind.FILE];
const maxDepth = 64;

const entryFields = () =>
  ({
    id: true,
    kind: true,
    title: true,
    createdAt: true,
    updatedAt: true,
    file: { select: { mimeType: true, sizeBytes: true } },
    _count: { select: { shareLinks: { where: unexpiredLink() } } },
  }) satisfies Prisma.ItemSelect;

type Entry = Prisma.ItemGetPayload<{ select: ReturnType<typeof entryFields> }>;

function present(entry: Entry) {
  return {
    id: entry.id,
    kind: entry.kind === ItemKind.FOLDER ? ('folder' as const) : ('file' as const),
    name: entry.title,
    mimeType: entry.file?.mimeType ?? null,
    sizeBytes: entry.file?.sizeBytes ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    shared: entry._count.shareLinks > 0,
  };
}

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangesService,
  ) {}

  async list(userId: string, folderId?: string) {
    if (folderId) await this.ownedFolder(userId, folderId);
    return {
      path: folderId ? ((await this.ancestors(folderId, null)) ?? []) : [],
      entries: await this.entries({ ownerId: userId, folderId: folderId ?? null }),
    };
  }

  async entries(where: Prisma.ItemWhereInput) {
    const rows = await this.prisma.item.findMany({ where: { ...where, kind: { in: driveKinds }, trashedAt: null }, select: entryFields() });
    return rows.map(present).sort((first, second) => (first.kind === second.kind ? first.name.localeCompare(second.name) : first.kind === 'folder' ? -1 : 1));
  }

  async ancestors(itemId: string, stopAt: string | null) {
    const path: { id: string; name: string }[] = [];
    let id: string | null = itemId;
    for (let depth = 0; id && depth < maxDepth; depth += 1) {
      const item: { id: string; title: string; folderId: string | null; trashedAt: Date | null } | null = await this.prisma.item.findUnique({
        where: { id },
        select: { id: true, title: true, folderId: true, trashedAt: true },
      });
      if (!item || item.trashedAt) return null;
      path.unshift({ id: item.id, name: item.title });
      if (item.id === stopAt) return path;
      id = item.folderId;
    }
    return stopAt ? null : path;
  }

  async createFolder(userId: string, name: string, parentId?: string) {
    if (parentId) await this.ownedFolder(userId, parentId);
    const folder = await this.prisma.item.create({
      data: { ownerId: userId, kind: ItemKind.FOLDER, title: name, folderId: parentId ?? null, createdById: userId, updatedById: userId },
      select: entryFields(),
    });
    this.changes.notify('items', { userId });
    return present(folder);
  }

  async rename(userId: string, itemId: string, name: string) {
    const [entry] = await this.ownedEntries(userId, [itemId]);
    const renamed = await this.prisma.item.update({
      where: { id: itemId },
      data: { title: name, updatedById: userId, ...(entry!.kind === ItemKind.FILE ? { file: { update: { originalName: name } } } : {}) },
      select: entryFields(),
    });
    this.changes.notify('items', { userId });
    return present(renamed);
  }

  async move(userId: string, itemIds: string[], folderId: string | null) {
    const entries = await this.ownedEntries(userId, itemIds);
    if (folderId) {
      await this.ownedFolder(userId, folderId);
      const above = new Set(((await this.ancestors(folderId, null)) ?? []).map((step) => step.id));
      if (entries.some((entry) => above.has(entry.id))) throw new BadRequestException('A folder cannot go inside itself');
    }
    await this.prisma.item.updateMany({ where: { id: { in: itemIds } }, data: { folderId, updatedById: userId } });
    this.changes.notify('items', { userId });
  }

  async setTrashed(userId: string, itemIds: string[], trashed: boolean) {
    await this.ownedEntries(userId, itemIds, trashed ? false : undefined);
    await this.prisma.item.updateMany({ where: { id: { in: itemIds } }, data: { trashedAt: trashed ? new Date() : null } });
    this.changes.notify('items', { userId });
  }

  async ownedFolder(userId: string, folderId: string) {
    const folder = await this.prisma.item.findFirst({ where: { id: folderId, ownerId: userId, kind: ItemKind.FOLDER, trashedAt: null }, select: { id: true } });
    if (!folder) throw new NotFoundException('That folder is not in your files');
    return folder;
  }

  private async ownedEntries(userId: string, itemIds: string[], trashed: boolean | undefined = false) {
    const entries = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, ownerId: userId, kind: { in: driveKinds }, ...(trashed === undefined ? {} : { trashedAt: trashed ? { not: null } : null }) },
      select: { id: true, kind: true },
    });
    if (entries.length !== new Set(itemIds).size) throw new NotFoundException('Some of those are not in your files');
    return entries;
  }
}
