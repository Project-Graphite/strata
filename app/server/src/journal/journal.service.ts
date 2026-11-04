import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { EventsService } from '../events/events.service';
import { shiftDay } from '../habits/streaks';
import { NotesService } from '../notes/notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { zonedInstant } from '../recurrence/occurrences';

const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const previewLength = 280;

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notes: NotesService,
    private readonly events: EventsService,
    private readonly changes: ChangesService,
  ) {}

  async year(userId: string, year: number | undefined) {
    const today = await this.today(userId);
    const shown = year ?? Number(today.slice(0, 4));
    if (shown < 2000 || shown > 2100) throw new BadRequestException('Choose a year between 2000 and 2100');
    const range = { gte: dateValue(`${shown}-01-01`), lt: dateValue(`${shown + 1}-01-01`) };
    const [entries, reviews] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { userId, day: range },
        orderBy: { day: 'asc' },
        select: { day: true, mood: true, note: { select: { id: true, trashedAt: true } } },
      }),
      this.prisma.weeklyReview.findMany({
        where: { userId, createdAt: range, note: { trashedAt: null } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, note: { select: { id: true, title: true } } },
      }),
    ]);
    return {
      year: shown,
      today,
      days: entries.map((entry) => ({ day: dateText(entry.day), mood: entry.mood, noteId: entry.note && !entry.note.trashedAt ? entry.note.id : null })),
      reviews: reviews.map((review) => ({ id: review.note.id, title: review.note.title, createdAt: review.createdAt })),
    };
  }

  async day(userId: string, day: string) {
    await this.assertDay(userId, day);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, features: true } });
    const start = zonedInstant(dateValue(day).getTime() / dayMs, 0, 0, user.timeZone);
    const end = zonedInstant(dateValue(day).getTime() / dayMs + 1, 0, 0, user.timeZone);
    const [entry, agenda, tasks, habits, transactions] = await Promise.all([
      this.prisma.journalEntry.findUnique({
        where: { userId_day: { userId, day: dateValue(day) } },
        select: { mood: true, note: { select: { id: true, title: true, trashedAt: true, searchDocument: { select: { bodyText: true } } } } },
      }),
      this.events.agenda(userId, day, shiftDay(day, 1)),
      this.prisma.item.findMany({
        where: { ...this.access.itemsOf(userId), kind: ItemKind.TASK, trashedAt: null, task: { completedAt: { gte: start, lt: end } } },
        orderBy: { task: { completedAt: 'asc' } },
        take: 50,
        select: { id: true, title: true, spaceId: true },
      }),
      this.prisma.habitCheckIn.findMany({
        where: { userId, day: dateValue(day), habit: { userId } },
        orderBy: { habit: { position: 'asc' } },
        select: { habit: { select: { id: true, name: true } } },
      }),
      user.features.includes('spending')
        ? this.prisma.expense.findMany({
            where: { userId, spentOn: dateValue(day), trashedAt: null },
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
            take: 50,
            select: { id: true, title: true, amountMinor: true, currency: true, direction: true },
          })
        : null,
    ]);
    const page = entry?.note && !entry.note.trashedAt ? entry.note : null;
    return {
      day,
      mood: entry?.mood ?? null,
      page: page && { id: page.id, title: page.title, preview: (page.searchDocument?.bodyText ?? '').slice(0, previewLength) },
      agenda: agenda.filter((item) => item.kind === 'event' || item.kind === 'external' || item.kind === 'birthday'),
      tasks,
      habits: habits.map((checkIn) => checkIn.habit),
      transactions: transactions && transactions.map((transaction) => ({ ...transaction, amountMinor: Number(transaction.amountMinor) })),
    };
  }

  async open(userId: string, day: string) {
    await this.assertDay(userId, day);
    const entry = { userId, day: dateValue(day) };
    const existing = await this.livePage(entry);
    if (existing) return { noteId: existing };
    const note = await this.notes.createOwned(userId, longDate.format(entry.day));
    await this.prisma.journalEntry.createMany({ data: [entry], skipDuplicates: true });
    this.changes.notify('journal', { userId });
    const claimed = await this.prisma.journalEntry.updateMany({
      where: { ...entry, OR: [{ noteId: null }, { note: { trashedAt: { not: null } } }] },
      data: { noteId: note.id },
    });
    if (claimed.count === 1) return { noteId: note.id };
    await this.prisma.item.delete({ where: { id: note.id } });
    const winner = await this.livePage(entry);
    if (!winner) throw new ConflictException('The journal page changed while it was opening. Try again.');
    return { noteId: winner };
  }

  async setMood(userId: string, day: string, mood: number | null) {
    await this.assertDay(userId, day);
    const key = { userId_day: { userId, day: dateValue(day) } };
    const entry = await this.prisma.journalEntry.upsert({ where: key, create: { userId, day: dateValue(day), mood }, update: { mood }, select: { noteId: true } });
    if (mood === null && !entry.noteId) await this.prisma.journalEntry.deleteMany({ where: { userId, day: dateValue(day) } });
    this.changes.notify('journal', { userId });
    return { day, mood };
  }

  private async livePage(entry: { userId: string; day: Date }) {
    const found = await this.prisma.journalEntry.findUnique({ where: { userId_day: entry }, select: { note: { select: { id: true, trashedAt: true } } } });
    return found?.note && !found.note.trashedAt ? found.note.id : null;
  }

  private async assertDay(userId: string, day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || dateText(dateValue(day)) !== day) throw new BadRequestException('Choose a real day');
    if (day > (await this.today(userId))) throw new BadRequestException('Journal pages are for today or earlier');
  }

  private async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    return localDate(user.timeZone);
  }
}
