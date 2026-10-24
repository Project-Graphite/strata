import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PageRole, Prisma } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SavePageGrantDto } from './dto/page-grants.dto';
import { PageAccessService } from './page-access.service';

const grantFields = { userId: true, role: true, user: { select: { displayName: true, email: true } } } satisfies Prisma.PageGrantSelect;

function present(grant: Prisma.PageGrantGetPayload<{ select: typeof grantFields }>) {
  return { userId: grant.userId, role: grant.role.toLowerCase(), name: grant.user.displayName, email: grant.user.email };
}

@Injectable()
export class PageGrantsService {
  constructor(private readonly prisma: PrismaService, private readonly pages: PageAccessService, private readonly realtime: RealtimeService, private readonly changes: ChangesService) {}

  async list(userId: string, itemId: string) {
    const page = await this.pages.assertPage(userId, itemId, 'share');
    return { permissions: page.permissions, people: (await this.prisma.pageGrant.findMany({ where: { itemId }, select: grantFields, orderBy: { createdAt: 'asc' } })).map(present) };
  }

  async save(userId: string, itemId: string, input: SavePageGrantDto) {
    const grant = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "items" WHERE "id" = ${itemId}::uuid FOR UPDATE`;
      const page = await this.pages.assertPage(userId, itemId, 'share', transaction);
      if (page.trashedAt || page.archivedAt) throw new BadRequestException('Restore this page before sharing it');
      const recipient = await transaction.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true } });
      if (!recipient) throw new NotFoundException('Use the email address of an existing Strata account');
      if (recipient.id === userId) throw new BadRequestException('Ask another page manager to change your access');
      if (!(await transaction.pageGrant.findUnique({ where: { itemId_userId: { itemId, userId: recipient.id } }, select: { userId: true } })) && await transaction.pageGrant.count({ where: { itemId } }) >= 100) throw new ConflictException('A page can be shared directly with 100 people');
      return transaction.pageGrant.upsert({ where: { itemId_userId: { itemId, userId: recipient.id } }, create: { itemId, userId: recipient.id, role: input.role.toUpperCase() as PageRole, createdById: userId }, update: { role: input.role.toUpperCase() as PageRole }, select: grantFields });
    });
    this.realtime.closePageMember(itemId, grant.userId);
    this.changes.notify('pages', { userId: grant.userId, itemId });
    this.changes.notify('page-details', { userId: grant.userId, itemId });
    return present(grant);
  }

  async remove(userId: string, itemId: string, recipientId: string) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "items" WHERE "id" = ${itemId}::uuid FOR UPDATE`;
      await this.pages.assertPage(userId, itemId, 'share', transaction);
      if (userId === recipientId) throw new BadRequestException('Ask another page manager to change your access');
      if (!(await transaction.pageGrant.deleteMany({ where: { itemId, userId: recipientId } })).count) throw new NotFoundException('That page grant is already removed');
    });
    this.realtime.closePageMember(itemId, recipientId);
    this.changes.notify('pages', { userId: recipientId, itemId });
    this.changes.notify('page-details', { userId: recipientId, itemId });
  }
}
