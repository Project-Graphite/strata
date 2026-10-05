import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { convertMinor, ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { occurrences, zonedInstant } from '../recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';
import { CreateSubscriptionDto, ListSubscriptionsDto, UpdateSubscriptionDto } from './dto/subscriptions.dto';

const reminderKind = 'subscription.reminder';
const unusedAfterDays = 60;
const trialWarningDays = 14;

export const subscriptionFields = {
  id: true,
  spaceId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  subscription: true,
} satisfies Prisma.ItemSelect;

type SubscriptionRow = Prisma.ItemGetPayload<{ select: typeof subscriptionFields }>;
export type Details = NonNullable<SubscriptionRow['subscription']>;

function present(row: SubscriptionRow) {
  const details = row.subscription!;
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.title,
    amountMinor: details.amountMinor,
    currency: details.currency,
    repeatRule: details.repeatRule,
    startDate: dateText(details.startDate),
    nextRenewal: dateText(details.nextRenewal),
    timeZone: details.timeZone,
    trialEndsOn: dateText(details.trialEndsOn),
    noticeDays: details.noticeDays,
    category: details.category,
    paymentLabel: details.paymentLabel,
    cancelUrl: details.cancelUrl,
    supportUrl: details.supportUrl,
    usedBy: details.usedBy,
    reminderDays: details.reminderDays,
    lastUsedOn: dateText(details.lastUsedOn),
    cancelledOn: dateText(details.cancelledOn),
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

function renewalsBetween(details: Pick<Details, 'repeatRule' | 'startDate' | 'timeZone'>, from: string, to: string, limit = 400) {
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

export function yearlyCost(details: Details) {
  const today = localDate(details.timeZone);
  const yearAhead = dateText(new Date(dateValue(today).getTime() + 365 * dayMs));
  return renewalsBetween(details, today, yearAhead).length * details.amountMinor;
}

export function unused(row: { createdAt: Date; subscription: Details }) {
  const lastUse = row.subscription.lastUsedOn ?? new Date(row.createdAt.toISOString().slice(0, 10));
  return dateValue(localDate(row.subscription.timeZone)).getTime() - lastUse.getTime() >= unusedAfterDays * dayMs;
}

function nextRenewal(details: Pick<Details, 'repeatRule' | 'startDate' | 'timeZone'>, onOrAfter: string) {
  const until = dateText(new Date(dateValue(onOrAfter).getTime() + 20 * 366 * dayMs));
  return renewalsBetween(details, onOrAfter, until, 1)[0] ?? null;
}

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly inbox: InboxService,
    private readonly jobs: JobsService,
    private readonly maintenance: MaintenanceScheduler,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind(payload as { itemId: string; on: 'renewal' | 'trial'; date: string }));
    this.maintenance.register((now) => this.advanceRenewals(now));
  }

  async create(userId: string, spaceId: string, input: CreateSubscriptionDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const timeZone = input.timeZone ?? user.timeZone;
    const repeatRule = checkedRule(input.repeatRule);
    const next = nextRenewal({ repeatRule, startDate: dateValue(input.startDate), timeZone }, localDate(timeZone));
    if (!next) throw new BadRequestException('This billing cycle has no renewals left');
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          spaceId,
          kind: ItemKind.SUBSCRIPTION,
          title: input.name,
          createdById: userId,
          updatedById: userId,
          subscription: {
            create: {
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
            },
          },
          prices: { create: { amountMinor: input.amountMinor, currency: input.currency, effectiveFrom: dateValue(input.startDate) } },
        },
        select: { id: true },
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: input.name } });
      await this.reschedule(transaction, item.id);
      return item.id;
    });
    return this.get(userId, id);
  }

  async list(userId: string, spaceId: string, query: ListSubscriptionsDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const rows = await this.prisma.item.findMany({
      where: {
        spaceId,
        kind: ItemKind.SUBSCRIPTION,
        trashedAt: null,
        subscription: { cancelledOn: query.status === 'cancelled' ? { not: null } : null },
      },
      orderBy: [{ subscription: { nextRenewal: 'asc' } }, { title: 'asc' }, { id: 'asc' }],
      take: 500,
      select: subscriptionFields,
    });
    return rows.map(present);
  }

  async get(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: subscriptionFields });
    if (!row.subscription) throw new NotFoundException('That item is not a subscription');
    return present(row);
  }

  async prices(userId: string, itemId: string) {
    await this.get(userId, itemId);
    return this.prisma.subscriptionPrice.findMany({
      where: { itemId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { amountMinor: true, currency: true, effectiveFrom: true },
    });
  }

  async update(userId: string, itemId: string, input: UpdateSubscriptionDto) {
    const current = await this.editable(userId, itemId);
    const details = current.subscription;
    const repeatRule = input.repeatRule === undefined ? details.repeatRule : checkedRule(input.repeatRule);
    const startDate = input.startDate === undefined ? details.startDate : dateValue(input.startDate);
    const timeZone = input.timeZone ?? details.timeZone;
    const scheduleChanged = repeatRule !== details.repeatRule || startDate.getTime() !== details.startDate.getTime() || timeZone !== details.timeZone;
    const next = scheduleChanged ? nextRenewal({ repeatRule, startDate, timeZone }, localDate(timeZone)) : dateText(details.nextRenewal);
    if (!next) throw new BadRequestException('This billing cycle has no renewals left');
    const amountMinor = input.amountMinor ?? details.amountMinor;
    const currency = input.currency ?? details.currency;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: {
          title: input.name,
          updatedById: userId,
          subscription: {
            update: {
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
          },
        },
      });
      if (amountMinor !== details.amountMinor || currency !== details.currency) {
        await transaction.subscriptionPrice.create({
          data: { itemId, amountMinor, currency, effectiveFrom: dateValue(localDate(timeZone)) },
        });
      }
      if (input.name !== undefined && input.name !== current.title) {
        await this.activity.record(transaction, {
          spaceId: current.spaceId,
          actorId: userId,
          itemId,
          verb: 'item.updated',
          data: { title: input.name, renamedFrom: current.title },
        });
      }
      await this.reschedule(transaction, itemId);
    });
    return this.get(userId, itemId);
  }

  async markUsed(userId: string, itemId: string) {
    const current = await this.editable(userId, itemId);
    await this.prisma.subscription.update({
      where: { itemId },
      data: { lastUsedOn: dateValue(localDate(current.subscription.timeZone)) },
    });
    return this.get(userId, itemId);
  }

  async cancel(userId: string, itemId: string) {
    const current = await this.editable(userId, itemId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.update({
        where: { itemId },
        data: { cancelledOn: dateValue(localDate(current.subscription.timeZone)) },
      });
      await this.activity.record(transaction, {
        spaceId: current.spaceId,
        actorId: userId,
        itemId,
        verb: 'subscription.cancelled',
        data: { title: current.title },
      });
      await this.reschedule(transaction, itemId);
    });
    return this.get(userId, itemId);
  }

  async resume(userId: string, itemId: string) {
    const current = await this.editable(userId, itemId);
    const next = nextRenewal(current.subscription, localDate(current.subscription.timeZone));
    if (!next) throw new BadRequestException('This billing cycle has no renewals left');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subscription.update({ where: { itemId }, data: { cancelledOn: null, nextRenewal: dateValue(next) } });
      await this.activity.record(transaction, {
        spaceId: current.spaceId,
        actorId: userId,
        itemId,
        verb: 'subscription.resumed',
        data: { title: current.title },
      });
      await this.reschedule(transaction, itemId);
    });
    return this.get(userId, itemId);
  }

  async summary(userId: string) {
    const rows = await this.prisma.item.findMany({
      where: { ...this.access.itemsOf(userId), kind: ItemKind.SUBSCRIPTION, trashedAt: null, subscription: { cancelledOn: null } },
      select: subscriptionFields,
    });
    const totals = new Map<string, { currency: string; yearlyMinor: number }>();
    const byCategory = new Map<string, { category: string; currency: string; yearlyMinor: number }>();
    const stale: SubscriptionRow[] = [];
    const trials: SubscriptionRow[] = [];
    for (const row of rows) {
      const details = row.subscription!;
      const today = localDate(details.timeZone);
      const yearlyMinor = yearlyCost(details);
      const total = totals.get(details.currency) ?? { currency: details.currency, yearlyMinor: 0 };
      total.yearlyMinor += yearlyMinor;
      totals.set(details.currency, total);
      const key = `${details.category}|${details.currency}`;
      const category = byCategory.get(key) ?? { category: details.category, currency: details.currency, yearlyMinor: 0 };
      category.yearlyMinor += yearlyMinor;
      byCategory.set(key, category);
      if (unused({ createdAt: row.createdAt, subscription: details })) stale.push(row);
      if (details.trialEndsOn && dateText(details.trialEndsOn) >= today && details.trialEndsOn.getTime() - dateValue(today).getTime() <= trialWarningDays * dayMs) {
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
        .sort((a, b) => a.subscription!.nextRenewal.getTime() - b.subscription!.nextRenewal.getTime())
        .slice(0, 10)
        .map(present),
      trials: trials.map(present),
      stillWorthIt: stale.map(present),
    };
  }

  private async homeTotal(currency: string, totals: { currency: string; yearlyMinor: number }[]) {
    const { publishedOn, rates } = await this.exchangeRates.table();
    let yearlyMinor = 0;
    const missing: string[] = [];
    for (const total of totals) {
      const converted = convertMinor(total.yearlyMinor, total.currency, currency, rates);
      if (converted === null) missing.push(total.currency);
      else yearlyMinor += converted;
    }
    return { currency, yearlyMinor, monthlyMinor: Math.round(yearlyMinor / 12), ratesOn: publishedOn, missing };
  }

  async advanceRenewals(now: Date) {
    const due = await this.prisma.subscription.findMany({
      where: { cancelledOn: null, nextRenewal: { lte: dateValue(dateText(now)) }, item: { trashedAt: null } },
      select: { itemId: true, repeatRule: true, startDate: true, timeZone: true, nextRenewal: true, item: { select: { spaceId: true, title: true } } },
      take: 500,
    });
    for (const subscription of due) {
      const today = localDate(subscription.timeZone, now);
      if (dateText(subscription.nextRenewal) >= today) continue;
      const next = nextRenewal(subscription, today);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.subscription.update({
          where: { itemId: subscription.itemId },
          data: next ? { nextRenewal: dateValue(next) } : { cancelledOn: subscription.nextRenewal },
        });
        await this.activity.record(transaction, {
          spaceId: subscription.item.spaceId,
          actorId: null,
          itemId: subscription.itemId,
          verb: next ? 'subscription.renewed' : 'subscription.cancelled',
          data: { title: subscription.item.title, ...(next ? { nextRenewal: next } : {}) },
        });
        await this.reschedule(transaction, subscription.itemId);
      });
    }
  }

  private async editable(userId: string, itemId: string) {
    const found = await this.access.assertItem(userId, itemId, 'edit');
    if (found.trashedAt) throw new BadRequestException('Restore this subscription from the trash before changing it');
    const item = await this.prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      select: { spaceId: true, title: true, subscription: true },
    });
    if (!item.subscription) throw new NotFoundException('That item is not a subscription');
    return { ...item, subscription: item.subscription };
  }

  private async reschedule(client: Prisma.TransactionClient, itemId: string) {
    await client.scheduledJob.deleteMany({
      where: { kind: reminderKind, doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: itemId } },
    });
    const details = await client.subscription.findUniqueOrThrow({ where: { itemId } });
    if (details.cancelledOn || details.reminderDays === null) return;
    const remindAt = (date: Date) =>
      zonedInstant(date.getTime() / dayMs - details.reminderDays!, 9, 0, details.timeZone);
    const reminders = [
      { on: 'renewal' as const, date: details.nextRenewal },
      ...(details.trialEndsOn ? [{ on: 'trial' as const, date: details.trialEndsOn }] : []),
    ];
    for (const reminder of reminders) {
      const at = remindAt(reminder.date);
      if (at > new Date()) {
        await this.jobs.schedule(reminderKind, at, { itemId, on: reminder.on, date: dateText(reminder.date) }, client);
      }
    }
  }

  private async remind(payload: { itemId: string; on: 'renewal' | 'trial'; date: string }) {
    const item = await this.prisma.item.findUnique({
      where: { id: payload.itemId },
      select: { spaceId: true, title: true, trashedAt: true, createdById: true, subscription: true },
    });
    const details = item?.subscription;
    if (!item || !details || item.trashedAt || details.cancelledOn || !item.createdById) return;
    const current = payload.on === 'trial' ? details.trialEndsOn : details.nextRenewal;
    if (!current || dateText(current) !== payload.date) return;
    const amount = money(details.amountMinor, details.currency);
    await this.inbox.notify(this.prisma, [
      {
        userId: item.createdById,
        kind: 'subscription_due',
        title:
          payload.on === 'trial'
            ? `The free trial of ${item.title} ends on ${payload.date}, then it costs ${amount}`
            : `${item.title} renews on ${payload.date} for ${amount}`,
        link: `/spaces/${item.spaceId}/recurring`,
      },
    ]);
  }
}
