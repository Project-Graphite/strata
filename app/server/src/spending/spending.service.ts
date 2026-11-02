import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Expense, MoneyAccount, Prisma } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService, fractionDigits, RateTable } from '../exchange-rates/exchange-rates.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate, nextMonth } from '../recurrence/dates';
import { renewalsBetween } from '../subscriptions/subscriptions.service';
import { AccountsService } from './accounts.service';
import { CategoriesService, merchantFor } from './categories.service';
import { CreateExpenseDto, ExportDto, SaveBudgetDto, SavePlanDto, TransactionsDto, UpdateExpenseDto, UpdateExpensesDto } from './dto/spending.dto';
import { dayAfter, dayBefore, daysBetween, monthOf, periodOf, previousMonth } from './periods';
import { after, cursorOf, readCursor, runningBalances, transactionOrder, transactionsWhere } from './transactions';

function present(expense: Expense) {
  return {
    id: expense.id,
    title: expense.title,
    amountMinor: Number(expense.amountMinor),
    currency: expense.currency,
    spentOn: dateText(expense.spentOn),
    occurredAt: expense.occurredAt,
    category: expense.category,
    paymentLabel: expense.paymentLabel,
    note: expense.note,
    direction: expense.direction,
    kind: expense.kind,
    status: expense.status,
    merchant: expense.merchant,
    source: expense.source,
    reference: expense.reference,
    accountId: expense.accountId,
    toAccountId: expense.toAccountId,
    cardId: expense.cardId,
    cardDigits: expense.cardDigits,
    trashedAt: expense.trashedAt,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

type Movement = { direction: string; accountId: string | null; toAccountId: string | null };

const rolloverMonths = 12;
const renewalWindowDays = 3;

const paysRenewal = (expense: ReturnType<typeof present>, subscription: { amountMinor: number; currency: string; name: string }, day: string) => {
  const name = subscription.name.toLowerCase();
  return (
    expense.direction === 'spent' &&
    expense.currency === subscription.currency &&
    Math.abs(expense.amountMinor - subscription.amountMinor) * 10 <= subscription.amountMinor &&
    Math.abs(daysBetween(expense.spentOn, day)) <= renewalWindowDays &&
    [expense.merchant, expense.title].some((text) => text && (text.toLowerCase().includes(name) || name.includes(text.toLowerCase())))
  );
};

const movementOf = (input: Pick<CreateExpenseDto, 'direction' | 'accountId' | 'toAccountId'>): Movement => {
  const direction = input.direction ?? 'spent';
  return { direction, accountId: input.accountId ?? null, toAccountId: direction === 'transfer' ? (input.toAccountId ?? null) : null };
};

export const kindOf = (direction: string) => (direction === 'received' ? 'income' : direction === 'refund' || direction === 'transfer' ? direction : 'purchase');

const expenseData = (input: CreateExpenseDto, source: string) => {
  const movement = movementOf(input);
  return {
    title: input.title,
    amountMinor: input.amountMinor,
    currency: input.currency,
    spentOn: dateValue(input.spentOn),
    category: input.category ?? 'other',
    paymentLabel: input.paymentLabel || null,
    note: input.note ?? '',
    merchant: input.merchant || null,
    cardDigits: input.cardDigits ?? null,
    reference: input.reference || null,
    source,
    kind: input.kind ?? kindOf(movement.direction),
    ...movement,
  };
};

@Injectable()
export class SpendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: ExchangeRatesService,
    private readonly categories: CategoriesService,
    private readonly inbox: InboxService,
    private readonly changes: ChangesService,
    private readonly accounts: AccountsService,
  ) {}

  month(userId: string, month?: string) {
    return this.summary(userId, month);
  }

  async savePlan(userId: string, input: SavePlanDto) {
    if ((input.budgetMinor === null) !== (input.currency === null)) throw new BadRequestException('Give the monthly budget an amount and a currency');
    const { startDay, ...settings } = input;
    const [plan, user] = await this.prisma.$transaction([
      this.prisma.spendingPlan.upsert({ where: { userId }, create: { userId, ...settings }, update: settings }),
      this.prisma.user.update({ where: { id: userId }, data: { monthStartDay: startDay }, select: { monthStartDay: true } }),
    ]);
    this.changes.notify('spending', { userId });
    await this.alert(userId);
    return { budgetMinor: plan.budgetMinor === null ? null : Number(plan.budgetMinor), currency: plan.currency, startDay: user.monthStartDay, rollover: plan.rollover };
  }

  private async summary(userId: string, month?: string) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true, timeZone: true, monthStartDay: true, budgetsEnabled: true } }),
      this.prisma.spendingPlan.findUnique({ where: { userId } }),
    ]);
    const startDay = user.monthStartDay;
    const today = localDate(user.timeZone);
    const shownMonth = month ?? monthOf(today, startDay);
    const { from, to } = periodOf(shownMonth, startDay);
    const oldest = Array.from({ length: rolloverMonths }).reduce<string>((at) => previousMonth(at), shownMonth);
    const [rows, earlier, budgets, subscriptions, rates, categories] = await Promise.all([
      this.prisma.expense.findMany({
        where: { userId, trashedAt: null, spentOn: { gte: dateValue(from), lt: dateValue(to) } },
        orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      }),
      plan?.rollover
        ? this.prisma.expense.findMany({
            where: { userId, trashedAt: null, spentOn: { gte: dateValue(periodOf(oldest, startDay).from), lt: dateValue(from) } },
            select: { amountMinor: true, currency: true, direction: true, category: true, spentOn: true },
          })
        : [],
      this.prisma.budget.findMany({ where: { userId }, orderBy: { category: 'asc' } }),
      this.prisma.subscription.findMany({ where: { userId, cancelledOn: null } }),
      this.rates.table(),
      this.categories.categories(userId),
    ]);
    const expenses = rows.map(present);
    const currency = user.homeCurrency ?? plan?.currency ?? budgets[0]?.currency ?? expenses[0]?.currency ?? 'EGP';
    const missing = new Set<string>();
    const shown = (amountMinor: number | bigint, from: string) => {
      if (from === currency) return Number(amountMinor);
      const converted = convertMinor(Number(amountMinor), from, currency, rates.rates);
      if (converted === null) missing.add(from);
      return converted ?? 0;
    };
    const spentBy = (list: { amountMinor: number | bigint; currency: string; direction: string; category: string }[]) => {
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
    const earlierByMonth = new Map<string, (typeof earlier)[number][]>();
    for (const expense of earlier) {
      const key = monthOf(dateText(expense.spentOn), startDay);
      earlierByMonth.set(key, earlierByMonth.get(key) ?? []);
      earlierByMonth.get(key)!.push(expense);
    }
    const history = new Map([...earlierByMonth].map(([key, list]) => [key, spentBy(list)]));
    const firstMonth = [...history.keys()].sort()[0];
    const carried = (amount: number, category?: string) => {
      let carry = 0;
      if (!firstMonth) return carry;
      for (let at = firstMonth; at < shownMonth; at = nextMonth(at)) {
        const totals = history.get(at);
        carry = Math.max(0, carry + amount - (category === undefined ? sum(totals?.values() ?? []) : (totals?.get(category) ?? 0)));
      }
      return carry;
    };
    const receivedMinor = sum(expenses.filter((expense) => expense.direction === 'received').map((expense) => shown(expense.amountMinor, expense.currency)));
    const budgeted = new Map(
      budgets.map((budget) => {
        const amount = shown(budget.amountMinor, budget.currency);
        const carriedMinor = carried(amount, budget.category);
        return [budget.category, { budgetMinor: amount + carriedMinor, carriedMinor }];
      }),
    );
    const planned = plan?.budgetMinor != null && plan.currency ? shown(plan.budgetMinor, plan.currency) : null;
    const carriedMinor = planned === null ? sum([...budgeted.values()].map((budget) => budget.carriedMinor)) : carried(planned);
    const budgetMinor = planned !== null ? planned + carriedMinor : budgets.length ? sum([...budgeted.values()].map((budget) => budget.budgetMinor)) : null;
    const spentMinor = sum(spent.values());
    const current = today >= from && today < to;
    const renewals = subscriptions.flatMap((subscription) =>
      renewalsBetween(subscription, from, to)
        .filter((day) => day >= from && !expenses.some((expense) => paysRenewal(expense, subscription, day)))
        .map((day) => ({ day, category: subscription.category, amountMinor: shown(subscription.amountMinor, subscription.currency) })),
    );
    const upcoming = renewals.filter((renewal) => current && renewal.day >= today);
    const committedMinor = sum(renewals.map((renewal) => renewal.amountMinor));
    const upcomingMinor = sum(upcoming.map((renewal) => renewal.amountMinor));
    const elapsed = daysBetween(from, today) + 1;
    const length = daysBetween(from, to);
    const paceOf = (spentSoFar: number, budget: number | null, still: number) => {
      if (budget === null || !current) return null;
      const daily = spentSoFar / elapsed;
      const projectedMinor = Math.round(spentSoFar + daily * (length - elapsed) + still);
      const room = budget - spentSoFar - still;
      if (projectedMinor <= budget) return { projectedMinor, overOn: null };
      return { projectedMinor, overOn: room <= 0 ? today : dateText(new Date(dateValue(today).getTime() + Math.ceil(room / daily) * dayMs)) };
    };
    const upcomingIn = (category: string) => sum(upcoming.filter((renewal) => renewal.category === category).map((renewal) => renewal.amountMinor));
    const totals = categories
      .map(({ name }) => name)
      .filter((category) => spent.has(category) || budgeted.has(category))
      .map((category) => {
        const budget = budgeted.get(category);
        const categorySpent = spent.get(category) ?? 0;
        return {
          category,
          spentMinor: categorySpent,
          budgetMinor: budget?.budgetMinor ?? null,
          carriedMinor: budget?.carriedMinor ?? 0,
          committedMinor: upcomingIn(category),
          pace: paceOf(categorySpent, budget?.budgetMinor ?? null, upcomingIn(category)),
        };
      })
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
      safeDailyMinor: budgetMinor !== null && current ? Math.floor(Math.max(0, budgetMinor - spentMinor - upcomingMinor) / daysBetween(today, to)) : null,
      committedMinor,
      upcomingMinor,
      pace: paceOf(spentMinor, budgetMinor, upcomingMinor),
      budgetsEnabled: user.budgetsEnabled,
      categories: totals,
      budgets: budgets.map((budget) => ({ category: budget.category, amountMinor: Number(budget.amountMinor), currency: budget.currency })),
      plan: { budgetMinor: plan?.budgetMinor == null ? null : Number(plan.budgetMinor), currency: plan?.currency ?? null, startDay, rollover: plan?.rollover ?? false },
      expenses,
    };
  }

  private async alert(userId: string) {
    const summary = await this.summary(userId);
    if (!summary.budgetsEnabled) return;
    const reached = (spent: number, budget: number) => [80, 100].filter((level) => (budget > 0 ? spent * 100 >= budget * level : spent > 0));
    const targets = [
      ...(summary.budgetMinor === null ? [] : [{ category: '', spent: summary.spentMinor, budget: summary.budgetMinor }]),
      ...summary.categories.flatMap((row) => (row.budgetMinor === null ? [] : [{ category: row.category, spent: row.spentMinor, budget: row.budgetMinor }])),
    ];
    const sent = await this.prisma.budgetAlert.findMany({ where: { userId, period: summary.month }, select: { category: true, level: true } });
    const fresh = targets
      .map((target) => ({ ...target, levels: reached(target.spent, target.budget).filter((level) => !sent.some((alert) => alert.category === target.category && alert.level === level)) }))
      .filter((target) => target.levels.length > 0);
    if (fresh.length === 0) return;
    const format = (minor: number) => new Intl.NumberFormat('en', { style: 'currency', currency: summary.currency }).format(minor / 10 ** fractionDigits(summary.currency));
    await this.prisma.$transaction(async (transaction) => {
      await transaction.budgetAlert.createMany({
        data: fresh.flatMap((target) => target.levels.map((level) => ({ userId, category: target.category, period: summary.month, level }))),
        skipDuplicates: true,
      });
      await this.inbox.notify(
        transaction,
        fresh.map((target) => {
          const budget = target.category ? `${target.category} budget` : 'monthly budget';
          return {
            userId,
            kind: 'budget_alert' as const,
            title: target.levels.includes(100) ? `Over the ${budget}` : `80% of the ${budget} used`,
            body: `${format(target.spent)} of ${format(target.budget)}`,
            link: '/spending/budgets',
          };
        }),
      );
    });
  }

  async insights(userId: string, count: number) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true, timeZone: true, monthStartDay: true } }),
      this.prisma.spendingPlan.findUnique({ where: { userId } }),
    ]);
    const startDay = user.monthStartDay;
    const current = monthOf(localDate(user.timeZone), startDay);
    const months = [current];
    while (months.length < count) months.unshift(previousMonth(months[0]!));
    const periods = months.map((month) => ({ month, ...periodOf(month, startDay) }));
    const [expenses, rates, known] = await Promise.all([
      this.prisma.expense.findMany({
        where: { userId, trashedAt: null, spentOn: { gte: dateValue(periods[0]!.from), lt: dateValue(periods.at(-1)!.to) } },
        select: { title: true, amountMinor: true, currency: true, direction: true, category: true, merchant: true, knownMerchant: { select: { id: true, name: true } }, spentOn: true },
        orderBy: { spentOn: 'asc' },
      }),
      this.rates.table(),
      this.prisma.merchant.findMany({ where: { userId }, select: { id: true, name: true, aliases: true } }),
    ]);
    const currency = user.homeCurrency ?? plan?.currency ?? expenses[0]?.currency ?? 'EGP';
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
      amount: shown(Number(expense.amountMinor), expense.currency) * (expense.direction === 'refund' ? -1 : 1),
      spending: expense.direction === 'spent' || expense.direction === 'refund',
    }));
    const merchants = new Map<string, { merchantId: string | null; merchant: string; count: number; totalMinor: number; lastOn: string }>();
    for (const row of rows.filter((candidate) => candidate.direction === 'spent')) {
      const text = (row.merchant ?? row.title).trim();
      const entity = row.knownMerchant ?? merchantFor(known, text);
      const key = entity?.id ?? text.toLowerCase();
      const seen = merchants.get(key) ?? { merchantId: entity?.id ?? null, merchant: entity?.name ?? text, count: 0, totalMinor: 0, lastOn: row.day };
      merchants.set(key, { ...seen, count: seen.count + 1, totalMinor: seen.totalMinor + row.amount, lastOn: row.day });
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

  async export(userId: string, { from, until }: ExportDto) {
    const [rows, accounts] = await Promise.all([
      this.prisma.expense.findMany({
        where: { userId, trashedAt: null, spentOn: { gte: from ? dateValue(from) : undefined, lte: until ? dateValue(until) : undefined } },
        orderBy: [{ spentOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.moneyAccount.findMany({ where: { userId }, select: { id: true, name: true } }),
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
        expense.cardDigits ?? '',
        expense.paymentLabel ?? '',
        expense.source,
        expense.id,
      ]
        .map(cell)
        .join(','),
    );
    return `${['date', 'title', 'merchant', 'type', 'amount', 'currency', 'category', 'account', 'to account', 'note', 'card', 'label', 'source', 'id'].join(',')}\r\n${lines.map((line) => `${line}\r\n`).join('')}`;
  }

  async transactions(userId: string, { cursor, limit = 100, ...filters }: TransactionsDto) {
    const where = transactionsWhere(userId, filters);
    const [rows, count, user, rates, account] = await Promise.all([
      this.prisma.expense.findMany({ where: cursor ? { AND: [where, after(readCursor(cursor))] } : where, orderBy: transactionOrder, take: limit + 1 }),
      cursor ? null : this.prisma.expense.count({ where }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true } }),
      this.rates.table(),
      filters.account ? this.prisma.moneyAccount.findFirst({ where: { id: filters.account, userId } }) : null,
    ]);
    const expenses = rows.slice(0, limit).map(present);
    const last = rows.length > limit ? expenses.at(-1)! : null;
    const currency = user.homeCurrency ?? 'EGP';
    const missing = new Set<string>();
    const shown = (amountMinor: number, from: string) => {
      if (from === currency) return amountMinor;
      const converted = convertMinor(amountMinor, from, currency, rates.rates);
      if (converted === null) missing.add(from);
      return converted;
    };
    const days = [...new Set(expenses.map((expense) => expense.spentOn))];
    const [sameDays, balances] = await Promise.all([
      days.length
        ? this.prisma.expense.findMany({ where: { AND: [where, { spentOn: { in: days.map(dateValue) } }] }, select: { amountMinor: true, currency: true, direction: true, spentOn: true } })
        : [],
      account ? this.balancesAfter(account, rates.rates) : null,
    ]);
    const totals = new Map(days.map((day) => [day, { day, spentMinor: 0, receivedMinor: 0 }]));
    for (const expense of sameDays) {
      const total = totals.get(dateText(expense.spentOn))!;
      const amount = shown(Number(expense.amountMinor), expense.currency) ?? 0;
      if (expense.direction === 'spent') total.spentMinor += amount;
      if (expense.direction === 'refund') total.spentMinor -= amount;
      if (expense.direction === 'received') total.receivedMinor += amount;
    }
    return {
      currency,
      missing: [...missing].sort(),
      count,
      next: last && cursorOf(last),
      days: [...totals.values()],
      expenses: expenses.map((expense) => ({ ...expense, balanceMinor: balances?.get(expense.id) ?? null })),
    };
  }

  private async balancesAfter(account: MoneyAccount, rates: RateTable) {
    const [[current], flows] = await Promise.all([
      this.accounts.balances([account]),
      this.prisma.expense.findMany({
        where: { userId: account.userId, trashedAt: null, OR: [{ accountId: account.id }, { toAccountId: account.id }] },
        orderBy: transactionOrder,
        select: { id: true, amountMinor: true, currency: true, direction: true, accountId: true, toAccountId: true },
      }),
    ]);
    return runningBalances(
      account.id,
      current!.balanceMinor,
      flows.map((flow) => ({ ...flow, amountMinor: Number(flow.amountMinor) })),
      (amountMinor, from) => (from === account.currency ? amountMinor : convertMinor(amountMinor, from, account.currency, rates)),
    );
  }

  async updateMany(userId: string, { ids, category, accountId }: UpdateExpensesDto) {
    if (category === undefined && accountId === undefined) throw new BadRequestException('Choose a category or an account to change');
    await this.categories.assertCategory(userId, category);
    await this.checkAccounts(userId, [{ direction: 'spent', accountId: accountId ?? null, toAccountId: null }]);
    const chosen = { id: { in: ids }, userId, trashedAt: null } satisfies Prisma.ExpenseWhereInput;
    const cards = accountId ? await this.prisma.card.findMany({ where: { accountId }, select: { id: true, last4: true } }) : [];
    const updated = await this.prisma.$transaction(async (transaction) => {
      const recategorised = category === undefined ? 0 : (await transaction.expense.updateMany({ where: { ...chosen, direction: { in: ['spent', 'refund'] } }, data: { category } })).count;
      const moved = accountId === undefined ? 0 : (await transaction.expense.updateMany({ where: { ...chosen, direction: { not: 'transfer' } }, data: { accountId, cardId: null } })).count;
      for (const card of cards) await transaction.expense.updateMany({ where: { ...chosen, accountId, cardDigits: card.last4 }, data: { cardId: card.id } });
      return Math.max(recategorised, moved);
    });
    this.changes.notify('spending', { userId });
    await this.alert(userId);
    return { updated };
  }

  async trashMany(userId: string, ids: string[], trashed: boolean) {
    const { count } = await this.prisma.expense.updateMany({
      where: { id: { in: ids }, userId, trashedAt: trashed ? null : { not: null } },
      data: { trashedAt: trashed ? new Date() : null },
    });
    this.changes.notify('spending', { userId });
    if (!trashed && count) await this.alert(userId);
    return { [trashed ? 'trashed' : 'restored']: count };
  }

  async trashed(userId: string) {
    const rows = await this.prisma.expense.findMany({ where: { userId, trashedAt: { not: null } }, orderBy: [{ trashedAt: 'desc' }, { id: 'asc' }], take: 200 });
    return rows.map(present);
  }

  async deleteMany(userId: string, ids: string[]) {
    const { count } = await this.prisma.expense.deleteMany({ where: { id: { in: ids }, userId, trashedAt: { not: null } } });
    if (count === 0) throw new BadRequestException('Move these transactions to the trash first');
    this.changes.notify('spending', { userId });
    return { deleted: count };
  }

  async create(userId: string, input: CreateExpenseDto) {
    const [id] = await this.insert(userId, [input], 'manual');
    return this.get(userId, id!);
  }

  async import(userId: string, inputs: CreateExpenseDto[]) {
    return { added: (await this.insert(userId, inputs, 'import')).length };
  }

  async capture(userId: string, input: CreateExpenseDto, source: 'sms' | 'manual') {
    const [id] = await this.insert(userId, [input], source);
    return id!;
  }

  async duplicates(userId: string, inputs: CreateExpenseDto[]) {
    const days = inputs.map((input) => input.spentOn).sort();
    const existing = await this.prisma.expense.findMany({
      where: { userId, trashedAt: null, spentOn: { gte: dateValue(dayBefore(days[0]!)), lte: dateValue(dayAfter(days.at(-1)!)) } },
      select: { id: true, amountMinor: true, currency: true, direction: true, accountId: true, spentOn: true, reference: true },
    });
    const used = new Set<string>();
    const duplicates: number[] = [];
    inputs.forEach((input, index) => {
      const match = existing.find(
        (row) =>
          !used.has(row.id) &&
          (row.reference && input.reference
            ? row.reference === input.reference
            : row.direction === (input.direction ?? 'spent') &&
              Number(row.amountMinor) === input.amountMinor &&
              row.currency === input.currency &&
              (!input.accountId || row.accountId === input.accountId) &&
              Math.abs(daysBetween(dateText(row.spentOn), input.spentOn)) <= 1),
      );
      if (!match) return;
      used.add(match.id);
      duplicates.push(index);
    });
    return { duplicates };
  }

  async get(userId: string, id: string) {
    return present(await this.row(userId, id));
  }

  async update(userId: string, id: string, input: UpdateExpenseDto) {
    const row = await this.row(userId, id);
    if (row.trashedAt) throw new BadRequestException('Restore this expense from the trash before changing it');
    const movement = movementOf({
      direction: input.direction ?? (row.direction as CreateExpenseDto['direction']),
      accountId: input.accountId === undefined ? row.accountId : input.accountId,
      toAccountId: input.toAccountId === undefined ? row.toAccountId : input.toAccountId,
    });
    await this.checkAccounts(userId, [movement]);
    await this.categories.assertCategory(userId, input.category);
    const cardDigits = input.cardDigits === undefined ? row.cardDigits : input.cardDigits;
    const [card] = movement.accountId && cardDigits ? await this.prisma.card.findMany({ where: { accountId: movement.accountId, last4: cardDigits }, select: { id: true } }) : [];
    await this.prisma.expense.update({
      where: { id },
      data: {
        title: input.title,
        amountMinor: input.amountMinor,
        currency: input.currency,
        spentOn: input.spentOn ? dateValue(input.spentOn) : undefined,
        category: input.category,
        paymentLabel: input.paymentLabel === undefined ? undefined : input.paymentLabel || null,
        note: input.note,
        merchant: input.merchant === undefined ? undefined : input.merchant || null,
        cardDigits: input.cardDigits,
        cardId: card?.id ?? null,
        kind: input.kind ?? (movement.direction === row.direction ? undefined : kindOf(movement.direction)),
        ...movement,
      },
    });
    this.changes.notify('spending', { userId });
    await this.alert(userId);
    return this.get(userId, id);
  }

  async saveBudget(userId: string, category: string, input: SaveBudgetDto) {
    await this.categories.assertCategory(userId, category);
    const budget = await this.prisma.budget.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, amountMinor: input.amountMinor, currency: input.currency },
      update: { amountMinor: input.amountMinor, currency: input.currency },
    });
    this.changes.notify('spending', { userId });
    await this.alert(userId);
    return { category: budget.category, amountMinor: Number(budget.amountMinor), currency: budget.currency };
  }

  async removeBudget(userId: string, category: string) {
    const removed = await this.prisma.budget.deleteMany({ where: { userId, category } });
    if (removed.count === 0) throw new NotFoundException('There is no budget for that category');
    this.changes.notify('spending', { userId });
  }

  private async checkAccounts(userId: string, movements: Movement[]) {
    if (movements.some(({ direction, accountId, toAccountId }) => direction === 'transfer' && (!accountId || !toAccountId || accountId === toAccountId))) {
      throw new BadRequestException('A transfer moves money between two different accounts');
    }
    const ids = [...new Set(movements.flatMap(({ accountId, toAccountId }) => [accountId, toAccountId]).filter((id): id is string => id !== null))];
    if (ids.length && (await this.prisma.moneyAccount.count({ where: { userId, id: { in: ids } } })) !== ids.length) {
      throw new BadRequestException('Choose one of your accounts');
    }
  }

  private async insert(userId: string, inputs: CreateExpenseDto[], source: string) {
    await this.checkAccounts(userId, inputs.map(movementOf));
    for (const category of new Set(inputs.map((input) => input.category))) await this.categories.assertCategory(userId, category);
    const [cards, merchants] = await Promise.all([
      this.prisma.card.findMany({ where: { account: { userId } }, select: { id: true, accountId: true, last4: true } }),
      this.prisma.merchant.findMany({ where: { userId }, select: { id: true, aliases: true } }),
    ]);
    const cardIdOf = (input: CreateExpenseDto) => cards.find((card) => card.accountId === input.accountId && card.last4 === input.cardDigits)?.id ?? null;
    const ids = await this.prisma.$transaction(async (transaction) => {
      const created: string[] = [];
      for (const input of inputs) {
        const expense = await transaction.expense.create({
          data: { userId, ...expenseData(input, source), cardId: cardIdOf(input), merchantId: merchantFor(merchants, input.merchant ?? input.title)?.id ?? null },
          select: { id: true },
        });
        created.push(expense.id);
      }
      return created;
    });
    this.changes.notify('spending', { userId });
    await this.alert(userId);
    return ids;
  }

  private async row(userId: string, id: string) {
    const row = await this.prisma.expense.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Expense not found');
    return row;
  }
}
