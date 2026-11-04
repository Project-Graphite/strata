import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ItemKind, LinkKind, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AccessService, reachable } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { ItemsService } from '../items/items.service';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsService } from '../site/site-settings.service';
import { inspectFile, inlineTypes } from './file-inspection';
import { FileStore } from './file-store';

export const maxFileBytes = 25 * 1024 * 1024;
const megabyte = 1024 * 1024;
const orphanAgeMs = 60 * 60 * 1000;
function storageFields(userId: string) {
  return {
    itemId: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    public: true,
    createdAt: true,
    item: {
      select: {
        spaceId: true,
        ownerId: true,
        trashedAt: true,
        space: { select: { name: true, members: { where: { userId }, select: { userId: true } } } },
        linksIn: {
          where: { kind: LinkKind.ATTACHMENT, source: { trashedAt: null } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { source: { select: { id: true, kind: true, title: true } } },
        },
      },
    },
  } satisfies Prisma.FileSelect;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly items: ItemsService,
    private readonly site: SiteSettingsService,
    private readonly store: FileStore,
  ) {}

  async upload(userId: string, spaceId: string | null, name: string, data: Buffer) {
    if (spaceId) await this.access.assertSpace(userId, spaceId, 'edit');
    const file = inspectFile(data, name);
    if (!file) {
      throw new UnsupportedMediaTypeException(
        'Strata cannot keep this kind of file. Upload images, PDFs, plain text, Office documents or zip files.',
      );
    }
    const { fileQuotaMb } = await this.site.get();
    const used = await this.prisma.file.aggregate({ where: { uploadedById: userId }, _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0) + file.data.length > fileQuotaMb * megabyte) {
      throw new PayloadTooLargeException(
        `This would take you over your ${fileQuotaMb} MB of file storage. Delete files you no longer need from the trash first.`,
      );
    }
    const sha256 = createHash('sha256').update(file.data).digest('hex');
    const item = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sha256}::text))`;
        await transaction.fileBlob.upsert({
          where: { sha256 },
          create: { sha256, sizeBytes: file.data.length },
          update: { createdAt: new Date() },
        });
        const created = await transaction.item.create({
          data: {
            ...(spaceId ? { spaceId } : { ownerId: userId }),
            kind: ItemKind.FILE,
            title: name,
            createdById: userId,
            updatedById: userId,
            file: {
              create: {
                sha256,
                originalName: name,
                mimeType: file.mimeType,
                sizeBytes: file.data.length,
                width: file.width,
                height: file.height,
                uploadedById: userId,
              },
            },
          },
          select: { id: true },
        });
        if (spaceId) {
          await this.activity.record(transaction, { spaceId, actorId: userId, itemId: created.id, verb: 'item.created', data: { title: name } });
        }
        await this.store.write(sha256, file.data);
        return created;
      },
      { timeout: 30_000 },
    );
    return this.items.get(userId, item.id);
  }

  async storage(userId: string) {
    const [{ fileQuotaMb }, rows] = await Promise.all([
      this.site.get(),
      this.prisma.file.findMany({ where: { uploadedById: userId }, orderBy: { createdAt: 'desc' }, select: storageFields(userId) }),
    ]);
    const total = (list: typeof rows) => list.reduce((sum, file) => sum + file.sizeBytes, 0);
    const live = rows.filter((file) => !file.item.trashedAt);
    const readable = live.filter((file) => file.item.ownerId === userId || (file.item.space?.members.length && reachable(file.item.spaceId)));
    const homes = new Map<string | null, { spaceId: string | null; spaceName: string | null; count: number; sizeBytes: number }>();
    for (const file of readable) {
      const home = homes.get(file.item.spaceId) ?? { spaceId: file.item.spaceId, spaceName: file.item.space?.name ?? null, count: 0, sizeBytes: 0 };
      homes.set(file.item.spaceId, { ...home, count: home.count + 1, sizeBytes: home.sizeBytes + file.sizeBytes });
    }
    return {
      quotaBytes: fileQuotaMb * megabyte,
      usedBytes: total(rows),
      trashedBytes: total(rows.filter((file) => file.item.trashedAt)),
      elsewhereBytes: total(live) - total(readable),
      homes: [...homes.values()].sort((a, b) => (a.spaceName === null ? -1 : b.spaceName === null ? 1 : a.spaceName.localeCompare(b.spaceName))),
      files: readable.map((file) => {
        const source = file.item.linksIn[0]?.source;
        return {
          id: file.itemId,
          spaceId: file.item.spaceId,
          spaceName: file.item.space?.name ?? null,
          attachedTo: source ? { id: source.id, kind: source.kind.toLowerCase(), title: source.title } : null,
          name: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          public: file.public,
          createdAt: file.createdAt,
        };
      }),
    };
  }

  async setPublic(userId: string, itemId: string, shared: boolean) {
    if (!(await this.prisma.file.count({ where: { itemId, item: { ownerId: userId, trashedAt: null } } }))) {
      throw new NotFoundException('Only files in your own library can go in your public folder');
    }
    await this.prisma.$transaction([
      this.prisma.file.update({ where: { itemId }, data: { public: shared } }),
      ...(shared ? [] : [this.prisma.shareLink.updateMany({ where: { itemId, revokedAt: null }, data: { revokedAt: new Date(), slug: null } })]),
    ]);
    return { id: itemId, public: shared };
  }

  async download(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    return this.read(itemId);
  }

  async read(itemId: string) {
    const file = await this.prisma.file.findUnique({
      where: { itemId },
      select: { sha256: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    if (!file) {
      throw new NotFoundException('This item has no file');
    }
    return { ...file, inline: inlineTypes.has(file.mimeType), stream: this.store.read(file.sha256) };
  }

  async removeOrphans(now = new Date()) {
    const orphans = await this.prisma.fileBlob.findMany({
      where: { files: { none: {} }, createdAt: { lt: new Date(now.getTime() - orphanAgeMs) } },
      select: { sha256: true },
      take: 500,
    });
    for (const { sha256 } of orphans) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sha256}::text))`;
        const removed = await transaction.fileBlob.deleteMany({ where: { sha256, files: { none: {} } } });
        if (removed.count === 1) {
          await this.store.remove(sha256);
        }
      });
    }
  }
}

export function fileHeaders(file: { mimeType: string; sizeBytes: number; originalName: string; inline: boolean }) {
  return {
    'Content-Type': file.mimeType,
    'Content-Length': String(file.sizeBytes),
    'Content-Disposition': `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    'Content-Security-Policy': 'sandbox',
    'Cache-Control': 'private, no-store',
  };
}
