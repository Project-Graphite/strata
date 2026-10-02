import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { uniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';

export const tagFields = { id: true, spaceId: true, name: true, color: true } satisfies Prisma.TagSelect;

export function presentTag(tag: Prisma.TagGetPayload<{ select: typeof tagFields }>) {
  return { id: tag.id, spaceId: tag.spaceId, name: tag.name, color: tag.color };
}

function nameTaken(error: unknown): never {
  if (uniqueViolation(error)) {
    throw new ConflictException('This space already has a tag with that name');
  }
  throw error;
}

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const tags = await this.prisma.tag.findMany({
      where: { spaceId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: tagFields,
    });
    return tags.map(presentTag);
  }

  async create(userId: string, spaceId: string, input: CreateTagDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const tag = await this.prisma.tag
      .create({ data: { spaceId, name: input.name, color: input.color }, select: tagFields })
      .catch(nameTaken);
    return presentTag(tag);
  }

  async update(userId: string, tagId: string, input: UpdateTagDto) {
    const spaceId = await this.editableSpaceOf(userId, tagId);
    const tag = await this.prisma.tag
      .update({ where: { id: tagId, spaceId }, data: { name: input.name, color: input.color }, select: tagFields })
      .catch(nameTaken);
    return presentTag(tag);
  }

  async remove(userId: string, tagId: string) {
    const spaceId = await this.editableSpaceOf(userId, tagId);
    await this.prisma.tag.deleteMany({ where: { id: tagId, spaceId } });
  }

  private async editableSpaceOf(userId: string, tagId: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, space: this.access.spacesOf(userId) },
      select: { spaceId: true },
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    await this.access.assertSpace(userId, tag.spaceId, 'edit');
    return tag.spaceId;
  }
}
