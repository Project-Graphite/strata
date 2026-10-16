import { Injectable, NotFoundException } from '@nestjs/common';
import { MoneyAccount } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService, RateTable } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

export interface AccountFlow {
  amountMinor: number;
  currency: string;
  direction: string;
  accountId: string | null;
  toAccountId: string | null;
  item: { createdAt: Date };
}

export function balanceOf(account: MoneyAccount, flows: AccountFlow[], rates: RateTable) {
  const missing = new Set<string>();
  let balanceMinor = account.balanceMinor;
  for (const flow of flows) {
    if (flow.item.createdAt <= account.balanceAt) continue;
    const sign = flow.accountId === account.id ? (flow.direction === 'received' || flow.direction === 'refund' ? 1 : -1) : flow.toAccountId === account.id ? 1 : 0;
    if (!sign) continue;
    const amount = flow.currency === account.currency ? flow.amountMinor : convertMinor(flow.amountMinor, flow.currency, account.currency, rates);
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
    const [accounts, paid] = await Promise.all([
      this.prisma.moneyAccount.findMany({ where: { spaceId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, cardDigits: true } }),
      this.prisma.expense.findMany({
        where: { cardDigits: { not: null }, item: { spaceId, trashedAt: null } },
        distinct: ['cardDigits'],
        orderBy: { item: { createdAt: 'desc' } },
        select: { cardDigits: true, accountId: true },
      }),
    ]);
    const cards = new Map(paid.map((expense) => [expense.cardDigits!, expense.accountId]));
    for (const account of accounts) for (const digits of account.cardDigits) cards.set(digits, account.id);
    return [...cards].map(([digits, accountId]) => ({ digits, accountId }));
  }

  async create(userId: string, spaceId: string, input: CreateAccountDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const account = await this.prisma.moneyAccount.create({
      data: {
        spaceId,
        name: input.name,
        kind: input.kind ?? 'bank',
        currency: input.currency,
        cardDigits: [...new Set(input.cardDigits ?? [])],
        senders: [...new Set(input.senders ?? [])],
        balanceMinor: input.balanceMinor ?? 0,
        creditLimitMinor: input.creditLimitMinor ?? null,
        dueDay: input.dueDay ?? null,
        position: await this.prisma.moneyAccount.count({ where: { spaceId } }),
      },
    });
    this.changes.notify('spending', { spaceId });
    return (await this.balances([account]))[0]!;
  }

  async update(userId: string, id: string, input: UpdateAccountDto) {
    const existing = await this.find(userId, id, 'edit');
    const account = await this.prisma.moneyAccount.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        cardDigits: input.cardDigits && [...new Set(input.cardDigits)],
        senders: input.senders && [...new Set(input.senders)],
        ...(input.balanceMinor === undefined ? {} : { balanceMinor: input.balanceMinor, balanceAt: new Date() }),
        creditLimitMinor: input.creditLimitMinor,
        dueDay: input.dueDay,
      },
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

  async balances(accounts: MoneyAccount[]) {
    if (accounts.length === 0) return [];
    const ids = accounts.map((account) => account.id);
    const [flows, rates] = await Promise.all([
      this.prisma.expense.findMany({
        where: { item: { trashedAt: null }, OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] },
        select: { amountMinor: true, currency: true, direction: true, accountId: true, toAccountId: true, item: { select: { createdAt: true } } },
      }),
      this.rates.table(),
    ]);
    return accounts.map((account) => ({
      id: account.id,
      spaceId: account.spaceId,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      cardDigits: account.cardDigits,
      senders: account.senders,
      creditLimitMinor: account.creditLimitMinor,
      dueDay: account.dueDay,
      ...balanceOf(account, flows, rates.rates),
    }));
  }
}
