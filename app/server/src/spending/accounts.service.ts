import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MoneyAccount } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService, RateTable } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

export interface AccountFlow {
  amountMinor: bigint;
  currency: string;
  direction: string;
  accountId: string | null;
  toAccountId: string | null;
  item: { createdAt: Date };
}

export const cardKindOf = (accountKind: string) => (accountKind === 'credit_card' ? 'credit' : accountKind === 'prepaid' ? 'prepaid' : 'debit');

export function balanceOf(account: Pick<MoneyAccount, 'id' | 'currency' | 'balanceMinor' | 'balanceAt'>, flows: AccountFlow[], rates: RateTable) {
  const missing = new Set<string>();
  let balanceMinor = Number(account.balanceMinor);
  for (const flow of flows) {
    if (flow.item.createdAt <= account.balanceAt) continue;
    const sign = flow.accountId === account.id ? (flow.direction === 'received' || flow.direction === 'refund' ? 1 : -1) : flow.toAccountId === account.id ? 1 : 0;
    if (!sign) continue;
    const amount = flow.currency === account.currency ? Number(flow.amountMinor) : convertMinor(Number(flow.amountMinor), flow.currency, account.currency, rates);
    if (amount === null) missing.add(flow.currency);
    else balanceMinor += sign * amount;
  }
  return { balanceMinor, missing: [...missing].sort() };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly rates: ExchangeRatesService,
    private readonly changes: ChangesService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.balances(await this.prisma.moneyAccount.findMany({ where: { spaceId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }));
  }

  async cards(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const [owned, paid] = await Promise.all([
      this.prisma.card.findMany({
        where: { account: { spaceId } },
        orderBy: [{ account: { position: 'asc' } }, { account: { createdAt: 'asc' } }, { position: 'asc' }],
        select: { last4: true, accountId: true },
      }),
      this.prisma.expense.findMany({
        where: { cardDigits: { not: null }, item: { spaceId, trashedAt: null } },
        distinct: ['cardDigits'],
        orderBy: { item: { createdAt: 'desc' } },
        select: { cardDigits: true, accountId: true },
      }),
    ]);
    const cards = new Map(paid.map((expense) => [expense.cardDigits!, expense.accountId]));
    for (const card of owned) cards.set(card.last4, card.accountId);
    return [...cards].map(([digits, accountId]) => ({ digits, accountId }));
  }

  async create(userId: string, spaceId: string, input: CreateAccountDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    await this.assertFunding(spaceId, input.fundedByAccountId, null);
    const { cardDigits = [], senders = [], balanceMinor = 0, ...details } = input;
    const kind = input.kind ?? 'bank_current';
    const account = await this.prisma.moneyAccount.create({
      data: {
        ...details,
        spaceId,
        kind,
        senders: [...new Set(senders)],
        balanceMinor,
        position: await this.prisma.moneyAccount.count({ where: { spaceId } }),
        cards: { create: [...new Set(cardDigits)].map((last4, position) => ({ last4, position, kind: cardKindOf(kind) })) },
        balances: { create: { balanceMinor, source: 'manual' } },
      },
    });
    this.changes.notify('spending', { spaceId });
    return (await this.balances([account]))[0]!;
  }

  async update(userId: string, id: string, input: UpdateAccountDto) {
    const existing = await this.find(userId, id, 'edit');
    await this.assertFunding(existing.spaceId, input.fundedByAccountId, id);
    const { cardDigits, senders, balanceMinor, archived, ...details } = input;
    const account = await this.prisma.$transaction(async (transaction) => {
      if (cardDigits) {
        const digits = [...new Set(cardDigits)];
        await transaction.card.deleteMany({ where: { accountId: id, last4: { notIn: digits } } });
        for (const [position, last4] of digits.entries()) {
          await transaction.card.upsert({
            where: { accountId_last4: { accountId: id, last4 } },
            create: { accountId: id, last4, position, kind: cardKindOf(input.kind ?? existing.kind) },
            update: { position },
          });
        }
      }
      return transaction.moneyAccount.update({
        where: { id },
        data: {
          ...details,
          senders: senders && [...new Set(senders)],
          ...(archived === undefined ? {} : { archivedAt: archived ? (existing.archivedAt ?? new Date()) : null }),
          ...(balanceMinor === undefined ? {} : { balanceMinor, balanceAt: new Date(), balances: { create: { balanceMinor, source: 'manual' } } }),
        },
      });
    });
    this.changes.notify('spending', { spaceId: account.spaceId });
    return (await this.balances([account]))[0]!;
  }

  async remove(userId: string, id: string) {
    const account = await this.find(userId, id, 'edit');
    await this.prisma.moneyAccount.delete({ where: { id: account.id } });
    this.changes.notify('spending', { spaceId: account.spaceId });
  }

  private async find(userId: string, id: string, access: 'read' | 'edit') {
    const account = await this.prisma.moneyAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    await this.access.assertSpace(userId, account.spaceId, access);
    return account;
  }

  private async assertFunding(spaceId: string, fundedByAccountId: string | null | undefined, accountId: string | null) {
    if (!fundedByAccountId) return;
    if (fundedByAccountId === accountId) throw new BadRequestException('An account cannot fund itself');
    if (!(await this.prisma.moneyAccount.count({ where: { id: fundedByAccountId, spaceId } }))) throw new BadRequestException('Choose an account from this space');
  }

  async balances(accounts: MoneyAccount[]) {
    if (accounts.length === 0) return [];
    const ids = accounts.map((account) => account.id);
    const [flows, cards, rates] = await Promise.all([
      this.prisma.expense.findMany({
        where: { item: { trashedAt: null }, OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] },
        select: { amountMinor: true, currency: true, direction: true, accountId: true, toAccountId: true, item: { select: { createdAt: true } } },
      }),
      this.prisma.card.findMany({ where: { accountId: { in: ids } }, orderBy: { position: 'asc' }, select: { accountId: true, last4: true } }),
      this.rates.table(),
    ]);
    return accounts.map((account) => ({
      id: account.id,
      spaceId: account.spaceId,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      institution: account.institution,
      handle: account.handle,
      fundedByAccountId: account.fundedByAccountId,
      colour: account.colour,
      icon: account.icon,
      archivedAt: account.archivedAt,
      cardDigits: cards.filter((card) => card.accountId === account.id).map((card) => card.last4),
      senders: account.senders,
      creditLimitMinor: account.creditLimitMinor === null ? null : Number(account.creditLimitMinor),
      dueDay: account.dueDay,
      ...balanceOf(account, flows, rates.rates),
    }));
  }
}
