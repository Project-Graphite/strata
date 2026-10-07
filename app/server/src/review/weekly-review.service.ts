import { Injectable, OnModuleInit } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { EventsService } from '../events/events.service';
import { shiftDay } from '../habits/streaks';
import { HabitsService } from '../habits/habits.service';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { NotesService } from '../notes/notes.service';
import { blocksDocument, type Block } from '../notes/templates';
import { PrismaService } from '../prisma/prisma.service';
import { dateValue, dayMs, localDate } from '../recurrence/dates';
import { zonedInstant } from '../recurrence/occurrences';

const reminderKind = 'weekly-review.reminder';
const parentTitle = 'Weekly reviews';

export function nextSundayEvening(timeZone: string, now: Date) {
  const today = dateValue(localDate(timeZone, now)).getTime() / dayMs;
  const sunday = today + ((7 - new Date(today * dayMs).getUTCDay()) % 7);
  const candidate = zonedInstant(sunday, 18, 0, timeZone);
  return candidate > now ? candidate : zonedInstant(sunday + 7, 18, 0, timeZone);
}

const section = (heading: string, lines: string[], empty: string): Block[] => [['heading', heading], lines.length ? ['bullets', lines] : ['paragraph', empty]];

@Injectable()
export class WeeklyReviewService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notes: NotesService,
    private readonly events: EventsService,
    private readonly habits: HabitsService,
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
    const users = await this.prisma.user.findMany({ where: { weeklyReview: true, isActive: true }, select: { id: true, timeZone: true } });
    for (const user of users.filter(({ id }) => !waiting.has(id))) {
      await this.jobs.schedule(reminderKind, nextSundayEvening(user.timeZone, now), { userId: user.id });
    }
  }

  async remind(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { weeklyReview: true, isActive: true } });
    if (!user?.weeklyReview || !user.isActive) return;
    await this.inbox.notify(this.prisma, [
      { userId, kind: 'weekly_review', title: 'Time for your weekly review', body: 'Look back at the week and plan the next one.', link: '/review' },
    ]);
  }

  async create(userId: string) {
    const { timeZone } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const today = localDate(timeZone);
    const readable = { ...this.access.itemsOf(userId), trashedAt: null, kind: ItemKind.TASK };
    const [done, open, coming, habits, space] = await Promise.all([
      this.prisma.item.findMany({
        where: { ...readable, task: { completedAt: { gte: zonedInstant(dateValue(shiftDay(today, -6)).getTime() / dayMs, 0, 0, timeZone) } } },
        orderBy: { task: { completedAt: 'asc' } },
        take: 30,
        select: { title: true },
      }),
      this.prisma.item.findMany({
        where: { ...readable, task: { completedAt: null, dueDate: { lt: dateValue(today) } } },
        orderBy: { task: { dueDate: 'asc' } },
        take: 20,
        select: { title: true },
      }),
      this.events.agenda(userId, shiftDay(today, 1), shiftDay(today, 8)),
      this.habits.mine(userId),
      this.prisma.space.findFirstOrThrow({ where: { personalOwnerId: userId }, select: { id: true } }),
    ]);
    const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const dayAndTime = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });
    const labels = { event: '', external: '', task: 'due: ', renewal: 'renews: ' };
    const blocks: Block[] = [
      ...section('Done this week', done.map((task) => task.title || 'Untitled task'), 'Nothing was marked done.'),
      ...section('Still open', open.map((task) => task.title || 'Untitled task'), 'Nothing is overdue.'),
      ...section(
        'Coming up',
        coming.slice(0, 30).map((entry) => {
          const when = entry.allDay ? day.format(dateValue(entry.start)) : dayAndTime.format(new Date(entry.start));
          return `${when} · ${labels[entry.kind]}${entry.title}${'calendar' in entry ? ` (${entry.calendar})` : ''}`;
        }),
        'Nothing in the next seven days.',
      ),
      ...(habits.length
        ? section(
            'Habits',
            habits.map((habit) => `${habit.name}: ${habit.thisWeek} of ${habit.perWeek} this week, ${habit.streak}-${habit.perWeek >= 7 ? 'day' : 'week'} streak`),
            '',
          )
        : []),
      ['heading', 'Wins'],
      ['bullets', ['']],
      ['heading', 'What to change'],
      ['paragraph', ''],
      ['heading', 'Focus for next week'],
      ['tasks', ['']],
    ];
    const note = await this.notes.create(
      userId,
      space.id,
      { title: `Week to ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateValue(today))}`, parentId: await this.parent(userId, space.id) },
      blocksDocument(blocks),
    );
    return { noteId: note.id };
  }

  private parent(userId: string, spaceId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${parentTitle}:${spaceId}`}::text))`;
      const existing = await this.prisma.item.findFirst({
        where: { spaceId, kind: ItemKind.NOTE, title: parentTitle, trashedAt: null, note: { parentId: null } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return existing?.id ?? (await this.notes.create(userId, spaceId, { title: parentTitle })).id;
    });
  }
}
