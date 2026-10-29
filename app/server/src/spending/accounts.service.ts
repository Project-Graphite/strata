import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MoneyAccount, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService, RateTable } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { dayMs } from '../recurrence/dates';
import { CreateAccountDto, CreateCardDto, UpdateAccountDto, UpdateCardDto } from './dto/accounts.dto';

const historyDays = 90;
const cardFields = { id: true, last4: true, network: true, kind: true, label: true } satisfies Prisma.CardSelect;

export interface AccountFlow {
  amountMinor: bigint;
  currency: string;
  direction: string;
  accountId: string | null;
  toAccountId: string | null;
  item: { createdAt: Date };
}

export const cardKindOf = (accountKind: string) => (accountKind === 'credit_card' ? 'credit' : accountKind === 'prepaid' ? 'prepaid' : 'debit');

export const flowSign = (accountId: string, flow: Pick<AccountFlow, 'direction' | 'accountId' | 'toAccountId'>) =>
  flow.accountId === accountId ? (flow.direction === 'received' || flow.direction === 'refund' ? 1 : -1) : flow.toAccountId === accountId ? 1 : 0;

export function balanceOf(account: Pick<MoneyAccount, 'id' | 'currency' | 'balanceMinor' | 'balanceAt'>, flows: AccountFlow[], rates: RateTable) {
  const missing = new Set<string>();
  let balanceMinor = Number(account.balanceMinor);
  for (const flow of flows) {
    if (flow.item.createdAt <= account.balanceAt) continue;
    const sign = flowSign(account.id, flow);
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
    await this.access.assertPersonalSpace(userId, spaceId);
    return this.balances(await this.prisma.moneyAccount.findMany({ where: { spaceId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }));
  }

  async cards(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
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
    await this.access.assertPersonalSpace(userId, spaceId);
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
    const existing = await this.find(userId, id);
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
    const account = await this.find(userId, id);
    await this.prisma.moneyAccount.delete({ where: { id: account.id } });
    this.changes.notify('spending', { spaceId: account.spaceId });
  }

  async reconcile(userId: string, id: string, balanceMinor: number) {
    const [before] = await this.balances([await this.find(userId, id)]);
    const account = await this.prisma.moneyAccount.update({
      where: { id },
      data: { balanceMinor, balanceAt: new Date(), balances: { create: { balanceMinor, source: 'reconcile' } } },
    });
    this.changes.notify('spending', { spaceId: account.spaceId });
    return { account: (await this.balances([account]))[0]!, differenceMinor: balanceMinor - before!.balanceMinor };
  }

  async addCard(userId: string, accountId: string, input: CreateCardDto) {
    const account = await this.find(userId, accountId);
    await this.assertNewCard(accountId, input.last4);
    const card = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.card.create({
        data: {
          accountId,
          last4: input.last4,
          network: input.network ?? null,
          kind: input.kind ?? cardKindOf(account.kind),
          label: input.label || null,
          position: await transaction.card.count({ where: { accountId } }),
        },
        select: cardFields,
      });
      await transaction.expense.updateMany({ where: { accountId, cardDigits: input.last4, cardId: null }, data: { cardId: created.id } });
      return created;
    });
    this.changes.notify('spending', { spaceId: account.spaceId });
    return card;
  }

  async updateCard(userId: string, id: string, input: UpdateCardDto) {
    const existing = await this.findCard(userId, id);
    if (input.last4 && input.last4 !== existing.last4) await this.assertNewCard(existing.accountId, input.last4);
    const card = await this.prisma.$transaction(async (transaction) => {
      if (input.last4 && input.last4 !== existing.last4) await transaction.expense.updateMany({ where: { cardId: id }, data: { cardDigits: input.last4 } });
      return transaction.card.update({
        where: { id },
        data: { last4: input.last4, network: input.network, kind: input.kind, label: input.label === undefined ? undefined : input.label || null },
        select: cardFields,
      });
    });
    this.changes.notify('spending', { spaceId: existing.account.spaceId });
    return card;
  }

  async removeCard(userId: string, id: string) {
    const card = await this.findCard(userId, id);
    await this.prisma.card.delete({ where: { id } });
    this.changes.notify('spending', { spaceId: card.account.spaceId });
  }

  private async findCard(userId: string, id: string) {
    const card = await this.prisma.card.findUnique({ where: { id }, include: { account: { select: { spaceId: true } } } });
    if (!card) throw new NotFoundException('Card not found');
    await this.access.assertPersonalSpace(userId, card.account.spaceId);
    return card;
  }

  private async assertNewCard(accountId: string, last4: string) {
    if (await this.prisma.card.count({ where: { accountId, last4 } })) throw new ConflictException(`This account already has a card ending in ${last4}`);
  }

  private async find(userId: string, id: string) {
    const account = await this.prisma.moneyAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    await this.access.assertPersonalSpace(userId, account.spaceId);
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
    const [flows, cards, history, rates] = await Promise.all([
      this.prisma.expense.findMany({
        where: { item: { trashedAt: null }, OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] },
        select: { amountMinor: true, currency: true, direction: true, accountId: true, toAccountId: true, item: { select: { createdAt: true } } },
      }),
      this.prisma.card.findMany({ where: { accountId: { in: ids } }, orderBy: { position: 'asc' }, select: { ...cardFields, accountId: true } }),
      this.prisma.accountBalance.findMany({
        where: { accountId: { in: ids }, recordedAt: { gte: new Date(Date.now() - historyDays * dayMs) } },
        orderBy: { recordedAt: 'asc' },
        select: { accountId: true, balanceMinor: true, recordedAt: true, source: true },
      }),
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
      cards: cards.filter((card) => card.accountId === account.id),
      history: history
        .filter((row) => row.accountId === account.id)
        .map((row) => ({ at: row.recordedAt, balanceMinor: Number(row.balanceMinor), source: row.source })),
      senders: account.senders,
      creditLimitMinor: account.creditLimitMinor === null ? null : Number(account.creditLimitMinor),
      dueDay: account.dueDay,
      ...balanceOf(account, flows, rates.rates),
    }));
  }
}
