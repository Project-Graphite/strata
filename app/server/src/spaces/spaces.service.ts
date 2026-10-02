import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpaceDto, UpdateMemberDto, UpdateSpaceDto } from './dto/spaces.dto';

const spaceFields = {
  id: true,
  name: true,
  color: true,
  personalOwnerId: true,
  createdAt: true,
} satisfies Prisma.SpaceSelect;

const memberFields = {
  role: true,
  joinedAt: true,
  user: { select: { id: true, handle: true, displayName: true } },
} satisfies Prisma.SpaceMemberSelect;

function presentSpace(space: Prisma.SpaceGetPayload<{ select: typeof spaceFields }>, role: SpaceRole) {
  return {
    id: space.id,
    name: space.name,
    color: space.color,
    kind: space.personalOwnerId ? 'personal' : 'shared',
    role: role.toLowerCase(),
    createdAt: space.createdAt,
  };
}

function presentMember(member: Prisma.SpaceMemberGetPayload<{ select: typeof memberFields }>) {
  return {
    userId: member.user.id,
    handle: member.user.handle,
    displayName: member.user.displayName,
    role: member.role.toLowerCase(),
    joinedAt: member.joinedAt,
  };
}

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(userId: string) {
    const memberships = await this.prisma.spaceMember.findMany({
      where: { userId },
      select: { role: true, space: { select: spaceFields } },
    });
    return memberships
      .map((membership) => presentSpace(membership.space, membership.role))
      .sort((a, b) => Number(b.kind === 'personal') - Number(a.kind === 'personal') || a.name.localeCompare(b.name));
  }

  async get(userId: string, spaceId: string) {
    const role = await this.access.assertSpace(userId, spaceId, 'read');
    const space = await this.prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: spaceFields });
    return presentSpace(space, role);
  }

  async create(userId: string, input: CreateSpaceDto) {
    const space = await this.prisma.space.create({
      data: {
        name: input.name,
        color: input.color,
        createdById: userId,
        members: { create: { userId, role: SpaceRole.OWNER } },
      },
      select: spaceFields,
    });
    return presentSpace(space, SpaceRole.OWNER);
  }

  async update(userId: string, spaceId: string, input: UpdateSpaceDto) {
    const role = await this.access.assertSpace(userId, spaceId, 'manage');
    const space = await this.prisma.space.update({
      where: { id: spaceId },
      data: { name: input.name, color: input.color },
      select: spaceFields,
    });
    return presentSpace(space, role);
  }

  async remove(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'manage');
    const deleted = await this.prisma.space.deleteMany({ where: { id: spaceId, personalOwnerId: null } });
    if (deleted.count === 0) {
      throw new BadRequestException('Your personal space cannot be deleted');
    }
  }

  async members(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const members = await this.prisma.spaceMember.findMany({
      where: { spaceId },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      select: memberFields,
    });
    return members.map(presentMember);
  }

  async changeRole(userId: string, spaceId: string, memberId: string, input: UpdateMemberDto) {
    await this.access.assertSpace(userId, spaceId, 'manage');
    return this.keepingAnOwner(spaceId, async (transaction) => {
      const changed = await transaction.spaceMember.updateMany({
        where: { spaceId, userId: memberId },
        data: { role: input.role.toUpperCase() as SpaceRole },
      });
      if (changed.count === 0) {
        throw new NotFoundException('That person is not a member of this space');
      }
      return presentMember(
        await transaction.spaceMember.findUniqueOrThrow({
          where: { spaceId_userId: { spaceId, userId: memberId } },
          select: memberFields,
        }),
      );
    });
  }

  async removeMember(userId: string, spaceId: string, memberId: string) {
    await this.access.assertSpace(userId, spaceId, memberId === userId ? 'read' : 'manage');
    await this.keepingAnOwner(spaceId, async (transaction) => {
      const removed = await transaction.spaceMember.deleteMany({ where: { spaceId, userId: memberId } });
      if (removed.count === 0) {
        throw new NotFoundException('That person is not a member of this space');
      }
    });
  }

  private keepingAnOwner<T>(spaceId: string, change: (transaction: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "spaces" WHERE "id" = ${spaceId}::uuid FOR UPDATE`;
      const result = await change(transaction);
      if ((await transaction.spaceMember.count({ where: { spaceId, role: SpaceRole.OWNER } })) === 0) {
        throw new ConflictException('A space needs an owner. Make someone else an owner first.');
      }
      return result;
    });
  }
}
