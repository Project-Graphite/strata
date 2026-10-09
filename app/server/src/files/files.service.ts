import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { ItemsService } from '../items/items.service';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsService } from '../site/site-settings.service';
import { inspectFile, inlineTypes } from './file-inspection';
import { FileStore } from './file-store';

export const maxFileBytes = 25 * 1024 * 1024;
const megabyte = 1024 * 1024;
const orphanAgeMs = 60 * 60 * 1000;

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

  async upload(userId: string, spaceId: string, name: string, data: Buffer) {
    await this.access.assertSpace(userId, spaceId, 'edit');
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
            spaceId,
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
        await this.activity.record(transaction, {
          spaceId,
          actorId: userId,
          itemId: created.id,
          verb: 'item.created',
          data: { title: name },
        });
        await this.store.write(sha256, file.data);
        return created;
      },
      { timeout: 30_000 },
    );
    return this.items.get(userId, item.id);
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
