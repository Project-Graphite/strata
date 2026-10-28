import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCostSplitDto } from './dto/cost-splits.dto';

@Injectable()
export class CostSplitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async save(userId: string, itemId: string, input: SaveCostSplitDto) {
    const item = await this.access.assertItem(userId, itemId, 'edit');
    const splittable = await this.prisma.item.count({ where: { id: itemId, kind: ItemKind.SUBSCRIPTION } });
    if (!splittable) throw new NotFoundException('Only subscriptions can be split');
    const people = new Set(input.shares.map((share) => share.userId));
    if (people.size !== input.shares.length) throw new BadRequestException('Each member can have one share');
    const members = await this.members(item.spaceId);
    if (![...people, input.payerId].every((id) => members.has(id))) throw new BadRequestException('Split only between members of this space');
    await this.prisma.$transaction([
      this.prisma.costSplit.deleteMany({ where: { itemId } }),
      this.prisma.costSplit.create({ data: { itemId, payerId: input.payerId, shares: { createMany: { data: input.shares } } } }),
    ]);
    return this.prisma.costSplit.findUniqueOrThrow({
      where: { itemId },
      select: { payerId: true, shares: { select: { userId: true, weight: true }, orderBy: { userId: 'asc' } } },
    });
  }

  async remove(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'edit');
    await this.prisma.costSplit.deleteMany({ where: { itemId } });
  }

  private async members(spaceId: string) {
    const rows = await this.prisma.spaceMember.findMany({ where: { spaceId }, select: { userId: true } });
    return new Set(rows.map((row) => row.userId));
  }
}
