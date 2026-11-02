import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InstallmentPlan } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { fractionDigits } from '../exchange-rates/exchange-rates.service';
import { InboxService } from '../inbox/inbox.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, localDate, readableDay } from '../recurrence/dates';
import { AccountsService } from './accounts.service';
import { CreateInstallmentDto, UpdateInstallmentDto } from './dto/installments.dto';
import { daysBetween } from './periods';

const cardReminderDays = 3;

export function addMonths(day: string, months: number) {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return dateText(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, last))));
}

export function nextCardDue(today: string, dueDay: number) {
  const day = `${today.slice(0, 8)}${String(dueDay).padStart(2, '0')}`;
  const candidate = addMonths(day, 0);
  return candidate >= today ? candidate : addMonths(day, 1);
}

export const dueDates = (plan: Pick<InstallmentPlan, 'firstDueOn' | 'count'>) =>
  Array.from({ length: plan.count }, (_, index) => addMonths(dateText(plan.firstDueOn), index));

function present(plan: InstallmentPlan, today: string) {
  const nextDueOn = plan.paidCount < plan.count ? addMonths(dateText(plan.firstDueOn), plan.paidCount) : null;
  const monthlyMinor = Number(plan.monthlyMinor);
  return {
    id: plan.id,
    accountId: plan.accountId,
    name: plan.name,
    currency: plan.currency,
    monthlyMinor,
    count: plan.count,
    firstDueOn: dateText(plan.firstDueOn),
    paidCount: plan.paidCount,
    reminderDays: plan.reminderDays,
    totalMinor: monthlyMinor * plan.count,
    remainingMinor: monthlyMinor * (plan.count - plan.paidCount),
    nextDueOn,
    status: nextDueOn === null ? 'done' : nextDueOn < today ? 'missed' : 'due',
  };
}

@Injectable()
export class InstallmentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly inbox: InboxService,
    private readonly maintenance: MaintenanceScheduler,
    private readonly changes: ChangesService,
  ) {}

  onModuleInit() {
    this.maintenance.register((now) => this.remind(now));
  }

  async list(userId: string) {
    const today = await this.today(userId);
    const plans = await this.prisma.installmentPlan.findMany({ where: { userId }, orderBy: [{ firstDueOn: 'asc' }, { createdAt: 'asc' }] });
    return plans.map((plan) => present(plan, today));
  }

  async create(userId: string, input: CreateInstallmentDto) {
    await this.assertAccount(userId, input.accountId);
    const plan = await this.prisma.installmentPlan.create({
      data: { userId, ...input, firstDueOn: dateValue(input.firstDueOn), accountId: input.accountId ?? null },
    });
    this.changes.notify('spending', { userId });
    return present(plan, await this.today(userId));
  }

  async update(userId: string, id: string, input: UpdateInstallmentDto) {
    const plan = await this.find(userId, id);
    await this.assertAccount(userId, input.accountId);
    if ((input.paidCount ?? plan.paidCount) > (input.count ?? plan.count)) throw new BadRequestException('More payments are marked paid than the plan has');
    const updated = await this.prisma.installmentPlan.update({
      where: { id },
      data: { ...input, firstDueOn: input.firstDueOn ? dateValue(input.firstDueOn) : undefined },
    });
    this.changes.notify('spending', { userId });
    return present(updated, await this.today(userId));
  }

  async paid(userId: string, id: string) {
    const plan = await this.find(userId, id);
    if (plan.paidCount >= plan.count) throw new BadRequestException('Every payment is already marked paid');
    const updated = await this.prisma.installmentPlan.update({ where: { id }, data: { paidCount: { increment: 1 } } });
    this.changes.notify('spending', { userId });
    return present(updated, await this.today(userId));
  }

  async remove(userId: string, id: string) {
    const plan = await this.find(userId, id);
    await this.prisma.installmentPlan.delete({ where: { id: plan.id } });
    this.changes.notify('spending', { userId });
  }

  async remind(now: Date) {
    const today = dateText(now);
    const plans = await this.prisma.installmentPlan.findMany();
    const cards = await this.prisma.moneyAccount.findMany({ where: { kind: 'credit_card', dueDay: { not: null } } });
    const notes: { userId: string; title: string; body: string }[] = [];
    for (const plan of plans) {
      if (plan.paidCount >= plan.count) continue;
      const due = addMonths(dateText(plan.firstDueOn), plan.paidCount);
      const days = daysBetween(today, due);
      const amount = this.format(Number(plan.monthlyMinor), plan.currency);
      if (days >= 0 && days <= plan.reminderDays && dateText(plan.remindedOn) !== due) {
        notes.push({ userId: plan.userId, title: `${plan.name} is due ${days === 0 ? 'today' : `on ${readableDay(due)}`}`, body: `${amount}, payment ${plan.paidCount + 1} of ${plan.count}` });
        await this.prisma.installmentPlan.update({ where: { id: plan.id }, data: { remindedOn: dateValue(due) } });
      }
      if (days < 0 && dateText(plan.missedOn) !== due) {
        notes.push({ userId: plan.userId, title: `Missed payment: ${plan.name}`, body: `${amount} was due on ${readableDay(due)}` });
        await this.prisma.installmentPlan.update({ where: { id: plan.id }, data: { missedOn: dateValue(due) } });
      }
    }
    for (const card of await this.accounts.balances(cards)) {
      const account = cards.find((candidate) => candidate.id === card.id)!;
      const due = nextCardDue(today, account.dueDay!);
      if (card.balanceMinor >= 0 || daysBetween(today, due) > cardReminderDays || dateText(account.dueRemindedOn) === due) continue;
      notes.push({ userId: account.userId, title: `${card.name} is due ${due === today ? 'today' : `on ${readableDay(due)}`}`, body: `${this.format(-card.balanceMinor, card.currency)} owed` });
      await this.prisma.moneyAccount.update({ where: { id: card.id }, data: { dueRemindedOn: dateValue(due) } });
    }
    if (notes.length === 0) return;
    await this.inbox.notify(
      this.prisma,
      notes.map((note) => ({ userId: note.userId, kind: 'payment_due' as const, title: note.title, body: note.body, link: '/spending/accounts' })),
    );
  }

  private format(minor: number, currency: string) {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 10 ** fractionDigits(currency));
  }

  private async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    return localDate(user.timeZone);
  }

  private async assertAccount(userId: string, accountId: string | null | undefined) {
    if (accountId && !(await this.prisma.moneyAccount.count({ where: { id: accountId, userId } }))) throw new BadRequestException('Choose one of your accounts');
  }

  private async find(userId: string, id: string) {
    const plan = await this.prisma.installmentPlan.findFirst({ where: { id, userId } });
    if (!plan) throw new NotFoundException('Installment plan not found');
    return plan;
  }
}
