import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, LinkKind, Prisma, ShareAccess } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { linkTokenHash } from '../crypto/link-token';
import { SecretBox } from '../crypto/secret-box.service';
import { publicEvent } from '../events/events.service';
import { DriveService } from '../files/drive.service';
import { FilesService } from '../files/files.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText } from '../recurrence/dates';
import { RealtimeService } from '../realtime/realtime.service';
import { documentLinks, pageKinds } from '../notes/document-text';
import { CreateShareLinkDto, UpdateShareLinkDto } from './dto/share-links.dto';
import { PageAccessService } from '../notes/page-access.service';
import { uniqueViolation } from '../prisma/errors';
import { liveShareLink, unexpiredLink } from './live-share-link';

const minuteMs = 60 * 1000;
const dayMinutes = 24 * 60;
const slugAlphabet = 'abcdefghijkmnpqrstuvwxyz23456789';

const linkFields = { id: true, access: true, tokenHash: true, slug: true, expiresAt: true, createdAt: true } satisfies Prisma.ShareLinkSelect;

function shortSlug() {
  return [...randomBytes(8)].map((byte) => slugAlphabet[byte % slugAlphabet.length]).join('');
}

function slugTaken(error: unknown): never {
  if (uniqueViolation(error)) {
    throw new ConflictException('That link name is taken. Try another.');
  }
  throw error;
}

