import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { convertMinor, ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, nextMonth } from '../recurrence/dates';
import { renewalsBetween } from '../subscriptions/subscriptions.service';
import { CategoriesService } from './categories.service';
import { CreateExpenseDto, SaveBudgetDto, UpdateExpenseDto } from './dto/spending.dto';

const expenseFields = {
  id: true,
  spaceId: true,
  title: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
  expense: true,
  costSplit: { select: { payerId: true, shares: { select: { userId: true, weight: true }, orderBy: { userId: 'asc' } } } },
} satisfies Prisma.ItemSelect;

type ExpenseRow = Prisma.ItemGetPayload<{ select: typeof expenseFields }>;

function present(row: ExpenseRow) {
  const expense = row.expense!;
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    spentOn: dateText(expense.spentOn),
    category: expense.category,
    paymentLabel: expense.paymentLabel,
    note: expense.note,
    direction: expense.direction,
    merchant: expense.merchant,
    source: expense.source,
    accountId: expense.accountId,
    toAccountId: expense.toAccountId,
    split: row.costSplit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type Movement = { direction: string; accountId: string | null; toAccountId: string | null };

const movementOf = (input: Pick<CreateExpenseDto, 'direction' | 'accountId' | 'toAccountId'>): Movement => {
  const direction = input.direction ?? 'spent';
  return { direction, accountId: input.accountId ?? null, toAccountId: direction === 'transfer' ? (input.toAccountId ?? null) : null };
};

const expenseData = (input: CreateExpenseDto, source: string) => ({
  amountMinor: input.amountMinor,
  currency: input.currency,
  spentOn: dateValue(input.spentOn),
  category: input.category ?? 'other',
  paymentLabel: input.paymentLabel || null,
  note: input.note ?? '',
  merchant: input.merchant || null,
  source,
  ...movementOf(input),
});

@Injectable()
export class SpendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly rates: ExchangeRatesService,
    private readonly categories: CategoriesService,
  ) {}

  async month(userId: string, spaceId: string, month: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const from = `${month}-01`;
    const to = `${nextMonth(month)}-01`;
    const [user, rows, budgets, subscriptions, rates, categories] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true } }),
      this.prisma.item.findMany({
        where: { spaceId, kind: ItemKind.EXPENSE, trashedAt: null, expense: { spentOn: { gte: dateValue(from), lt: dateValue(to) } } },
        orderBy: [{ expense: { spentOn: 'desc' } }, { createdAt: 'desc' }],
        select: expenseFields,
      }),
      this.prisma.budget.findMany({ where: { spaceId }, orderBy: { category: 'asc' } }),
      this.prisma.subscription.findMany({ where: { cancelledOn: null, item: { spaceId, trashedAt: null } } }),
      this.rates.table(),
      this.categories.categories(spaceId),
    ]);
    const expenses = rows.map(present);
    const currency = user.homeCurrency ?? budgets[0]?.currency ?? expenses[0]?.currency ?? 'EUR';
    const missing = new Set<string>();
    const shown = (amountMinor: number, from: string) => {
      if (from === currency) return amountMinor;
      const converted = convertMinor(amountMinor, from, currency, rates.rates);
      if (converted === null) missing.add(from);
      return converted ?? 0;
    };
    const spent = new Map<string, number>();
    let receivedMinor = 0;
    for (const expense of expenses) {
      if (expense.direction === 'received') receivedMinor += shown(expense.amountMinor, expense.currency);
      if (expense.direction !== 'spent' && expense.direction !== 'refund') continue;
      const amount = shown(expense.amountMinor, expense.currency) * (expense.direction === 'refund' ? -1 : 1);
      spent.set(expense.category, (spent.get(expense.category) ?? 0) + amount);
    }
    const budgeted = new Map(budgets.map((budget) => [budget.category, shown(budget.amountMinor, budget.currency)]));
    const committedMinor = subscriptions.reduce(
      (sum, subscription) => sum + renewalsBetween(subscription, from, to).filter((day) => day >= from).length * shown(subscription.amountMinor, subscription.currency),
      0,
    );
    const totals = categories
      .map(({ name }) => name)
      .filter((category) => spent.has(category) || budgeted.has(category))
      .map((category) => ({ category, spentMinor: spent.get(category) ?? 0, budgetMinor: budgeted.get(category) ?? null }))
      .sort((a, b) => b.spentMinor - a.spentMinor);
    return {
      month,
      currency,
      ratesOn: rates.publishedOn,
      missing: [...missing].sort(),
      spentMinor: [...spent.values()].reduce((sum, amount) => sum + amount, 0),
      receivedMinor,
      budgetMinor: budgets.length ? [...budgeted.values()].reduce((sum, amount) => sum + amount, 0) : null,
      committedMinor,
      categories: totals,
      budgets: budgets.map((budget) => ({ category: budget.category, amountMinor: budget.amountMinor, currency: budget.currency })),
      expenses,
    };
  }

  async create(userId: string, spaceId: string, input: CreateExpenseDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const [id] = await this.insert(userId, spaceId, [input], 'manual');
    return this.get(userId, id!);
  }

  async import(userId: string, spaceId: string, inputs: CreateExpenseDto[]) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    return { added: (await this.insert(userId, spaceId, inputs, 'import')).length };
  }

  async capture(userId: string, spaceId: string, input: CreateExpenseDto) {
    const [id] = await this.insert(userId, spaceId, [input], 'sms');
    return id!;
  }

  async get(userId: string, itemId: string) {
    return present(await this.row(userId, itemId, 'read'));
  }

  async update(userId: string, itemId: string, input: UpdateExpenseDto) {
    const row = await this.row(userId, itemId, 'edit');
    if (row.trashedAt) throw new BadRequestException('Restore this expense from the trash before changing it');
    const movement = movementOf({
      direction: input.direction ?? (row.expense!.direction as CreateExpenseDto['direction']),
      accountId: input.accountId === undefined ? row.expense!.accountId : input.accountId,
      toAccountId: input.toAccountId === undefined ? row.expense!.toAccountId : input.toAccountId,
    });
    await this.checkAccounts(row.spaceId, [movement]);
    await this.categories.assertCategory(row.spaceId, input.category);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: {
          title: input.title,
          updatedById: userId,
          expense: {
            update: {
              amountMinor: input.amountMinor,
              currency: input.currency,
              spentOn: input.spentOn ? dateValue(input.spentOn) : undefined,
              category: input.category,
              paymentLabel: input.paymentLabel === undefined ? undefined : input.paymentLabel || null,
              note: input.note,
              merchant: input.merchant === undefined ? undefined : input.merchant || null,
              ...movement,
            },
          },
        },
      });
      await this.activity.record(transaction, { spaceId: row.spaceId, actorId: userId, itemId, verb: 'item.updated', data: { title: input.title ?? row.title } });
    });
    return this.get(userId, itemId);
  }

  async saveBudget(userId: string, spaceId: string, category: string, input: SaveBudgetDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    await this.categories.assertCategory(spaceId, category);
    const budget = await this.prisma.budget.upsert({
      where: { spaceId_category: { spaceId, category } },
      create: { spaceId, category, amountMinor: input.amountMinor, currency: input.currency },
      update: { amountMinor: input.amountMinor, currency: input.currency },
    });
    return { category: budget.category, amountMinor: budget.amountMinor, currency: budget.currency };
  }

  async removeBudget(userId: string, spaceId: string, category: string) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const removed = await this.prisma.budget.deleteMany({ where: { spaceId, category } });
    if (removed.count === 0) throw new NotFoundException('There is no budget for that category');
  }

  private async checkAccounts(spaceId: string, movements: Movement[]) {
    if (movements.some(({ direction, accountId, toAccountId }) => direction === 'transfer' && (!accountId || !toAccountId || accountId === toAccountId))) {
      throw new BadRequestException('A transfer moves money between two different accounts');
    }
    const ids = [...new Set(movements.flatMap(({ accountId, toAccountId }) => [accountId, toAccountId]).filter((id): id is string => id !== null))];
    if (ids.length && (await this.prisma.moneyAccount.count({ where: { spaceId, id: { in: ids } } })) !== ids.length) {
      throw new BadRequestException('Choose an account from this space');
    }
  }

  private async insert(userId: string, spaceId: string, inputs: CreateExpenseDto[], source: string) {
    await this.checkAccounts(spaceId, inputs.map(movementOf));
    for (const category of new Set(inputs.map((input) => input.category))) await this.categories.assertCategory(spaceId, category);
    return this.prisma.$transaction(async (transaction) => {
      const ids: string[] = [];
      for (const input of inputs) {
        const item = await transaction.item.create({
          data: { spaceId, kind: ItemKind.EXPENSE, title: input.title, createdById: userId, updatedById: userId, expense: { create: expenseData(input, source) } },
          select: { id: true },
        });
        ids.push(item.id);
      }
      await this.activity.record(transaction, {
        spaceId,
        actorId: userId,
        itemId: ids.length === 1 ? ids[0] : undefined,
        verb: 'item.created',
        data: { title: inputs.length === 1 ? inputs[0]!.title : `${inputs.length} expenses` },
      });
      return ids;
    });
  }

  private async row(userId: string, itemId: string, access: 'read' | 'edit') {
    await this.access.assertItem(userId, itemId, access);
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: expenseFields });
    if (!row.expense) throw new NotFoundException('That item is not an expense');
    return row;
  }
}
