import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { requestContext } from '../http/request-context';
import { PrismaService } from '../prisma/prisma.service';

export type Access = 'read' | 'edit' | 'manage';

const rolesFor: Record<Access, SpaceRole[]> = {
  read: [SpaceRole.OWNER, SpaceRole.EDITOR, SpaceRole.VIEWER],
  edit: [SpaceRole.OWNER, SpaceRole.EDITOR],
  manage: [SpaceRole.OWNER],
};

const refusals: Record<Exclude<Access, 'read'>, string> = {
  edit: 'Viewers cannot change this space',
  manage: 'Only owners can manage this space',
};

const pinnedSpace = () => (requestContext.getStore()?.request as AuthenticatedRequest | undefined)?.user?.tokenSpaceId ?? null;

export function reachable(spaceId: string | null) {
  const pinned = pinnedSpace();
  return !pinned || pinned === spaceId;
}

const nothing: Prisma.ItemWhereInput = { id: { in: [] } };

export type Home = { spaceId: string; ownerId: null } | { spaceId: null; ownerId: string };

export function homeOf(item: { spaceId: string | null; ownerId: string | null }): Home {
  return item.spaceId ? { spaceId: item.spaceId, ownerId: null } : { spaceId: null, ownerId: item.ownerId! };
}

export const inHome = (home: Home) => (home.spaceId === null ? { ownerId: home.ownerId } : { spaceId: home.spaceId });

export const audienceOf = (home: Home) => (home.spaceId === null ? { userId: home.ownerId } : { spaceId: home.spaceId });

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  spacesOf(userId: string, access: Access = 'read'): Prisma.SpaceWhereInput {
    const pinned = pinnedSpace();
    return { ...(pinned ? { id: pinned } : {}), members: { some: { userId, role: { in: rolesFor[access] } } } };
  }

  ownedBy(userId: string): Prisma.ItemWhereInput {
    return pinnedSpace() ? nothing : { ownerId: userId };
  }

  spaceItemsOf(userId: string, access: Access = 'read'): Prisma.ItemWhereInput {
    return { space: this.spacesOf(userId, access) };
  }

  itemsOf(userId: string, access: Access = 'read'): Prisma.ItemWhereInput {
    return { OR: [this.spaceItemsOf(userId, access), this.ownedBy(userId)] };
  }

  async assertSpace(userId: string, spaceId: string, access: Access) {
    const member = await this.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { role: true },
    });
    if (!member || !reachable(spaceId)) {
      throw new NotFoundException('Space not found');
    }
    this.assertRole(member.role, access);
    return member.role;
  }

  async assertHome(userId: string, spaceId: string | null, access: Access): Promise<Home> {
    if (spaceId) {
      await this.assertSpace(userId, spaceId, access);
      return { spaceId, ownerId: null };
    }
    if (!reachable(null)) throw new NotFoundException('Space not found');
    return { spaceId: null, ownerId: userId };
  }

  scopeOf(userId: string, query: { spaceId?: string; home?: 'account' }): Prisma.ItemWhereInput {
    if (query.home === 'account') return this.ownedBy(userId);
    return query.spaceId ? { ...this.spaceItemsOf(userId), spaceId: query.spaceId } : this.itemsOf(userId);
  }

  async isMember(userId: string, spaceId: string) {
    return reachable(spaceId) && (await this.prisma.spaceMember.count({ where: { spaceId, userId } })) > 0;
  }

  async assertItem(userId: string, itemId: string, access: Access) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        spaceId: true,
        ownerId: true,
        title: true,
        trashedAt: true,
        space: { select: { members: { where: { userId }, select: { role: true } } } },
      },
    });
    const role = item?.space?.members[0]?.role ?? (item?.ownerId === userId && reachable(null) ? SpaceRole.OWNER : undefined);
    if (!item || !role || !reachable(item.spaceId)) {
      throw new NotFoundException('Item not found');
    }
    this.assertRole(role, access);
    return { id: item.id, spaceId: item.spaceId, ownerId: item.ownerId, title: item.title, trashedAt: item.trashedAt, role };
  }

  private assertRole(role: SpaceRole, access: Access) {
    if (access !== 'read' && !rolesFor[access].includes(role)) {
      throw new ForbiddenException(refusals[access]);
    }
  }
}
