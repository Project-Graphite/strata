import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { InboxService } from '../inbox/inbox.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { InstallmentsService } from '../spending/installments.service';
import { SpendingService } from '../spending/spending.service';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly tasks: TasksService,
    private readonly spending: SpendingService,
    private readonly installments: InstallmentsService,
    private readonly invitations: InvitationsService,
    private readonly inbox: InboxService,
  ) {}

  async summary(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, features: true } });
    const today = localDate(user.timeZone);
    const personal = user.features.includes('spending') ? await this.prisma.space.findFirst({ where: { personalOwnerId: userId }, select: { id: true } }) : null;
    const [agenda, due, invitations, inbox, month, plans, toReview] = await Promise.all([
      this.events.agenda(userId, today, dateText(new Date(dateValue(today).getTime() + 7 * dayMs))),
      this.tasks.today(userId),
      this.invitations.received(userId),
      this.inbox.summary(userId),
      personal ? this.spending.month(userId, personal.id) : null,
      personal ? this.installments.list(userId, personal.id) : [],
      personal ? this.prisma.capturedMessage.count({ where: { spaceId: personal.id, status: 'review', textSealed: { not: null } } }) : 0,
    ]);
    const now = new Date().toISOString();
    return {
      nextEvent: agenda.find((entry) => (entry.kind === 'event' || entry.kind === 'external') && !entry.allDay && entry.end! > now) ?? null,
      dueToday: due.length,
      safeToSpend: month?.safeDailyMinor == null ? null : { amountMinor: month.safeDailyMinor, currency: month.currency },
      toReview,
      payments: {
        missed: plans.filter((plan) => plan.status === 'missed').length,
        upcoming: personal ? agenda.filter((entry) => entry.kind === 'payment').length : 0,
      },
      invitations: invitations.length,
      unread: inbox.unread,
    };
  }
}
