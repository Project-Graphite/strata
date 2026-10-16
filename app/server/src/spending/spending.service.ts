import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService, fractionDigits } from '../exchange-rates/exchange-rates.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { renewalsBetween } from '../subscriptions/subscriptions.service';
import { CategoriesService } from './categories.service';
import { CreateExpenseDto, SaveBudgetDto, SavePlanDto, UpdateExpenseDto } from './dto/spending.dto';
import { dayBefore, daysBetween, monthOf, periodOf, previousMonth } from './periods';

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
    cardDigits: expense.cardDigits,
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
  cardDigits: input.cardDigits ?? null,
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
    private readonly inbox: InboxService,
    private readonly changes: ChangesService,
  ) {}

  async month(userId: string, spaceId: string, month?: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.summary(userId, spaceId, month);
  }

  async savePlan(userId: string, spaceId: string, input: SavePlanDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    if ((input.budgetMinor === null) !== (input.currency === null)) throw new BadRequestException('Give the monthly budget an amount and a currency');
    const plan = await this.prisma.spendingPlan.upsert({ where: { spaceId }, create: { spaceId, ...input }, update: input });
    this.changes.notify('spending', { spaceId });
    return { budgetMinor: plan.budgetMinor, currency: plan.currency, startDay: plan.startDay, rollover: plan.rollover };
  }

  private async summary(userId: string, spaceId: string, month?: string) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true, timeZone: true } }),
      this.prisma.spendingPlan.findUnique({ where: { spaceId } }),
    ]);
    const startDay = plan?.startDay ?? 1;
    const today = localDate(user.timeZone);
    const shownMonth = month ?? monthOf(today, startDay);
    const { from, to } = periodOf(shownMonth, startDay);
    const previous = periodOf(previousMonth(shownMonth), startDay);
    const [rows, earlier, budgets, subscriptions, rates, categories] = await Promise.all([
      this.prisma.item.findMany({
        where: { spaceId, kind: ItemKind.EXPENSE, trashedAt: null, expense: { spentOn: { gte: dateValue(from), lt: dateValue(to) } } },
        orderBy: [{ expense: { spentOn: 'desc' } }, { createdAt: 'desc' }],
        select: expenseFields,
      }),
      plan?.rollover
        ? this.prisma.expense.findMany({
            where: { item: { spaceId, trashedAt: null }, spentOn: { gte: dateValue(previous.from), lt: dateValue(previous.to) } },
            select: { amountMinor: true, currency: true, direction: true, category: true },
          })
        : [],
      this.prisma.budget.findMany({ where: { spaceId }, orderBy: { category: 'asc' } }),
      this.prisma.subscription.findMany({ where: { cancelledOn: null, item: { spaceId, trashedAt: null } } }),
      this.rates.table(),
      this.categories.categories(spaceId),
    ]);
    const expenses = rows.map(present);
    const currency = user.homeCurrency ?? plan?.currency ?? budgets[0]?.currency ?? expenses[0]?.currency ?? 'EUR';
    const missing = new Set<string>();
    const shown = (amountMinor: number, from: string) => {
      if (from === currency) return amountMinor;
      const converted = convertMinor(amountMinor, from, currency, rates.rates);
      if (converted === null) missing.add(from);
      return converted ?? 0;
    };
    const spentBy = (list: { amountMinor: number; currency: string; direction: string; category: string }[]) => {
      const totals = new Map<string, number>();
      for (const expense of list) {
        if (expense.direction !== 'spent' && expense.direction !== 'refund') continue;
        const amount = shown(expense.amountMinor, expense.currency) * (expense.direction === 'refund' ? -1 : 1);
        totals.set(expense.category, (totals.get(expense.category) ?? 0) + amount);
      }
      return totals;
    };
    const sum = (values: Iterable<number>) => [...values].reduce((total, amount) => total + amount, 0);
    const spent = spentBy(expenses);
    const before = spentBy(earlier);
    const receivedMinor = sum(expenses.filter((expense) => expense.direction === 'received').map((expense) => shown(expense.amountMinor, expense.currency)));
    const carried = (amount: number, spentBefore: number) => (plan?.rollover ? amount - spentBefore : 0);
    const budgeted = new Map(
      budgets.map((budget) => {
        const amount = shown(budget.amountMinor, budget.currency);
        const carriedMinor = carried(amount, before.get(budget.category) ?? 0);
        return [budget.category, { budgetMinor: amount + carriedMinor, carriedMinor }];
      }),
    );
    const planned = plan?.budgetMinor != null && plan.currency ? shown(plan.budgetMinor, plan.currency) : null;
    const carriedMinor = planned === null ? sum([...budgeted.values()].map((budget) => budget.carriedMinor)) : carried(planned, sum(before.values()));
    const budgetMinor = planned !== null ? planned + carriedMinor : budgets.length ? sum([...budgeted.values()].map((budget) => budget.budgetMinor)) : null;
    const spentMinor = sum(spent.values());
    const committedMinor = subscriptions.reduce(
      (total, subscription) => total + renewalsBetween(subscription, from, to).filter((day) => day >= from).length * shown(subscription.amountMinor, subscription.currency),
      0,
    );
    const totals = categories
      .map(({ name }) => name)
      .filter((category) => spent.has(category) || budgeted.has(category))
      .map((category) => ({ category, spentMinor: spent.get(category) ?? 0, budgetMinor: budgeted.get(category)?.budgetMinor ?? null, carriedMinor: budgeted.get(category)?.carriedMinor ?? 0 }))
      .sort((a, b) => b.spentMinor - a.spentMinor);
    return {
      month: shownMonth,
      from,
      until: dayBefore(to),
      currency,
      ratesOn: rates.publishedOn,
      missing: [...missing].sort(),
      spentMinor,
      receivedMinor,
      budgetMinor,
      carriedMinor,
      safeDailyMinor: budgetMinor !== null && today >= from && today < to ? Math.floor(Math.max(0, budgetMinor - spentMinor) / daysBetween(today, to)) : null,
      committedMinor,
      categories: totals,
      budgets: budgets.map((budget) => ({ category: budget.category, amountMinor: budget.amountMinor, currency: budget.currency })),
      plan: { budgetMinor: plan?.budgetMinor ?? null, currency: plan?.currency ?? null, startDay, rollover: plan?.rollover ?? false },
      expenses,
    };
  }

  private async alert(userId: string, spaceId: string) {
    const summary = await this.summary(userId, spaceId);
    const reached = (spent: number, budget: number) => [80, 100].filter((level) => (budget > 0 ? spent * 100 >= budget * level : spent > 0));
    const targets = [
      ...(summary.budgetMinor === null ? [] : [{ category: '', spent: summary.spentMinor, budget: summary.budgetMinor }]),
      ...summary.categories.flatMap((row) => (row.budgetMinor === null ? [] : [{ category: row.category, spent: row.spentMinor, budget: row.budgetMinor }])),
    ];
    const sent = await this.prisma.budgetAlert.findMany({ where: { spaceId, period: summary.month }, select: { category: true, level: true } });
    const fresh = targets
      .map((target) => ({ ...target, levels: reached(target.spent, target.budget).filter((level) => !sent.some((alert) => alert.category === target.category && alert.level === level)) }))
      .filter((target) => target.levels.length > 0);
    if (fresh.length === 0) return;
    const members = await this.prisma.spaceMember.findMany({ where: { spaceId }, select: { userId: true } });
    const format = (minor: number) => new Intl.NumberFormat('en', { style: 'currency', currency: summary.currency }).format(minor / 10 ** fractionDigits(summary.currency));
    await this.prisma.$transaction(async (transaction) => {
      await transaction.budgetAlert.createMany({
        data: fresh.flatMap((target) => target.levels.map((level) => ({ spaceId, category: target.category, period: summary.month, level }))),
        skipDuplicates: true,
      });
      await this.inbox.notify(
        transaction,
        fresh.flatMap((target) => {
          const budget = target.category ? `${target.category} budget` : 'monthly budget';
          const title = target.levels.includes(100) ? `Over the ${budget}` : `80% of the ${budget} used`;
          return members.map(({ userId: memberId }) => ({
            userId: memberId,
            kind: 'budget_alert' as const,
            title,
            body: `${format(target.spent)} of ${format(target.budget)}`,
            link: `/spending?space=${spaceId}`,
          }));
        }),
      );
    });
  }

  async insights(userId: string, spaceId: string, count: number) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const [user, plan] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true, timeZone: true } }),
      this.prisma.spendingPlan.findUnique({ where: { spaceId } }),
    ]);
    const startDay = plan?.startDay ?? 1;
    const current = monthOf(localDate(user.timeZone), startDay);
    const months = [current];
    while (months.length < count) months.unshift(previousMonth(months[0]!));
    const periods = months.map((month) => ({ month, ...periodOf(month, startDay) }));
    const [expenses, rates] = await Promise.all([
      this.prisma.expense.findMany({
        where: { item: { spaceId, trashedAt: null }, spentOn: { gte: dateValue(periods[0]!.from), lt: dateValue(periods.at(-1)!.to) } },
        select: { amountMinor: true, currency: true, direction: true, category: true, merchant: true, spentOn: true, item: { select: { title: true } } },
        orderBy: { spentOn: 'asc' },
      }),
      this.rates.table(),
    ]);
    const currency = user.homeCurrency ?? plan?.currency ?? expenses[0]?.currency ?? 'EUR';
    const missing = new Set<string>();
    const shown = (amountMinor: number, from: string) => {
      if (from === currency) return amountMinor;
      const converted = convertMinor(amountMinor, from, currency, rates.rates);
      if (converted === null) missing.add(from);
      return converted ?? 0;
    };
    const rows = expenses.map((expense) => ({
      ...expense,
      day: dateText(expense.spentOn),
      amount: shown(expense.amountMinor, expense.currency) * (expense.direction === 'refund' ? -1 : 1),
      spending: expense.direction === 'spent' || expense.direction === 'refund',
    }));
    const merchants = new Map<string, { merchant: string; count: number; totalMinor: number; lastOn: string }>();
    for (const row of rows.filter((candidate) => candidate.direction === 'spent')) {
      const merchant = (row.merchant ?? row.item.title).trim();
      const known = merchants.get(merchant.toLowerCase()) ?? { merchant, count: 0, totalMinor: 0, lastOn: row.day };
      merchants.set(merchant.toLowerCase(), { ...known, count: known.count + 1, totalMinor: known.totalMinor + row.amount, lastOn: row.day });
    }
    const latest = periods.at(-1)!;
    const days: { day: string; spentMinor: number }[] = [];
    for (let day = latest.from; day < latest.to; day = dateText(new Date(dateValue(day).getTime() + dayMs))) {
      days.push({ day, spentMinor: rows.filter((row) => row.spending && row.day === day).reduce((total, row) => total + row.amount, 0) });
    }
    return {
      currency,
      missing: [...missing].sort(),
      periods: periods.map(({ month, from, to }) => {
        const inside = rows.filter((row) => row.day >= from && row.day < to);
        const categories = new Map<string, number>();
        for (const row of inside.filter((candidate) => candidate.spending)) categories.set(row.category, (categories.get(row.category) ?? 0) + row.amount);
        return {
          month,
          from,
          until: dayBefore(to),
          spentMinor: [...categories.values()].reduce((total, amount) => total + amount, 0),
          receivedMinor: inside.filter((row) => row.direction === 'received').reduce((total, row) => total + row.amount, 0),
          categories: [...categories].map(([category, spentMinor]) => ({ category, spentMinor })).sort((a, b) => b.spentMinor - a.spentMinor),
        };
      }),
      merchants: [...merchants.values()]
        .sort((a, b) => b.totalMinor - a.totalMinor)
        .slice(0, 10)
        .map((merchant) => ({ ...merchant, averageMinor: Math.round(merchant.totalMinor / merchant.count) })),
      days,
    };
  }

  async export(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const [rows, accounts] = await Promise.all([
      this.prisma.item.findMany({
        where: { spaceId, kind: ItemKind.EXPENSE, trashedAt: null },
        orderBy: [{ expense: { spentOn: 'asc' } }, { createdAt: 'asc' }],
        select: expenseFields,
      }),
      this.prisma.moneyAccount.findMany({ where: { spaceId }, select: { id: true, name: true } }),
    ]);
    const accountName = (id: string | null) => accounts.find((account) => account.id === id)?.name ?? '';
    const cell = (value: string) => {
      const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
    };
    const lines = rows.map(present).map((expense) =>
      [
        expense.spentOn,
        expense.title,
        expense.merchant ?? '',
        expense.direction,
        (expense.amountMinor / 10 ** fractionDigits(expense.currency)).toFixed(fractionDigits(expense.currency)),
        expense.currency,
        expense.direction === 'received' || expense.direction === 'transfer' ? '' : expense.category,
        accountName(expense.accountId),
        accountName(expense.toAccountId),
        expense.note,
      ]
        .map(cell)
        .join(','),
    );
    return `${['date', 'title', 'merchant', 'type', 'amount', 'currency', 'category', 'account', 'to account', 'note'].join(',')}\r\n${lines.map((line) => `${line}\r\n`).join('')}`;
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

  async capture(userId: string, spaceId: string, input: CreateExpenseDto, source: 'sms' | 'manual') {
    const [id] = await this.insert(userId, spaceId, [input], source);
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
              cardDigits: input.cardDigits,
              ...movement,
            },
          },
        },
      });
      await this.activity.record(transaction, { spaceId: row.spaceId, actorId: userId, itemId, verb: 'item.updated', data: { title: input.title ?? row.title } });
    });
    await this.alert(userId, row.spaceId);
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
    this.changes.notify('spending', { spaceId });
    return { category: budget.category, amountMinor: budget.amountMinor, currency: budget.currency };
  }

  async removeBudget(userId: string, spaceId: string, category: string) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const removed = await this.prisma.budget.deleteMany({ where: { spaceId, category } });
    if (removed.count === 0) throw new NotFoundException('There is no budget for that category');
    this.changes.notify('spending', { spaceId });
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
    const ids = await this.prisma.$transaction(async (transaction) => {
      const created: string[] = [];
      for (const input of inputs) {
        const item = await transaction.item.create({
          data: { spaceId, kind: ItemKind.EXPENSE, title: input.title, createdById: userId, updatedById: userId, expense: { create: expenseData(input, source) } },
          select: { id: true },
        });
        created.push(item.id);
      }
      await this.activity.record(transaction, {
        spaceId,
        actorId: userId,
        itemId: created.length === 1 ? created[0] : undefined,
        verb: 'item.created',
        data: { title: inputs.length === 1 ? inputs[0]!.title : `${inputs.length} expenses` },
      });
      return created;
    });
    await this.alert(userId, spaceId);
    return ids;
  }

  private async row(userId: string, itemId: string, access: 'read' | 'edit') {
    await this.access.assertItem(userId, itemId, access);
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: expenseFields });
    if (!row.expense) throw new NotFoundException('That item is not an expense');
    return row;
  }
}
