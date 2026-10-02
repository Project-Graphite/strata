import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShareAccess } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { linkTokenHash, newLinkToken } from '../crypto/link-token';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShareLinkDto } from './dto/share-links.dto';

const dayMs = 24 * 60 * 60 * 1000;

const linkFields = { id: true, access: true, expiresAt: true, createdAt: true } satisfies Prisma.ShareLinkSelect;

function presentLink(link: Prisma.ShareLinkGetPayload<{ select: typeof linkFields }>) {
  return { id: link.id, access: link.access.toLowerCase(), expiresAt: link.expiresAt, createdAt: link.createdAt };
}

@Injectable()
export class ShareLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mail: MailService,
  ) {}

  async create(userId: string, itemId: string, input: CreateShareLinkDto) {
    const item = await this.access.assertItem(userId, itemId, 'edit');
    if (item.trashedAt) {
      throw new BadRequestException('Restore this item from the trash before sharing it');
    }
    const { token, tokenHash } = newLinkToken();
    const link = await this.prisma.shareLink.create({
      data: {
        itemId,
        access: input.access.toUpperCase() as ShareAccess,
        tokenHash,
        expiresAt: new Date(Date.now() + (input.expiresInDays ?? 30) * dayMs),
        createdById: userId,
      },
      select: linkFields,
    });
    return { ...presentLink(link), link: this.mail.link(`/share/${token}`) };
  }

  async list(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'edit');
    const links = await this.prisma.shareLink.findMany({
      where: { itemId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: linkFields,
    });
    return links.map(presentLink);
  }

  async revoke(userId: string, itemId: string, linkId: string) {
    await this.access.assertItem(userId, itemId, 'edit');
    const revoked = await this.prisma.shareLink.updateMany({
      where: { id: linkId, itemId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('That link is already turned off');
    }
  }

  async open(code: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: linkTokenHash(code), revokedAt: null, expiresAt: { gt: new Date() }, item: { trashedAt: null } },
      select: { access: true, item: { select: { kind: true, title: true } } },
    });
    if (!link) {
      throw new NotFoundException('This link has expired or was turned off');
    }
    return {
      access: link.access.toLowerCase(),
      item: { kind: link.item.kind.toLowerCase(), title: link.item.title },
    };
  }
}
