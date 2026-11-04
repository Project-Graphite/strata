import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { isUUID } from 'class-validator';
import { AccessService, reachable } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { auditEvent } from '../audit/audit.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { uniqueViolation } from '../prisma/errors';
import { CreateSpaceDto, UpdateMemberDto, UpdateSpaceDto, UpdateSpaceSettingsDto } from './dto/spaces.dto';
import { mergedDefaults, spaceDefaults } from './space-defaults';

const spaceFields = {
  id: true,
  name: true,
  slug: true,
  color: true,
  description: true,
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
    slug: space.slug,
    name: space.name,
    color: space.color,
    description: space.description,
    role: role.toLowerCase(),
    createdAt: space.createdAt,
  };
}

const slugAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

const newSlug = () => Array.from(randomBytes(10), (byte) => slugAlphabet[byte % slugAlphabet.length]).join('');

function presentSettings(space: { id: string; slug: string; name: string; color: string; description: string; defaults: Prisma.JsonValue }) {
  return { id: space.id, slug: space.slug, name: space.name, color: space.color, description: space.description, defaults: spaceDefaults(space.defaults) };
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
    private readonly activity: ActivityService,
    private readonly inbox: InboxService,
  ) {}

  async list(userId: string) {
    const memberships = await this.prisma.spaceMember.findMany({
      where: { userId, space: this.access.spacesOf(userId) },
      select: { role: true, space: { select: spaceFields } },
    });
    return memberships
      .map((membership) => presentSpace(membership.space, membership.role))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(userId: string, idOrSlug: string) {
    const found = isUUID(idOrSlug) ? { id: idOrSlug } : await this.prisma.space.findUnique({ where: { slug: idOrSlug }, select: { id: true } });
    if (!found) throw new NotFoundException('Space not found');
    const role = await this.access.assertSpace(userId, found.id, 'read');
    const space = await this.prisma.space.findUniqueOrThrow({ where: { id: found.id }, select: spaceFields });
    return presentSpace(space, role);
  }

  async create(userId: string, input: CreateSpaceDto) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const space = await this.prisma.space.create({
          data: {
            name: input.name,
            slug: newSlug(),
            color: input.color,
            createdById: userId,
            members: { create: { userId, role: SpaceRole.OWNER } },
          },
          select: spaceFields,
        });
        return presentSpace(space, SpaceRole.OWNER);
      } catch (error) {
        if (!uniqueViolation(error) || attempt === 3) throw error;
      }
    }
  }

  async settings(userId: string, spaceId: string) {
    await this.assertOwner(userId, spaceId);
    return presentSettings(await this.prisma.space.findUniqueOrThrow({ where: { id: spaceId } }));
  }

  async updateSettings(userId: string, spaceId: string, input: UpdateSpaceSettingsDto) {
    await this.assertOwner(userId, spaceId);
    const current = await this.prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { defaults: true } });
    const [space] = await this.prisma.$transaction([
      this.prisma.space.update({
        where: { id: spaceId },
        data: {
          name: input.name,
          color: input.color,
          description: input.description,
          defaults: input.defaults ? { ...mergedDefaults(current.defaults, input.defaults) } : undefined,
        },
      }),
      this.activity.record(this.prisma, {
        spaceId,
        actorId: userId,
        verb: 'space.updated',
        data: { ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}) },
      }),
    ]);
    return presentSettings(space);
  }

  private async assertOwner(userId: string, spaceId: string) {
    const member = await this.prisma.spaceMember.findUnique({ where: { spaceId_userId: { spaceId, userId } }, select: { role: true } });
    if (member?.role !== SpaceRole.OWNER || !reachable(spaceId)) throw new NotFoundException('Space not found');
  }

  async update(userId: string, spaceId: string, input: UpdateSpaceDto) {
    const role = await this.access.assertSpace(userId, spaceId, 'manage');
    const [space] = await this.prisma.$transaction([
      this.prisma.space.update({
        where: { id: spaceId },
        data: { name: input.name, color: input.color },
        select: spaceFields,
      }),
      this.activity.record(this.prisma, {
        spaceId,
        actorId: userId,
        verb: 'space.updated',
        data: { ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}) },
      }),
    ]);
    return presentSpace(space, role);
  }

  async remove(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'manage');
    await this.prisma.space.deleteMany({ where: { id: spaceId } });
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
      await this.revokeWhatTheyCannotGrant(transaction, spaceId, memberId, input.role.toUpperCase() as SpaceRole);
      const member = await transaction.spaceMember.findUniqueOrThrow({
        where: { spaceId_userId: { spaceId, userId: memberId } },
        select: { ...memberFields, space: { select: { name: true } } },
      });
      await this.activity.record(transaction, {
        spaceId,
        actorId: userId,
        verb: 'member.role_changed',
        data: { member: member.user.displayName, role: input.role },
      });
      await transaction.auditEvent.create({ data: auditEvent(userId, 'member_role_changed', { spaceId, memberId, role: input.role }) });
      if (memberId !== userId) {
        await this.inbox.notify(transaction, [
          {
            userId: memberId,
            kind: 'role_changed',
            title: `You are now ${input.role === 'viewer' ? 'a viewer' : `an ${input.role}`} in ${member.space.name}`,
            link: `/spaces/${spaceId}`,
          },
        ]);
      }
      return presentMember(member);
    });
  }

  async removeMember(userId: string, spaceId: string, memberId: string) {
    await this.access.assertSpace(userId, spaceId, memberId === userId ? 'read' : 'manage');
    await this.keepingAnOwner(spaceId, async (transaction) => {
      const member = await transaction.spaceMember.findUnique({
        where: { spaceId_userId: { spaceId, userId: memberId } },
        select: { user: { select: { displayName: true } }, space: { select: { name: true } } },
      });
      if (!member) {
        throw new NotFoundException('That person is not a member of this space');
      }
      await transaction.spaceMember.delete({ where: { spaceId_userId: { spaceId, userId: memberId } } });
      await this.revokeWhatTheyCannotGrant(transaction, spaceId, memberId, null);
      await this.activity.record(transaction, {
        spaceId,
        actorId: userId,
        verb: memberId === userId ? 'member.left' : 'member.removed',
        data: { member: member.user.displayName },
      });
      if (memberId !== userId) {
        await this.inbox.notify(transaction, [
          { userId: memberId, kind: 'removed_from_space', title: `You were removed from ${member.space.name}` },
        ]);
      }
    });
  }

  private async revokeWhatTheyCannotGrant(transaction: Prisma.TransactionClient, spaceId: string, memberId: string, role: SpaceRole | null) {
    const revokedAt = new Date();
    if (role !== SpaceRole.OWNER) {
      await transaction.invitation.updateMany({ where: { spaceId, inviterId: memberId, revokedAt: null }, data: { revokedAt } });
    }
    if (role === null || role === SpaceRole.VIEWER) {
      await transaction.shareLink.updateMany({ where: { createdById: memberId, revokedAt: null, item: { spaceId } }, data: { revokedAt } });
    }
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
