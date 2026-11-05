import { Injectable, OnModuleInit } from '@nestjs/common';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateValue, dayMs, localDate } from '../recurrence/dates';
import { zonedInstant } from '../recurrence/occurrences';

const reminderKind = 'journal.reminder';

export function nextJournalEvening(timeZone: string, now: Date) {
  const today = dateValue(localDate(timeZone, now)).getTime() / dayMs;
  const tonight = zonedInstant(today, 20, 0, timeZone);
  return tonight > now ? tonight : zonedInstant(today + 1, 20, 0, timeZone);
}

@Injectable()
export class JournalReminderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly maintenance: MaintenanceScheduler,
    private readonly inbox: InboxService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind((payload as { userId: string }).userId));
    this.maintenance.register((now) => this.scheduleReminders(now));
  }

  async scheduleReminders(now: Date) {
    const pending = await this.prisma.scheduledJob.findMany({ where: { kind: reminderKind, doneAt: null, failedAt: null }, select: { payload: true } });
    const waiting = new Set(pending.map(({ payload }) => (payload as { userId?: string }).userId));
    const users = await this.prisma.user.findMany({ where: { journalReminder: true, isActive: true, features: { has: 'journal' } }, select: { id: true, timeZone: true } });
    for (const user of users.filter(({ id }) => !waiting.has(id))) {
      await this.jobs.schedule(reminderKind, nextJournalEvening(user.timeZone, now), { userId: user.id });
    }
  }

  async remind(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { journalReminder: true, isActive: true, timeZone: true, features: true } });
    if (!user?.journalReminder || !user.isActive || !user.features.includes('journal')) return;
    const written = await this.prisma.journalEntry.count({ where: { userId, day: dateValue(localDate(user.timeZone)) } });
    if (written) return;
    await this.inbox.notify(this.prisma, [{ userId, kind: 'journal_reminder', title: 'Write today’s journal', body: 'A line or two about the day is enough.', link: '/journal' }]);
  }
}
