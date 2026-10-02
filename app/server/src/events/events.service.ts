import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { GuestResponse, ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { linkTokenHash, newLinkToken } from '../crypto/link-token';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { occurrences, zonedInstant } from '../recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';
import { CreateEventDto, InviteGuestDto, OpenRsvpDto, RsvpDto, UpdateEventDto } from './dto/events.dto';

const reminderKind = 'event.reminder';
const maxAgendaDays = 100;

type EventRow = NonNullable<Prisma.ItemGetPayload<{ select: { event: true } }>['event']>;

interface Slot {
  start: Date;
  end: Date;
}

function time(text: string | null) {
  const [hour, minute] = (text ?? '00:00').split(':').map(Number) as [number, number];
  return { hour, minute };
}

function instant(date: Date, clock: string | null, timeZone: string) {
  const { hour, minute } = time(clock);
  return zonedInstant(date.getTime() / dayMs, hour, minute, timeZone);
}

function firstSlot(event: Pick<EventRow, 'startsOn' | 'startTime' | 'endsOn' | 'endTime' | 'timeZone'>): Slot {
  const start = instant(event.startsOn, event.startTime, event.timeZone);
  const end = event.startTime
    ? instant(event.endsOn, event.endTime ?? event.startTime, event.timeZone)
    : instant(new Date(event.endsOn.getTime() + dayMs), null, event.timeZone);
  return { start, end };
}

function overlaps(slot: Slot, from: Date) {
  return slot.end > from || slot.start >= from;
}

function slots(event: EventRow, from: Date, to: Date, limit = 200): Slot[] {
  const first = firstSlot(event);
  const length = first.end.getTime() - first.start.getTime();
  if (!event.repeatRule) {
    return overlaps(first, from) && first.start < to ? [first] : [];
  }
  return occurrences(
    parseRule(event.repeatRule),
    { date: dateText(event.startsOn), time: event.startTime ?? '00:00', timeZone: event.timeZone },
    { from: new Date(from.getTime() - length), to },
    limit,
  )
    .map((start) => ({ start, end: new Date(start.getTime() + length) }))
    .filter((slot) => overlaps(slot, from));
}

function checkedRule(text: string | null | undefined) {
  if (!text) return text === undefined ? undefined : null;
  try {
    return formatRule(parseRule(text));
  } catch (error) {
    if (error instanceof RuleError) throw new BadRequestException(error.message);
    throw error;
  }
}

export function publicEvent(title: string, event: EventRow) {
  return {
    title,
    startsOn: dateText(event.startsOn),
    startTime: event.startTime,
    endsOn: dateText(event.endsOn),
    endTime: event.endTime,
    timeZone: event.timeZone,
    repeatRule: event.repeatRule,
    location: event.location,
    meetingUrl: event.meetingUrl,
    description: event.description,
  };
}

function presentGuest(guest: { id: string; name: string; email: string | null; response: GuestResponse; note: string | null; respondedAt: Date | null }) {
  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
    response: guest.response.toLowerCase(),
    note: guest.note,
    respondedAt: guest.respondedAt,
  };
}

