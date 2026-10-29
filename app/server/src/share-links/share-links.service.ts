import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, LinkKind, Prisma, ShareAccess } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { linkTokenHash } from '../crypto/link-token';
import { SecretBox } from '../crypto/secret-box.service';
import { publicEvent } from '../events/events.service';
import { FilesService } from '../files/files.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { documentLinks, pageKinds } from '../notes/document-text';
import { CreateShareLinkDto } from './dto/share-links.dto';
import { PageAccessService } from '../notes/page-access.service';

const dayMs = 24 * 60 * 60 * 1000;

const linkFields = { id: true, access: true, tokenHash: true, expiresAt: true, createdAt: true } satisfies Prisma.ShareLinkSelect;

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
  ) {}

  async create(userId: string, itemId: string, input: CreateShareLinkDto) {
    const item = await this.assertSharing(userId, itemId);
    if (item.trashedAt) {
      throw new BadRequestException('Restore this item from the trash before sharing it');
    }
    if (input.access === 'edit' && !pageKinds.includes((await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { kind: true } })).kind)) {
      throw new BadRequestException('Only pages and boards can be shared for editing');
    }
    const id = randomUUID();
    const link = await this.prisma.shareLink.create({
      data: {
        id,
        itemId,
        access: input.access.toUpperCase() as ShareAccess,
        tokenHash: linkTokenHash(this.box.linkToken(id)),
        expiresAt: new Date(Date.now() + (input.expiresInDays ?? 30) * dayMs),
        createdById: userId,
      },
      select: linkFields,
    });
    await this.audit.record(userId, 'share_link_created', { itemId, linkId: id, access: input.access });
    return this.present(link);
  }

  async list(userId: string, itemId: string) {
    await this.assertSharing(userId, itemId);
    const links = await this.prisma.shareLink.findMany({
      where: { itemId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: linkFields,
    });
    return links.map((link) => this.present(link));
  }

  async revoke(userId: string, itemId: string, linkId: string) {
    await this.assertSharing(userId, itemId);
    const revoked = await this.prisma.shareLink.updateMany({
      where: { id: linkId, itemId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('That link is already turned off');
    }
    await this.audit.record(userId, 'share_link_revoked', { itemId, linkId });
    this.realtime.closeShareLink(linkId);
  }

  async open(code: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: linkTokenHash(code), revokedAt: null, expiresAt: { gt: new Date() }, item: { trashedAt: null } },
      select: {
        access: true,
        item: { select: { id: true, kind: true, title: true, event: true, pollOptions: { select: { id: true }, take: 1 }, noteDocument: { select: { state: true } }, databaseSchema: { select: { itemId: true } } } },
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
            : null,
    };
  }

  private async assertSharing(userId: string, itemId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, select: { kind: true } });
    if (!item) throw new NotFoundException('Item not found');
    return pageKinds.includes(item.kind) ? this.pages.assertPage(userId, itemId, 'share') : this.access.assertItem(userId, itemId, 'edit');
  }

  private present(link: Prisma.ShareLinkGetPayload<{ select: typeof linkFields }>) {
    const token = this.box.linkToken(link.id);
    return {
      id: link.id,
      access: link.access.toLowerCase(),
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      link: linkTokenHash(token) === link.tokenHash ? this.mail.link(`/share/${token}`) : null,
    };
  }

  async file(code: string, fileId: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: linkTokenHash(code), revokedAt: null, expiresAt: { gt: new Date() }, item: { trashedAt: null } },
      select: { itemId: true, item: { select: { spaceId: true } } },
    });
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
