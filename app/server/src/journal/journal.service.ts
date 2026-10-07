import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { NotesService } from '../notes/notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, localDate } from '../recurrence/dates';

const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: NotesService,
  ) {}

  async year(userId: string, year: number | undefined) {
    const today = await this.today(userId);
    const shown = year ?? Number(today.slice(0, 4));
    if (shown < 2000 || shown > 2100) throw new BadRequestException('Choose a year between 2000 and 2100');
    const entries = await this.prisma.journalEntry.findMany({
      where: { userId, day: { gte: dateValue(`${shown}-01-01`), lt: dateValue(`${shown + 1}-01-01`) } },
      orderBy: { day: 'asc' },
      select: { day: true, mood: true, note: { select: { id: true, trashedAt: true } } },
    });
    return {
      year: shown,
      today,
      days: entries.map((entry) => ({ day: dateText(entry.day), mood: entry.mood, noteId: entry.note && !entry.note.trashedAt ? entry.note.id : null })),
    };
  }

  async open(userId: string, day: string) {
    await this.assertDay(userId, day);
    const entry = { userId, day: dateValue(day) };
    const existing = await this.livePage(entry);
    if (existing) return { noteId: existing };
    const space = await this.prisma.space.findFirstOrThrow({ where: { personalOwnerId: userId }, select: { id: true } });
    const parent = await this.journalPage(userId, space.id);
    const note = await this.notes.create(userId, space.id, { title: longDate.format(entry.day), parentId: parent.id });
    await this.prisma.journalEntry.createMany({ data: [entry], skipDuplicates: true });
    const claimed = await this.prisma.journalEntry.updateMany({
      where: { ...entry, OR: [{ noteId: null }, { note: { trashedAt: { not: null } } }] },
      data: { noteId: note.id },
    });
    if (claimed.count === 1) return { noteId: note.id };
    await this.prisma.item.delete({ where: { id: note.id } });
    if (parent.created) await this.prisma.item.delete({ where: { id: parent.id } });
    const winner = await this.livePage(entry);
    if (!winner) throw new ConflictException('The journal page changed while it was opening. Try again.');
    return { noteId: winner };
  }

  async setMood(userId: string, day: string, mood: number | null) {
    await this.assertDay(userId, day);
    const key = { userId_day: { userId, day: dateValue(day) } };
    const entry = await this.prisma.journalEntry.upsert({ where: key, create: { userId, day: dateValue(day), mood }, update: { mood }, select: { noteId: true } });
    if (mood === null && !entry.noteId) await this.prisma.journalEntry.deleteMany({ where: { userId, day: dateValue(day) } });
    return { day, mood };
  }

  private async livePage(entry: { userId: string; day: Date }) {
    const found = await this.prisma.journalEntry.findUnique({ where: { userId_day: entry }, select: { note: { select: { id: true, trashedAt: true } } } });
    return found?.note && !found.note.trashedAt ? found.note.id : null;
  }

  private async journalPage(userId: string, spaceId: string) {
    const latest = await this.prisma.journalEntry.findFirst({
      where: { userId, note: { spaceId, trashedAt: null, note: { parent: { trashedAt: null } } } },
      orderBy: { day: 'desc' },
      select: { note: { select: { note: { select: { parentId: true } } } } },
    });
    const parentId = latest?.note?.note?.parentId;
    if (parentId) return { id: parentId, created: false };
    return { id: (await this.notes.create(userId, spaceId, { title: 'Journal' })).id, created: true };
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
