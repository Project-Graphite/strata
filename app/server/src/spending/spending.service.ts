import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { convertMinor, ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, nextMonth } from '../recurrence/dates';
import { renewalsBetween } from '../subscriptions/subscriptions.service';
import { CreateExpenseDto, SaveBudgetDto, spendingCategories, UpdateExpenseDto } from './dto/spending.dto';

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
    split: row.costSplit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const expenseData = (input: CreateExpenseDto) => ({
  amountMinor: input.amountMinor,
  currency: input.currency,
  spentOn: dateValue(input.spentOn),
  category: input.category ?? 'other',
  paymentLabel: input.paymentLabel || null,
  note: input.note ?? '',
});

@Injectable()
export class SpendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly rates: ExchangeRatesService,
  ) {}

  async month(userId: string, spaceId: string, month: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const from = `${month}-01`;
    const to = `${nextMonth(month)}-01`;
    const [user, rows, budgets, subscriptions, rates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true } }),
      this.prisma.item.findMany({
        where: { spaceId, kind: ItemKind.EXPENSE, trashedAt: null, expense: { spentOn: { gte: dateValue(from), lt: dateValue(to) } } },
        orderBy: [{ expense: { spentOn: 'desc' } }, { createdAt: 'desc' }],
        select: expenseFields,
      }),
      this.prisma.budget.findMany({ where: { spaceId }, orderBy: { category: 'asc' } }),
      this.prisma.subscription.findMany({ where: { cancelledOn: null, item: { spaceId, trashedAt: null } } }),
      this.rates.table(),
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
    for (const expense of expenses) spent.set(expense.category, (spent.get(expense.category) ?? 0) + shown(expense.amountMinor, expense.currency));
    const budgeted = new Map(budgets.map((budget) => [budget.category, shown(budget.amountMinor, budget.currency)]));
    const committedMinor = subscriptions.reduce(
      (sum, subscription) => sum + renewalsBetween(subscription, from, to).filter((day) => day >= from).length * shown(subscription.amountMinor, subscription.currency),
      0,
    );
    const categories = spendingCategories
      .filter((category) => spent.has(category) || budgeted.has(category))
      .map((category) => ({ category, spentMinor: spent.get(category) ?? 0, budgetMinor: budgeted.get(category) ?? null }))
      .sort((a, b) => b.spentMinor - a.spentMinor);
    return {
      month,
      currency,
      ratesOn: rates.publishedOn,
      missing: [...missing].sort(),
      spentMinor: [...spent.values()].reduce((sum, amount) => sum + amount, 0),
      budgetMinor: budgets.length ? [...budgeted.values()].reduce((sum, amount) => sum + amount, 0) : null,
      committedMinor,
      categories,
      budgets: budgets.map((budget) => ({ category: budget.category, amountMinor: budget.amountMinor, currency: budget.currency })),
      expenses,
    };
  }

  async create(userId: string, spaceId: string, input: CreateExpenseDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const [id] = await this.insert(userId, spaceId, [input]);
    return this.get(userId, id!);
  }

  async import(userId: string, spaceId: string, inputs: CreateExpenseDto[]) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    return { added: (await this.insert(userId, spaceId, inputs)).length };
  }

  async get(userId: string, itemId: string) {
    return present(await this.row(userId, itemId, 'read'));
  }

  async update(userId: string, itemId: string, input: UpdateExpenseDto) {
    const row = await this.row(userId, itemId, 'edit');
    if (row.trashedAt) throw new BadRequestException('Restore this expense from the trash before changing it');
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
    if (!(spendingCategories as readonly string[]).includes(category)) throw new BadRequestException('Choose a category from the list');
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

  private insert(userId: string, spaceId: string, inputs: CreateExpenseDto[]) {
    return this.prisma.$transaction(async (transaction) => {
      const ids: string[] = [];
      for (const input of inputs) {
        const item = await transaction.item.create({
          data: { spaceId, kind: ItemKind.EXPENSE, title: input.title, createdById: userId, updatedById: userId, expense: { create: expenseData(input) } },
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