@Injectable()
export class EventsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly inbox: InboxService,
    private readonly jobs: JobsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind(payload as { itemId: string; start: string }));
  }

  async create(userId: string, spaceId: string, input: CreateEventDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const details = this.checkedDetails({
      startsOn: input.startsOn,
      startTime: input.startTime ?? null,
      endsOn: input.endsOn ?? input.startsOn,
      endTime: input.endTime ?? null,
      timeZone: input.timeZone ?? user.timeZone,
      repeatRule: checkedRule(input.repeatRule) ?? null,
    });
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          spaceId,
          kind: ItemKind.EVENT,
          title: input.title,
          createdById: userId,
          updatedById: userId,
          event: {
            create: {
              ...details,
              location: input.location ?? null,
              meetingUrl: input.meetingUrl ?? null,
              description: input.description ?? '',
              reminderMinutes: input.reminderMinutes ?? null,
            },
          },
        },
        select: { id: true },
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: input.title } });
      await this.reschedule(transaction, item.id, new Date());
      return item.id;
    });
    return this.get(userId, id);
  }

  async get(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    const item = await this.prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      select: {
        id: true,
        spaceId: true,
        title: true,
        event: true,
        guests: { orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!item.event) throw new NotFoundException('That item is not an event');
    const headcount = { yes: 0, no: 0, maybe: 0, pending: 0 };
    for (const guest of item.guests) headcount[guest.response.toLowerCase() as keyof typeof headcount] += 1;
    return {
      id: item.id,
      spaceId: item.spaceId,
      ...publicEvent(item.title, item.event),
      reminderMinutes: item.event.reminderMinutes,
      guests: item.guests.map(presentGuest),
      headcount,
    };
  }

  async update(userId: string, itemId: string, input: UpdateEventDto) {
    const current = await this.editable(userId, itemId);
    const event = current.event;
    const startsOn = input.startsOn ?? dateText(event.startsOn);
    const details = this.checkedDetails({
      startsOn,
      startTime: input.startTime === undefined ? event.startTime : input.startTime,
      endsOn: input.endsOn ?? (input.startsOn ? startsOn : dateText(event.endsOn)),
      endTime: input.endTime === undefined ? event.endTime : input.endTime,
      timeZone: input.timeZone ?? event.timeZone,
      repeatRule: input.repeatRule === undefined ? event.repeatRule : (checkedRule(input.repeatRule) ?? null),
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: {
          title: input.title,
          updatedById: userId,
          event: {
            update: {
              ...details,
              location: input.location,
              meetingUrl: input.meetingUrl,
              description: input.description,
              reminderMinutes: input.reminderMinutes,
            },
          },
        },
      });
      if (input.title !== undefined && input.title !== current.title) {
        await this.activity.record(transaction, {
          spaceId: current.spaceId,
          actorId: userId,
          itemId,
          verb: 'item.updated',
          data: { title: input.title, renamedFrom: current.title },
        });
      }
      await this.reschedule(transaction, itemId, new Date());
    });
    return this.get(userId, itemId);
  }

  async agenda(userId: string, from: string, to: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const fromDay = dateValue(from);
    const toDay = dateValue(to);
    if (toDay <= fromDay || toDay.getTime() - fromDay.getTime() > maxAgendaDays * dayMs) {
      throw new BadRequestException(`Ask for 1 to ${maxAgendaDays} days at a time`);
    }
    const start = zonedInstant(fromDay.getTime() / dayMs, 0, 0, user.timeZone);
    const end = zonedInstant(toDay.getTime() / dayMs, 0, 0, user.timeZone);
    const readable = { ...this.access.itemsOf(userId), trashedAt: null };
    const [events, tasks, subscriptions] = await Promise.all([
      this.prisma.item.findMany({
        where: {
          ...readable,
          kind: ItemKind.EVENT,
          event: { startsOn: { lte: toDay }, OR: [{ repeatRule: { not: null } }, { endsOn: { gte: new Date(fromDay.getTime() - dayMs) } }] },
        },
        select: { id: true, spaceId: true, title: true, event: true },
        take: 1_000,
      }),
      this.prisma.item.findMany({
        where: { ...readable, kind: ItemKind.TASK, task: { completedAt: null, dueDate: { gte: new Date(fromDay.getTime() - dayMs), lte: toDay } } },
        select: { id: true, spaceId: true, title: true, task: { select: { dueDate: true, dueTime: true, timeZone: true } } },
        take: 1_000,
      }),
      this.prisma.item.findMany({
        where: { ...readable, kind: ItemKind.SUBSCRIPTION, subscription: { cancelledOn: null, nextRenewal: { lte: toDay } } },
        select: { id: true, spaceId: true, title: true, subscription: { select: { repeatRule: true, startDate: true, timeZone: true, nextRenewal: true, amountMinor: true, currency: true } } },
        take: 1_000,
      }),
    ]);
    const entries = [
      ...events.flatMap((item) =>
        slots(item.event!, start, end).map((slot) => ({
          kind: 'event' as const,
          itemId: item.id,
          spaceId: item.spaceId,
          title: item.title,
          allDay: !item.event!.startTime,
          start: item.event!.startTime ? slot.start.toISOString() : localDate(item.event!.timeZone, slot.start),
          end: item.event!.startTime ? slot.end.toISOString() : localDate(item.event!.timeZone, new Date(slot.end.getTime() - 1)),
          location: item.event!.location,
        })),
      ),
      ...tasks.flatMap((item) => {
        const task = item.task!;
        const due = instant(task.dueDate!, task.dueTime, task.timeZone);
        const inside = task.dueTime ? due >= start && due < end : dateText(task.dueDate!) >= from && dateText(task.dueDate!) < to;
        return inside
          ? [{ kind: 'task' as const, itemId: item.id, spaceId: item.spaceId, title: item.title, allDay: !task.dueTime, start: task.dueTime ? due.toISOString() : dateText(task.dueDate!), end: null, location: null }]
          : [];
      }),
      ...subscriptions.flatMap((item) => {
        const details = item.subscription!;
        return occurrences(
          parseRule(details.repeatRule),
          { date: dateText(details.startDate), time: '00:00', timeZone: details.timeZone },
          { from: instant(details.nextRenewal, null, details.timeZone), to: end },
          50,
        )
          .map((at) => localDate(details.timeZone, at))
          .filter((day) => day >= from && day < to)
          .map((day) => ({ kind: 'renewal' as const, itemId: item.id, spaceId: item.spaceId, title: item.title, allDay: true, start: day, end: null, location: null }));
      }),
    ];
    return entries.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : Number(b.allDay) - Number(a.allDay)));
  }

  async invite(userId: string, itemId: string, input: InviteGuestDto) {
    const current = await this.editable(userId, itemId);
    const { token, tokenHash } = newLinkToken();
    const guest = await this.prisma.eventGuest.create({ data: { itemId, name: input.name, email: input.email ?? null, tokenHash } });
    const link = this.mail.link(`/rsvp/${token}`);
    const emailed =
      input.email !== undefined &&
      (await this.mail.trySend({
        to: input.email,
        subject: `You are invited: ${current.title}`,
        text: [
          `Hi ${input.name},`,
          '',
          `You are invited to "${current.title}" on ${dateText(current.event.startsOn)}${current.event.startTime ? ` at ${current.event.startTime} (${current.event.timeZone})` : ''}.`,
          '',
          'Say whether you can come, with no account needed:',
          '',
          link,
        ].join('\n'),
      }));
    return { guest: presentGuest(guest), link, emailed };
  }

  async removeGuest(userId: string, itemId: string, guestId: string) {
    await this.editable(userId, itemId);
    const removed = await this.prisma.eventGuest.deleteMany({ where: { id: guestId, itemId } });
    if (removed.count === 0) throw new NotFoundException('That guest is already gone');
  }

  async rsvpView(code: string) {
    const guest = await this.guestByCode(code);
    return { event: publicEvent(guest.item.title, guest.item.event!), guest: { name: guest.name, response: guest.response.toLowerCase(), note: guest.note } };
  }

  async rsvp(code: string, input: RsvpDto) {
    const guest = await this.guestByCode(code);
    await this.prisma.eventGuest.update({
      where: { id: guest.id },
      data: { response: input.response.toUpperCase() as GuestResponse, note: input.note ?? null, respondedAt: new Date() },
    });
    return this.rsvpView(code);
  }

  async rsvpByShareLink(code: string, input: OpenRsvpDto) {
    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: linkTokenHash(code), revokedAt: null, expiresAt: { gt: new Date() }, item: { trashedAt: null, kind: ItemKind.EVENT } },
      select: { itemId: true },
    });
    if (!link) throw new NotFoundException('This link has expired or was turned off');
    const { token, tokenHash } = newLinkToken();
    await this.prisma.eventGuest.create({
      data: {
        itemId: link.itemId,
        name: input.name,
        tokenHash,
        response: input.response.toUpperCase() as GuestResponse,
        note: input.note ?? null,
        respondedAt: new Date(),
      },
    });
    return { link: this.mail.link(`/rsvp/${token}`) };
  }

  private async guestByCode(code: string) {
    const guest = await this.prisma.eventGuest.findUnique({
      where: { tokenHash: linkTokenHash(code) },
      select: { id: true, name: true, response: true, note: true, item: { select: { title: true, trashedAt: true, event: true } } },
    });
    if (!guest || guest.item.trashedAt || !guest.item.event) throw new NotFoundException('This invitation is no longer open');
    return guest;
  }

  private checkedDetails(input: { startsOn: string; startTime: string | null; endsOn: string; endTime: string | null; timeZone: string; repeatRule: string | null }) {
    if (!input.startTime && input.endTime) throw new BadRequestException('Give the event a start time before an end time');
    const startsOn = dateValue(input.startsOn);
    const endsOn = dateValue(input.endsOn);
    const first = firstSlot({ startsOn, startTime: input.startTime, endsOn, endTime: input.endTime, timeZone: input.timeZone });
    if (first.end < first.start) throw new BadRequestException('An event cannot end before it starts');
    if (endsOn.getTime() - startsOn.getTime() > 31 * dayMs) throw new BadRequestException('Events can last at most 31 days');
    return { startsOn, startTime: input.startTime, endsOn, endTime: input.endTime, timeZone: input.timeZone, repeatRule: input.repeatRule };
  }

  private async editable(userId: string, itemId: string) {
    const found = await this.access.assertItem(userId, itemId, 'edit');
    if (found.trashedAt) throw new BadRequestException('Restore this event from the trash before changing it');
    const item = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { spaceId: true, title: true, event: true } });
    if (!item.event) throw new NotFoundException('That item is not an event');
    return { ...item, event: item.event };
  }

  private async reschedule(client: Prisma.TransactionClient, itemId: string, after: Date) {
    await client.scheduledJob.deleteMany({
      where: { kind: reminderKind, doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: itemId } },
    });
    const event = await client.event.findUniqueOrThrow({ where: { itemId } });
    if (event.reminderMinutes === null) return;
    const lead = event.reminderMinutes * 60_000;
    const [next] = slots(event, new Date(after.getTime() + lead), new Date(after.getTime() + 400 * dayMs + lead), 1).filter(
      (slot) => slot.start.getTime() - lead > after.getTime(),
    );
    if (next) {
      await this.jobs.schedule(reminderKind, new Date(next.start.getTime() - lead), { itemId, start: next.start.toISOString() }, client);
    }
  }

  private async remind(payload: { itemId: string; start: string }) {
    const item = await this.prisma.item.findUnique({
      where: { id: payload.itemId },
      select: { spaceId: true, title: true, trashedAt: true, createdById: true, event: true },
    });
    if (!item?.event || item.trashedAt) return;
    const start = new Date(payload.start);
    if (item.createdById && slots(item.event, start, new Date(start.getTime() + 1), 1).some((slot) => slot.start.getTime() === start.getTime())) {
      await this.inbox.notify(this.prisma, [
        {
          userId: item.createdById,
          kind: 'event_soon',
          title: `${item.title} starts ${item.event.startTime ? `at ${item.event.startTime}` : 'today'}`,
          link: `/events/${payload.itemId}`,
        },
      ]);
    }
    await this.prisma.$transaction((transaction) => this.reschedule(transaction, payload.itemId, start));
  }
}
