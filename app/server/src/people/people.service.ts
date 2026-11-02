import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { zonedInstant } from '../recurrence/occurrences';
import { nextBirthday, validBirthday } from './birthdays';
import { CreatePersonDto, UpdatePersonDto } from './dto/people.dto';

const reminderKind = 'person.birthday';

const personFields = {
  id: true,
  title: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
  person: true,
} satisfies Prisma.ItemSelect;

type PersonRow = Prisma.ItemGetPayload<{ select: typeof personFields }>;

export interface GiftIdea {
  id: string;
  text: string;
  done: boolean;
}

function present(row: PersonRow, today: string) {
  const person = row.person!;
  const upcoming = person.birthdayMonth && person.birthdayDay ? nextBirthday(person.birthdayMonth, person.birthdayDay, today) : null;
  return {
    id: row.id,
    name: row.title,
    relationship: person.relationship,
    birthdayMonth: person.birthdayMonth,
    birthdayDay: person.birthdayDay,
    birthYear: person.birthYear,
    nextBirthday: upcoming,
    turning: upcoming && person.birthYear ? Number(upcoming.slice(0, 4)) - person.birthYear : null,
    email: person.email,
    phone: person.phone,
    notes: person.notes,
    giftIdeas: person.giftIdeas as unknown as GiftIdea[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function checkedBirthday(month: number | null | undefined, day: number | null | undefined) {
  if (!month !== !day) throw new BadRequestException('Give both the day and the month of the birthday, or neither');
  if (month && day && !validBirthday(month, day)) throw new BadRequestException('That day does not exist in that month');
}

@Injectable()
export class PeopleService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changes: ChangesService,
    private readonly jobs: JobsService,
    private readonly inbox: InboxService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind(payload as { itemId: string; birthday: string }));
  }

  async list(userId: string) {
    const today = await this.today(userId);
    const rows = await this.prisma.item.findMany({
      where: { ...this.access.ownedBy(userId), kind: ItemKind.PERSON, trashedAt: null },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 2_000,
      select: personFields,
    });
    return rows.map((row) => present(row, today));
  }

  async create(userId: string, input: CreatePersonDto) {
    checkedBirthday(input.birthdayMonth, input.birthdayDay);
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          ownerId: userId,
          kind: ItemKind.PERSON,
          title: input.name,
          createdById: userId,
          updatedById: userId,
          person: {
            create: {
              relationship: input.relationship || null,
              birthdayMonth: input.birthdayMonth ?? null,
              birthdayDay: input.birthdayDay ?? null,
              birthYear: input.birthYear ?? null,
              email: input.email || null,
              phone: input.phone || null,
              notes: input.notes ?? '',
            },
          },
        },
        select: { id: true },
      });
      await this.reschedule(transaction, item.id, userId);
      return item.id;
    });
    this.changes.notify('items', { userId });
    return this.get(userId, id);
  }

  async get(userId: string, itemId: string) {
    const row = await this.row(userId, itemId, 'read');
    const visible = { ...this.access.itemsOf(userId), trashedAt: null, kind: ItemKind.EVENT };
    const links = await this.prisma.itemLink.findMany({
      where: { OR: [{ sourceItemId: itemId, target: visible }, { targetItemId: itemId, source: visible }] },
      select: {
        id: true,
        sourceItemId: true,
        source: { select: { id: true, title: true, event: { select: { startsOn: true, startTime: true } } } },
        target: { select: { id: true, title: true, event: { select: { startsOn: true, startTime: true } } } },
      },
    });
    const events = links
      .map((link) => {
        const event = link.sourceItemId === itemId ? link.target : link.source;
        return { linkId: link.id, ownLink: link.sourceItemId === itemId, id: event.id, title: event.title, startsOn: dateText(event.event!.startsOn), startTime: event.event!.startTime };
      })
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    return { ...present(row, await this.today(userId)), events };
  }

  async update(userId: string, itemId: string, input: UpdatePersonDto) {
    const row = await this.row(userId, itemId, 'edit');
    if (row.trashedAt) throw new BadRequestException('Restore this person from the trash before changing them');
    const person = row.person!;
    const month = input.birthdayMonth === undefined ? person.birthdayMonth : input.birthdayMonth;
    const day = input.birthdayDay === undefined ? person.birthdayDay : input.birthdayDay;
    checkedBirthday(month, day);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: {
          title: input.name,
          updatedById: userId,
          person: {
            update: {
              relationship: input.relationship === undefined ? undefined : input.relationship || null,
              birthdayMonth: input.birthdayMonth,
              birthdayDay: input.birthdayDay,
              birthYear: input.birthYear,
              email: input.email === undefined ? undefined : input.email || null,
              phone: input.phone === undefined ? undefined : input.phone || null,
              notes: input.notes,
              giftIdeas: input.giftIdeas?.map(({ id, text, done }) => ({ id, text, done })),
            },
          },
        },
      });
      await this.reschedule(transaction, itemId, userId);
    });
    this.changes.notify('items', { userId });
    return this.get(userId, itemId);
  }

  private async reschedule(client: Prisma.TransactionClient, itemId: string, userId: string, after?: string) {
    await client.scheduledJob.deleteMany({ where: { kind: reminderKind, doneAt: null, failedAt: null, claimedAt: null, payload: { path: ['itemId'], equals: itemId } } });
    const person = await client.person.findUniqueOrThrow({ where: { itemId } });
    if (!person.birthdayMonth || !person.birthdayDay) return;
    const { timeZone } = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const earliest = after ?? dateText(new Date(dateValue(localDate(timeZone)).getTime() + dayMs));
    const birthday = nextBirthday(person.birthdayMonth, person.birthdayDay, earliest);
    const at = zonedInstant(dateValue(birthday).getTime() / dayMs - 1, 9, 0, timeZone);
    await this.jobs.schedule(reminderKind, at, { itemId, birthday }, client);
  }

  private async remind({ itemId, birthday }: { itemId: string; birthday: string }) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { title: true, trashedAt: true, person: true, owner: { select: { id: true, isActive: true, features: true } } },
    });
    if (!item?.person || !item.owner || item.trashedAt || !item.person.birthdayMonth || !item.person.birthdayDay) return;
    const turning = item.person.birthYear ? ` (turning ${Number(birthday.slice(0, 4)) - item.person.birthYear})` : '';
    if (item.owner.isActive && item.owner.features.includes('people')) {
      await this.inbox.notify(this.prisma, [{ userId: item.owner.id, kind: 'birthday', title: `${item.title}’s birthday is tomorrow${turning}`, link: `/people/${itemId}` }]);
    }
    const dayAfter = dateText(new Date(dateValue(birthday).getTime() + dayMs));
    await this.prisma.$transaction((transaction) => this.reschedule(transaction, itemId, item.owner!.id, dayAfter));
  }

  private async row(userId: string, itemId: string, access: 'read' | 'edit') {
    await this.access.assertItem(userId, itemId, access);
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: personFields });
    if (!row.person) throw new NotFoundException('That item is not a person');
    return row;
  }

  private async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    return localDate(user.timeZone);
  }
}
