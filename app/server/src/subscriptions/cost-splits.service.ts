import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText } from '../recurrence/dates';
import { BalancesQueryDto, CreateSettlementDto, SaveCostSplitDto } from './dto/cost-splits.dto';
import { renewalsBetween } from './subscriptions.service';

function nextMonth(month: string) {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
}

@Injectable()
export class CostSplitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async save(userId: string, itemId: string, input: SaveCostSplitDto) {
    const item = await this.access.assertItem(userId, itemId, 'edit');
    if (!(await this.prisma.subscription.count({ where: { itemId } }))) throw new NotFoundException('That item is not a subscription');
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

  async balances(userId: string, spaceId: string, { month }: BalancesQueryDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const from = `${month}-01`;
    const to = `${nextMonth(month)}-01`;
    const [splits, settlements, members] = await Promise.all([
      this.prisma.costSplit.findMany({
        where: { item: { spaceId, kind: ItemKind.SUBSCRIPTION, trashedAt: null } },
        orderBy: { item: { title: 'asc' } },
        select: { itemId: true, payerId: true, shares: { select: { userId: true, weight: true } }, item: { select: { title: true, subscription: true } } },
      }),
      this.prisma.settlement.findMany({ where: { spaceId, month }, orderBy: { createdAt: 'asc' } }),
      this.prisma.spaceMember.findMany({ where: { spaceId }, select: { userId: true, user: { select: { displayName: true } } } }),
    ]);
    const names = new Map(members.map((member) => [member.userId, member.user.displayName]));
    const name = (id: string) => names.get(id) ?? 'Former member';
    const owed = new Map<string, number>();
    const add = (fromId: string, toId: string, currency: string, amount: number) => {
      const key = `${fromId}|${toId}|${currency}`;
      owed.set(key, (owed.get(key) ?? 0) + amount);
    };
    const charges = splits.flatMap((split) => {
      const details = split.item.subscription!;
      const cancelled = dateText(details.cancelledOn);
      const renewals = renewalsBetween(details, from, to).filter((day) => !cancelled || day < cancelled);
      if (renewals.length === 0) return [];
      const total = renewals.length * details.amountMinor;
      const weights = split.shares.reduce((sum, share) => sum + share.weight, 0);
      for (const share of split.shares) {
        if (share.userId !== split.payerId) add(share.userId, split.payerId, details.currency, Math.round((total * share.weight) / weights));
      }
      return [{ itemId: split.itemId, name: split.item.title, payerId: split.payerId, payerName: name(split.payerId), amountMinor: total, currency: details.currency, renewals }];
    });
    for (const settlement of settlements) add(settlement.toUserId, settlement.fromUserId, settlement.currency, settlement.amountMinor);
    const debts = [...owed.entries()].flatMap(([key, amount]) => {
      const [fromId, toId, currency] = key.split('|') as [string, string, string];
      const net = amount - (owed.get(`${toId}|${fromId}|${currency}`) ?? 0);
      return net > 0 ? [{ fromUserId: fromId, fromName: name(fromId), toUserId: toId, toName: name(toId), amountMinor: net, currency }] : [];
    });
    return {
      month,
      charges,
      debts,
      settlements: settlements.map((settlement) => ({
        id: settlement.id,
        fromUserId: settlement.fromUserId,
        fromName: name(settlement.fromUserId),
        toUserId: settlement.toUserId,
        toName: name(settlement.toUserId),
        amountMinor: settlement.amountMinor,
        currency: settlement.currency,
        createdAt: settlement.createdAt,
      })),
    };
  }

  async settle(userId: string, spaceId: string, input: CreateSettlementDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    if (userId !== input.toUserId) throw new ForbiddenException('Only the person who was paid can record a payment');
    if (input.fromUserId === input.toUserId) throw new BadRequestException('Choose two different members');
    const members = await this.members(spaceId);
    if (!members.has(input.fromUserId) || !members.has(input.toUserId)) throw new BadRequestException('Settle only between members of this space');
    return this.prisma.settlement.create({ data: { spaceId, ...input }, select: { id: true } });
  }

  async undoSettlement(userId: string, settlementId: string) {
    const settlement = await this.prisma.settlement.findFirst({
      where: { id: settlementId, space: this.access.spacesOf(userId), OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { id: true },
    });
    if (!settlement) throw new NotFoundException('Payment not found');
    await this.prisma.settlement.delete({ where: { id: settlementId } });
  }

  private async members(spaceId: string) {
    const rows = await this.prisma.spaceMember.findMany({ where: { spaceId }, select: { userId: true } });
    return new Set(rows.map((row) => row.userId));
  }
}
