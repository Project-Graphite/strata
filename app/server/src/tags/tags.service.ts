import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { uniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';

export const tagFields = { id: true, spaceId: true, name: true, color: true } satisfies Prisma.TagSelect;

export function presentTag(tag: Prisma.TagGetPayload<{ select: typeof tagFields }>) {
  return { id: tag.id, spaceId: tag.spaceId, name: tag.name, color: tag.color };
}

function nameTaken(error: unknown): never {
  if (uniqueViolation(error)) {
    throw new ConflictException('There is already a tag with that name here');
  }
  throw error;
}

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.listed({ spaceId });
  }

  mine(userId: string) {
    return this.listed({ ownerId: userId });
  }

  async create(userId: string, spaceId: string, input: CreateTagDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const [tag] = await this.prisma
      .$transaction([
        this.prisma.tag.create({ data: { spaceId, name: input.name, color: input.color }, select: tagFields }),
        this.activity.record(this.prisma, { spaceId, actorId: userId, verb: 'tag.created', data: { name: input.name } }),
      ])
      .catch(nameTaken);
    return presentTag(tag);
  }

  async createMine(userId: string, input: CreateTagDto) {
    const tag = await this.prisma.tag.create({ data: { ownerId: userId, name: input.name, color: input.color }, select: tagFields }).catch(nameTaken);
    return presentTag(tag);
  }

  async update(userId: string, tagId: string, input: UpdateTagDto) {
    const { spaceId } = await this.editable(userId, tagId);
    const [tag] = await this.prisma
      .$transaction([
        this.prisma.tag.update({ where: { id: tagId }, data: { name: input.name, color: input.color }, select: tagFields }),
        ...(spaceId
          ? [
              this.activity.record(this.prisma, {
                spaceId,
                actorId: userId,
                verb: 'tag.updated',
                data: { ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}) },
              }),
            ]
          : []),
      ])
      .catch(nameTaken);
    return presentTag(tag);
  }

  async remove(userId: string, tagId: string) {
    const { spaceId } = await this.editable(userId, tagId);
    await this.prisma.$transaction(async (transaction) => {
      const tag = await transaction.tag.findUnique({ where: { id: tagId }, select: { name: true } });
      const deleted = await transaction.tag.deleteMany({ where: { id: tagId } });
      if (tag && deleted.count === 1 && spaceId) {
        await this.activity.record(transaction, { spaceId, actorId: userId, verb: 'tag.deleted', data: { name: tag.name } });
      }
    });
  }

  private async listed(where: Prisma.TagWhereInput) {
    const tags = await this.prisma.tag.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: tagFields });
    return tags.map(presentTag);
  }

  private async editable(userId: string, tagId: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, OR: [{ space: this.access.spacesOf(userId) }, { ownerId: userId }] },
      select: { spaceId: true },
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    if (tag.spaceId) await this.access.assertSpace(userId, tag.spaceId, 'edit');
    return tag;
  }
}
