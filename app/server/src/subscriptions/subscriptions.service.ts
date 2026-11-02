import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, Subscription } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService, ratesSourcesOf } from '../exchange-rates/exchange-rates.service';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate, readableDay } from '../recurrence/dates';
import { occurrences, zonedInstant } from '../recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';
import { CreateSubscriptionDto, ListSubscriptionsDto, UpdateSubscriptionDto } from './dto/subscriptions.dto';

const reminderKind = 'subscription.reminder';
const unusedAfterDays = 60;
const trialWarningDays = 14;

type Reminder = { subscriptionId: string; on: 'renewal' | 'trial'; date: string };

function present(row: Subscription) {
  return {
    id: row.id,
    name: row.name,
    amountMinor: row.amountMinor,
    currency: row.currency,
    repeatRule: row.repeatRule,
    startDate: dateText(row.startDate),
    nextRenewal: dateText(row.nextRenewal),
    timeZone: row.timeZone,
    trialEndsOn: dateText(row.trialEndsOn),
    noticeDays: row.noticeDays,
    category: row.category,
    paymentLabel: row.paymentLabel,
    cancelUrl: row.cancelUrl,
    supportUrl: row.supportUrl,
    usedBy: row.usedBy,
    reminderDays: row.reminderDays,
    lastUsedOn: dateText(row.lastUsedOn),
    cancelledOn: dateText(row.cancelledOn),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function money(amountMinor: number, currency: string) {
  const format = new Intl.NumberFormat('en', { style: 'currency', currency });
  return format.format(amountMinor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

function checkedRule(text: string) {
  try {
    return formatRule(parseRule(text));
  } catch (error) {
    if (error instanceof RuleError) throw new BadRequestException(error.message);
    throw error;
  }
}

export function renewalsBetween(details: Pick<Subscription, 'repeatRule' | 'startDate' | 'timeZone'>, from: string, to: string, limit = 400) {
  return occurrences(
    parseRule(details.repeatRule),
    { date: dateText(details.startDate), time: '00:00', timeZone: details.timeZone },
    {
      from: zonedInstant(dateValue(from).getTime() / dayMs, 0, 0, details.timeZone),
      to: zonedInstant(dateValue(to).getTime() / dayMs, 0, 0, details.timeZone),
    },
    limit,
  ).map((at) => localDate(details.timeZone, at));
}

export function yearlyCost(details: Pick<Subscription, 'repeatRule' | 'startDate' | 'timeZone' | 'amountMinor'>) {
  const today = localDate(details.timeZone);
  const yearAhead = dateText(new Date(dateValue(today).getTime() + 365 * dayMs));
  return renewalsBetween(details, today, yearAhead).length * details.amountMinor;
}

export function unused(row: Pick<Subscription, 'createdAt' | 'lastUsedOn' | 'timeZone'>) {
  const lastUse = row.lastUsedOn ?? new Date(row.createdAt.toISOString().slice(0, 10));
  return dateValue(localDate(row.timeZone)).getTime() - lastUse.getTime() >= unusedAfterDays * dayMs;
}

function nextRenewal(details: Pick<Subscription, 'repeatRule' | 'startDate' | 'timeZone'>, onOrAfter: string) {
  const until = dateText(new Date(dateValue(onOrAfter).getTime() + 20 * 366 * dayMs));
  return renewalsBetween(details, onOrAfter, until, 1)[0] ?? null;
}

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly jobs: JobsService,
    private readonly maintenance: MaintenanceScheduler,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly changes: ChangesService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind(payload as Reminder));
    this.maintenance.register((now) => this.advanceRenewals(now));
  }

  async create(userId: string, input: CreateSubscriptionDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const timeZone = input.timeZone ?? user.timeZone;
    const repeatRule = checkedRule(input.repeatRule);
    const next = nextRenewal({ repeatRule, startDate: dateValue(input.startDate), timeZone }, localDate(timeZone));
    if (!next) throw new BadRequestException('This billing cycle has no renewals left');
    const id = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.subscription.create({
        data: {
          userId,
          name: input.name,
          amountMinor: input.amountMinor,
          currency: input.currency,
          repeatRule,
          startDate: dateValue(input.startDate),
          nextRenewal: dateValue(next),
          timeZone,
          trialEndsOn: input.trialEndsOn ? dateValue(input.trialEndsOn) : null,
          noticeDays: input.noticeDays,
          category: input.category,
          paymentLabel: input.paymentLabel,
          cancelUrl: input.cancelUrl,
          supportUrl: input.supportUrl,
          usedBy: input.usedBy,
          reminderDays: input.reminderDays,
          prices: { create: { amountMinor: input.amountMinor, currency: input.currency, effectiveFrom: dateValue(input.startDate) } },
        },
        select: { id: true },
      });
      await this.reschedule(transaction, row.id);
      return row.id;
    });
    this.changes.notify('subscriptions', { userId });
    return this.get(userId, id);
  }

  async list(userId: string, query: ListSubscriptionsDto) {
    const rows = await this.prisma.subscription.findMany({
      where: { userId, cancelledOn: query.status === 'cancelled' ? { not: null } : null },
      orderBy: [{ nextRenewal: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return rows.map(present);
  }

  async get(userId: string, id: string) {
    return present(await this.own(userId, id));
  }

  async prices(userId: string, id: string) {
    await this.own(userId, id);
    return this.prisma.subscriptionPrice.findMany({
      where: { subscriptionId: id },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { amountMinor: true, currency: true, effectiveFrom: true },
    });
  }

  async update(userId: string, id: string, input: UpdateSubscriptionDto) {
    const details = await this.own(userId, id);
    const repeatRule = input.repeatRule === undefined ? details.repeatRule : checkedRule(input.repeatRule);
    const startDate = input.startDate === undefined ? details.startDate : dateValue(input.startDate);
    const timeZone = input.timeZone ?? details.timeZone;
    const scheduleChanged = repeatRule !== details.repeatRule || startDate.getTime() !== details.startDate.getTime() || timeZone !== details.timeZone;
    const next = scheduleChanged ? nextRenewal({ repeatRule, startDate, timeZone }, localDate(timeZone)) : dateText(details.nextRenewal);
    if (!next) throw new BadRequestException('This billing cycle has no renewals left');
    const amountMinor = input.amountMinor ?? details.amountMinor;
    const currency = input.currency ?? details.currency;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.update({
        where: { id },
        data: {
          name: input.name,
          amountMinor,
          currency,
          repeatRule,
          startDate,
          timeZone,
          nextRenewal: dateValue(next),
          trialEndsOn: input.trialEndsOn === undefined ? undefined : input.trialEndsOn ? dateValue(input.trialEndsOn) : null,
          noticeDays: input.noticeDays,
          category: input.category,
          paymentLabel: input.paymentLabel,
          cancelUrl: input.cancelUrl,
          supportUrl: input.supportUrl,
          usedBy: input.usedBy,
          reminderDays: input.reminderDays,
        },
      });
      if (amountMinor !== details.amountMinor || currency !== details.currency) {
        await transaction.subscriptionPrice.create({ data: { subscriptionId: id, amountMinor, currency, effectiveFrom: dateValue(localDate(timeZone)) } });
      }
      await this.reschedule(transaction, id);
    });
    this.changes.notify('subscriptions', { userId });
    return this.get(userId, id);
  }

  async markUsed(userId: string, id: string) {
    const current = await this.own(userId, id);
    await this.prisma.subscription.update({ where: { id }, data: { lastUsedOn: dateValue(localDate(current.timeZone)) } });
    this.changes.notify('subscriptions', { userId });
    return this.get(userId, id);
  }

  async cancel(userId: string, id: string) {
    const current = await this.own(userId, id);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.update({ where: { id }, data: { cancelledOn: dateValue(localDate(current.timeZone)) } });
      await this.reschedule(transaction, id);
    });
    this.changes.notify('subscriptions', { userId });
    return this.get(userId, id);
  }

  async resume(userId: string, id: string) {
    const current = await this.own(userId, id);
    const next = nextRenewal(current, localDate(current.timeZone));
    if (!next) throw new BadRequestException('This billing cycle has no renewals left');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.update({ where: { id }, data: { cancelledOn: null, nextRenewal: dateValue(next) } });
      await this.reschedule(transaction, id);
    });
    this.changes.notify('subscriptions', { userId });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.delete({ where: { id } });
      await this.unschedule(transaction, id);
    });
    this.changes.notify('subscriptions', { userId });
  }

  async summary(userId: string) {
    const rows = await this.prisma.subscription.findMany({ where: { userId, cancelledOn: null } });
    const totals = new Map<string, { currency: string; yearlyMinor: number }>();
    const byCategory = new Map<string, { category: string; currency: string; yearlyMinor: number }>();
    const stale: Subscription[] = [];
    const trials: Subscription[] = [];
    for (const row of rows) {
      const today = localDate(row.timeZone);
      const yearlyMinor = yearlyCost(row);
      const total = totals.get(row.currency) ?? { currency: row.currency, yearlyMinor: 0 };
      total.yearlyMinor += yearlyMinor;
      totals.set(row.currency, total);
      const key = `${row.category}|${row.currency}`;
      const category = byCategory.get(key) ?? { category: row.category, currency: row.currency, yearlyMinor: 0 };
      category.yearlyMinor += yearlyMinor;
      byCategory.set(key, category);
      if (unused(row)) stale.push(row);
      if (row.trialEndsOn && dateText(row.trialEndsOn) >= today && row.trialEndsOn.getTime() - dateValue(today).getTime() <= trialWarningDays * dayMs) {
        trials.push(row);
      }
    }
    const withMonthly = <T extends { yearlyMinor: number }>(entry: T) => ({ ...entry, monthlyMinor: Math.round(entry.yearlyMinor / 12) });
    const { homeCurrency } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true } });
    return {
      home: homeCurrency && totals.size > 0 ? await this.homeTotal(homeCurrency, [...totals.values()]) : null,
      totals: [...totals.values()].map(withMonthly).sort((a, b) => a.currency.localeCompare(b.currency)),
      categories: [...byCategory.values()].map(withMonthly).sort((a, b) => b.yearlyMinor - a.yearlyMinor),
      upcoming: [...rows]
        .sort((a, b) => a.nextRenewal.getTime() - b.nextRenewal.getTime())
        .slice(0, 10)
        .map(present),
      trials: trials.map(present),
      stillWorthIt: stale.map(present),
    };
  }

  private async homeTotal(currency: string, totals: { currency: string; yearlyMinor: number }[]) {
    const { publishedOn, rates, sources } = await this.exchangeRates.table();
    let yearlyMinor = 0;
    const missing: string[] = [];
    for (const total of totals) {
      const converted = convertMinor(total.yearlyMinor, total.currency, currency, rates);
      if (converted === null) missing.push(total.currency);
      else yearlyMinor += converted;
    }
    const converted = totals.filter((total) => total.currency !== currency && !missing.includes(total.currency)).map((total) => total.currency);
    return {
      currency,
      yearlyMinor,
      monthlyMinor: Math.round(yearlyMinor / 12),
      ratesOn: publishedOn,
      ratesFrom: converted.length ? ratesSourcesOf(sources, [currency, ...converted]) : [],
      missing,
    };
  }

  async advanceRenewals(now: Date) {
    const due = await this.prisma.subscription.findMany({ where: { cancelledOn: null, nextRenewal: { lte: dateValue(dateText(now)) } }, take: 500 });
    for (const subscription of due) {
      const today = localDate(subscription.timeZone, now);
      if (dateText(subscription.nextRenewal) >= today) continue;
      const next = nextRenewal(subscription, today);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.subscription.update({
          where: { id: subscription.id },
          data: next ? { nextRenewal: dateValue(next) } : { cancelledOn: subscription.nextRenewal },
        });
        await this.reschedule(transaction, subscription.id);
      });
      this.changes.notify('subscriptions', { userId: subscription.userId });
    }
  }

  private async own(userId: string, id: string) {
    const row = await this.prisma.subscription.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Subscription not found');
    return row;
  }

  private unschedule(client: Prisma.TransactionClient, subscriptionId: string) {
    return client.scheduledJob.deleteMany({
      where: { kind: reminderKind, doneAt: null, failedAt: null, payload: { path: ['subscriptionId'], equals: subscriptionId } },
    });
  }

  private async reschedule(client: Prisma.TransactionClient, subscriptionId: string) {
    await this.unschedule(client, subscriptionId);
    const details = await client.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (details.cancelledOn || details.reminderDays === null) return;
    const remindAt = (date: Date) => zonedInstant(date.getTime() / dayMs - details.reminderDays!, 9, 0, details.timeZone);
    const reminders = [
      { on: 'renewal' as const, date: details.nextRenewal },
      ...(details.trialEndsOn ? [{ on: 'trial' as const, date: details.trialEndsOn }] : []),
    ];
    for (const reminder of reminders) {
      const at = remindAt(reminder.date);
      if (at > new Date()) {
        await this.jobs.schedule(reminderKind, at, { subscriptionId, on: reminder.on, date: dateText(reminder.date) } satisfies Reminder, client);
      }
    }
  }

  private async remind(payload: Reminder) {
    const details = await this.prisma.subscription.findUnique({ where: { id: payload.subscriptionId } });
    if (!details || details.cancelledOn) return;
    const current = payload.on === 'trial' ? details.trialEndsOn : details.nextRenewal;
    if (!current || dateText(current) !== payload.date) return;
    const amount = money(details.amountMinor, details.currency);
    await this.inbox.notify(this.prisma, [
      {
        userId: details.userId,
        kind: 'subscription_due',
        title:
          payload.on === 'trial'
            ? `The free trial of ${details.name} ends on ${readableDay(payload.date)}, then it costs ${amount}`
            : `${details.name} renews on ${readableDay(payload.date)} for ${amount}`,
        link: `/spending/recurring?subscription=${details.id}`,
      },
    ]);
  }
}
