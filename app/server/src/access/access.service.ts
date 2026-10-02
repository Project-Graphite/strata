import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
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

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  spacesOf(userId: string, access: Access = 'read'): Prisma.SpaceWhereInput {
    return { members: { some: { userId, role: { in: rolesFor[access] } } } };
  }

  itemsOf(userId: string, access: Access = 'read'): Prisma.ItemWhereInput {
    return { space: this.spacesOf(userId, access) };
  }

  async assertSpace(userId: string, spaceId: string, access: Access) {
    const member = await this.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { role: true },
    });
    if (!member) {
      throw new NotFoundException('Space not found');
    }
    this.assertRole(member.role, access);
    return member.role;
  }

  async assertItem(userId: string, itemId: string, access: Access) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        spaceId: true,
        trashedAt: true,
        space: { select: { members: { where: { userId }, select: { role: true } } } },
      },
    });
    const role = item?.space.members[0]?.role;
    if (!item || !role) {
      throw new NotFoundException('Item not found');
    }
    this.assertRole(role, access);
    return { id: item.id, spaceId: item.spaceId, trashedAt: item.trashedAt, role };
  }

  private assertRole(role: SpaceRole, access: Access) {
    if (access !== 'read' && !rolesFor[access].includes(role)) {
      throw new ForbiddenException(refusals[access]);
    }
  }
}
