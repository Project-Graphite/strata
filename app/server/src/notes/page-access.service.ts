import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, PageRole, Prisma, SpaceRole } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { pagePermissions } from '../access/page-permissions';
import { PrismaService } from '../prisma/prisma.service';
import { pageKinds } from './document-text';

export type PageAccess = 'read' | 'comment' | 'edit' | 'share';

const pageRoles: Record<PageAccess, PageRole[]> = {
  read: [PageRole.VIEW, PageRole.COMMENT, PageRole.EDIT, PageRole.MANAGE],
  comment: [PageRole.COMMENT, PageRole.EDIT, PageRole.MANAGE],
  edit: [PageRole.EDIT, PageRole.MANAGE],
  share: [PageRole.MANAGE],
};

@Injectable()
export class PageAccessService {
  constructor(private readonly prisma: PrismaService, private readonly spaces: AccessService) {}

  pagesOf(userId: string, access: PageAccess = 'read'): Prisma.ItemWhereInput {
    return { AND: [
      { kind: { in: pageKinds } },
      { OR: [
        { space: this.spaces.spacesOf(userId, access === 'read' || access === 'comment' ? 'read' : 'edit') },
        { trashedAt: null, archivedAt: null, pageGrants: { some: { userId, role: { in: pageRoles[access] } } } },
      ] },
    ] };
  }

  async assertReference(userId: string, itemId: string, access: 'read' | 'edit') {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, select: { kind: true } });
    if (!item) throw new NotFoundException('Item not found');
    return item.kind === ItemKind.NOTE || item.kind === ItemKind.BOARD ? this.assertPage(userId, itemId, access) : this.spaces.assertItem(userId, itemId, access);
  }

  async assertPage(userId: string, itemId: string, access: PageAccess, transaction: Prisma.TransactionClient = this.prisma) {
    const item = await transaction.item.findUnique({
      where: { id: itemId },
      select: {
        id: true, kind: true, spaceId: true, title: true, trashedAt: true, archivedAt: true,
        note: { select: { quick: true } },
        pageGrants: { where: { userId }, select: { role: true } },
        space: { select: { members: { where: { userId }, select: { role: true } } } },
      },
    });
    if (!item || !pageKinds.includes(item.kind)) throw new NotFoundException('Page not found');
    const spaceRole = item.space.members[0]?.role ?? null;
    const pageRole = !item.trashedAt && !item.archivedAt ? item.pageGrants[0]?.role ?? null : null;
    if (!spaceRole && !pageRole) throw new NotFoundException('Page not found');
    const permissions = pagePermissions(spaceRole, pageRole);
    if (access !== 'read' && !permissions[access]) throw new ForbiddenException(access === 'share' ? 'You cannot manage sharing for this page' : access === 'comment' ? 'This page is view only' : 'You cannot edit this page');
    return {
      id: item.id, spaceId: item.spaceId, kind: item.kind, title: item.title, trashedAt: item.trashedAt, archivedAt: item.archivedAt,
      quick: item.note?.quick ?? false,
      role: spaceRole === SpaceRole.OWNER ? SpaceRole.OWNER : permissions.edit ? SpaceRole.EDITOR : SpaceRole.VIEWER,
      permissions,
    };
  }
}