@Injectable()
export class ShareLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mail: MailService,
    private readonly files: FilesService,
    private readonly box: SecretBox,
    private readonly realtime: RealtimeService,
    private readonly pages: PageAccessService,
    private readonly audit: AuditService,
    private readonly drive: DriveService,
  ) {}

  async create(userId: string, itemId: string, input: CreateShareLinkDto) {
    const item = await this.assertSharing(userId, itemId);
    if (item.trashedAt) {
      throw new BadRequestException('Restore this item from the trash before sharing it');
    }
    const target = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { kind: true } });
    if (input.access === 'edit' && !pageKinds.includes(target.kind)) {
      throw new BadRequestException('Only pages and boards can be shared for editing');
    }
    const id = randomUUID();
    const minutes = input.expiresInMinutes === undefined ? (input.expiresInDays ?? 30) * dayMinutes : input.expiresInMinutes;
    const slug = input.slug ?? shortSlug();
    await this.releaseSlug(slug);
    const link = await this.prisma.shareLink
      .create({
        data: {
          id,
          itemId,
          access: input.access.toUpperCase() as ShareAccess,
          tokenHash: linkTokenHash(this.box.linkToken(id)),
          slug,
          expiresAt: minutes === null ? null : new Date(Date.now() + minutes * minuteMs),
          createdById: userId,
        },
        select: linkFields,
      })
      .catch(slugTaken);
    await this.audit.record(userId, 'share_link_created', { itemId, linkId: id, access: input.access });
    return this.present(link);
  }

  async list(userId: string, itemId: string) {
    await this.assertSharing(userId, itemId);
    const links = await this.prisma.shareLink.findMany({
      where: { itemId, ...unexpiredLink() },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: linkFields,
    });
    return links.map((link) => this.present(link));
  }

  async update(userId: string, itemId: string, linkId: string, input: UpdateShareLinkDto) {
    await this.assertSharing(userId, itemId);
    if (input.access === 'edit' && !pageKinds.includes((await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { kind: true } })).kind)) {
      throw new BadRequestException('Only pages and boards can be shared for editing');
    }
    if (input.slug) await this.releaseSlug(input.slug);
    const current = await this.prisma.shareLink.findFirst({ where: { id: linkId, itemId, ...unexpiredLink() }, select: { access: true } });
    const access = input.access?.toUpperCase() as ShareAccess | undefined;
    const updated = await this.prisma.shareLink.updateMany({ where: { id: linkId, itemId, ...unexpiredLink() }, data: { slug: input.slug, access } }).catch(slugTaken);
    if (!current || updated.count === 0) {
      throw new NotFoundException('That link is already turned off');
    }
    if (access && access !== current.access) {
      await this.audit.record(userId, 'share_link_access_changed', { itemId, linkId, access: input.access });
      this.realtime.closeShareLink(linkId);
    }
    return this.present(await this.prisma.shareLink.findUniqueOrThrow({ where: { id: linkId }, select: linkFields }));
  }

  async revoke(userId: string, itemId: string, linkId: string) {
    await this.assertSharing(userId, itemId);
    const revoked = await this.prisma.shareLink.updateMany({
      where: { id: linkId, itemId, revokedAt: null },
      data: { revokedAt: new Date(), slug: null },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('That link is already turned off');
    }
    await this.audit.record(userId, 'share_link_revoked', { itemId, linkId });
    this.realtime.closeShareLink(linkId);
  }

  async open(code: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { ...liveShareLink(code), item: { trashedAt: null } },
      select: {
        access: true,
        item: { select: { id: true, kind: true, title: true, event: true, pollOptions: { select: { id: true }, take: 1 }, noteDocument: { select: { state: true } }, databaseSchema: { select: { itemId: true } }, file: { select: { originalName: true, mimeType: true, sizeBytes: true } } } },
      },
    });
    if (!link) {
      throw new NotFoundException('This link has expired or was turned off');
    }
    const { item } = link;
    const state = item.noteDocument ? new Uint8Array(item.noteDocument.state) : null;
    return {
      access: link.access.toLowerCase(),
      item: { kind: item.kind.toLowerCase(), title: item.title },
      event: item.event ? publicEvent(item.title, item.event) : null,
      datePoll: item.pollOptions.length > 0,
      content:
        item.kind === ItemKind.NOTE
          ? { kind: 'note', id: item.id, state: state ? Buffer.from(state).toString('base64') : null, ...(item.databaseSchema ? { database: true } : {}) }
          : item.kind === ItemKind.BOARD
            ? { kind: 'board', id: item.id }
            : item.kind === ItemKind.FOLDER
              ? { kind: 'folder', id: item.id, name: item.title }
              : item.kind === ItemKind.TASK
                ? await this.task(item.id)
                : item.file
                  ? { kind: 'file', id: item.id, name: item.file.originalName, mimeType: item.file.mimeType, sizeBytes: item.file.sizeBytes }
                  : null,
    };
  }

  private async task(itemId: string) {
    const [task, attachments] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({
        where: { itemId },
        select: { status: true, type: true, priority: true, dueDate: true, dueTime: true, description: true, column: { select: { name: true } }, assignee: { select: { displayName: true } } },
      }),
      this.prisma.itemLink.findMany({
        where: { sourceItemId: itemId, kind: LinkKind.ATTACHMENT, target: { kind: ItemKind.FILE, trashedAt: null } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { target: { select: { id: true, file: { select: { originalName: true, mimeType: true, sizeBytes: true } } } } },
      }),
    ]);
    return {
      kind: 'task',
      id: itemId,
      status: task.status.toLowerCase(),
      column: task.column?.name ?? null,
      type: task.type,
      priority: task.priority,
      dueDate: dateText(task.dueDate),
      dueTime: task.dueTime,
      assignee: task.assignee?.displayName ?? null,
      description: task.description,
      attachments: attachments.flatMap(({ target }) => (target.file ? [{ id: target.id, name: target.file.originalName, mimeType: target.file.mimeType, sizeBytes: target.file.sizeBytes }] : [])),
    };
  }

  async folder(code: string, folderId?: string) {
    const link = await this.prisma.shareLink.findFirst({ where: { ...liveShareLink(code), item: { trashedAt: null, kind: ItemKind.FOLDER } }, select: { itemId: true } });
    const target = folderId ?? link?.itemId;
    const path = link && target ? await this.drive.ancestors(target, link.itemId) : null;
    if (!link || !target || !path || (await this.prisma.item.count({ where: { id: target, kind: ItemKind.FOLDER } })) === 0) {
      throw new NotFoundException('This link has expired or was turned off');
    }
    const entries = await this.drive.entries({ folderId: target });
    return { path, entries: entries.map(({ shared: _shared, ...entry }) => entry) };
  }

  private async assertSharing(userId: string, itemId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, select: { kind: true } });
    if (!item) throw new NotFoundException('Item not found');
    return pageKinds.includes(item.kind) ? this.pages.assertPage(userId, itemId, 'share') : this.access.assertItem(userId, itemId, 'edit');
  }

  private async releaseSlug(slug: string) {
    await this.prisma.shareLink.updateMany({ where: { slug, NOT: unexpiredLink() }, data: { slug: null } });
  }

  private present(link: Prisma.ShareLinkGetPayload<{ select: typeof linkFields }>) {
    const token = this.box.linkToken(link.id);
    return {
      id: link.id,
      access: link.access.toLowerCase(),
      slug: link.slug,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      link: linkTokenHash(token) === link.tokenHash ? this.mail.link(`/share/${token}`) : null,
      shortLink: link.slug ? this.mail.link(`/s/${link.slug}`) : null,
    };
  }

  async file(code: string, fileId: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { ...liveShareLink(code), item: { trashedAt: null } },
      select: { itemId: true, item: { select: { spaceId: true, kind: true } } },
    });
    if (link?.itemId === fileId && link.item.kind === ItemKind.FILE) return this.files.read(fileId);
    if (link?.item.kind === ItemKind.FOLDER) {
      const inside = (await this.prisma.item.count({ where: { id: fileId, kind: ItemKind.FILE, trashedAt: null } })) > 0 && (await this.drive.ancestors(fileId, link.itemId)) !== null;
      if (!inside) throw new NotFoundException('That file is not part of this link');
      return this.files.read(fileId);
    }
    const document = link && this.realtime.hocuspocus.documents.get(link.itemId);
    const attached =
      link &&
      (document
        ? documentLinks(document).files.has(fileId) && await this.prisma.item.findFirst({
            where: { id: fileId, kind: ItemKind.FILE, trashedAt: null, spaceId: link.item.spaceId },
            select: { id: true },
          })
        : await this.prisma.itemLink.findFirst({
            where: { sourceItemId: link.itemId, targetItemId: fileId, kind: LinkKind.ATTACHMENT, target: { trashedAt: null, spaceId: link.item.spaceId } },
            select: { id: true },
          }));
    if (!attached) throw new NotFoundException('That file is not part of this link');
    return this.files.read(fileId);
  }
}
