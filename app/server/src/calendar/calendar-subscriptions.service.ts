import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { SecretBox } from '../crypto/secret-box.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs } from '../recurrence/dates';
import { checkedUrl, fetchPublic, UnsafeUrlError } from '../widgets/safe-fetch';
import { readCalendar } from './ical-reader';

const maxPerSpace = 10;
const refreshAfterMs = 15 * 60 * 1000;
const freshForMs = 60 * 1000;
const refreshesPerRun = 10;

const subscriptionFields = {
  id: true,
  spaceId: true,
  name: true,
  host: true,
  lastFetchedAt: true,
  lastError: true,
  createdAt: true,
  _count: { select: { events: true } },
} satisfies Prisma.CalendarSubscriptionSelect;

function present({ _count, ...subscription }: Prisma.CalendarSubscriptionGetPayload<{ select: typeof subscriptionFields }>) {
  return { ...subscription, events: _count.events };
}

@Injectable()
export class CalendarSubscriptionsService implements OnModuleInit {
  private readonly logger = new Logger(CalendarSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly box: SecretBox,
    private readonly maintenance: MaintenanceScheduler,
  ) {}

  onModuleInit() {
    this.maintenance.register((now) => this.refreshDue(now));
  }

  async mine(userId: string) {
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { space: this.access.spacesOf(userId) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: subscriptionFields,
    });
    return rows.map(present);
  }

  async add(userId: string, spaceId: string, input: { name?: string; url: string }) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    if ((await this.prisma.calendarSubscription.count({ where: { spaceId } })) >= maxPerSpace) {
      throw new ConflictException(`A space can follow ${maxPerSpace} calendars. Remove one first.`);
    }
    const url = input.url.trim().replace(/^webcal:\/\//i, 'https://');
    const host = this.checked(url).host;
    const now = new Date();
    const read = await this.read(url, now).catch((error: Error) => {
      throw new BadRequestException(`Could not read that calendar: ${error.message}`);
    });
    const created = await this.prisma.calendarSubscription.create({
      data: {
        spaceId,
        name: input.name || read.name?.slice(0, 80) || host,
        urlSealed: this.box.seal(url),
        host,
        lastFetchedAt: now,
        createdById: userId,
        events: { createMany: { data: read.events.map((event) => this.row(event)) } },
      },
      select: subscriptionFields,
    });
    return present(created);
  }

  async event(userId: string, id: string, uid: string) {
    const event = await this.prisma.subscribedEvent.findFirst({
      where: { subscriptionId: id, uid, subscription: { space: this.access.spacesOf(userId) } },
      select: {
        uid: true,
        title: true,
        startsOn: true,
        startTime: true,
        endsOn: true,
        endTime: true,
        timeZone: true,
        repeatRule: true,
        location: true,
        description: true,
        meetingUrl: true,
        organizer: true,
        subscription: { select: { id: true, spaceId: true, name: true, host: true } },
      },
    });
    if (!event) throw new NotFoundException('That event is no longer in the calendar');
    const { subscription, startsOn, endsOn, ...details } = event;
    return { ...details, startsOn: dateText(startsOn), endsOn: dateText(endsOn), calendar: subscription };
  }

  async refreshNow(userId: string, id: string) {
    await this.editable(userId, id);
    await this.refresh(id, new Date());
    return present(await this.prisma.calendarSubscription.findUniqueOrThrow({ where: { id }, select: subscriptionFields }));
  }

  async remove(userId: string, id: string) {
    await this.editable(userId, id);
    await this.prisma.calendarSubscription.deleteMany({ where: { id } });
  }

  async refreshMine(userId: string, now: Date) {
    return { refreshed: await this.refreshStale({ space: this.access.spacesOf(userId) }, freshForMs, now, refreshesPerRun) };
  }

  async refreshDue(now: Date) {
    await this.refreshStale({}, refreshAfterMs, now, refreshesPerRun);
  }

  private async refreshStale(where: Prisma.CalendarSubscriptionWhereInput, staleAfterMs: number, now: Date, take?: number) {
    const stale = await this.prisma.calendarSubscription.findMany({
      where: { ...where, OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: new Date(now.getTime() - staleAfterMs) } }] },
      orderBy: { lastFetchedAt: { sort: 'asc', nulls: 'first' } },
      take,
      select: { id: true, lastFetchedAt: true },
    });
    const claimed = await Promise.all(
      stale.map(async ({ id, lastFetchedAt }) => {
        const { count } = await this.prisma.calendarSubscription.updateMany({ where: { id, lastFetchedAt }, data: { lastFetchedAt: now } });
        if (count) await this.refresh(id, now);
        return count;
      }),
    );
    return claimed.reduce((total, count) => total + count, 0);
  }

  private async refresh(id: string, now: Date) {
    const subscription = await this.prisma.calendarSubscription.findUnique({ where: { id }, select: { urlSealed: true } });
    if (!subscription) return;
    try {
      const { events } = await this.read(this.box.open(subscription.urlSealed), now);
      await this.prisma.$transaction([
        this.prisma.subscribedEvent.deleteMany({ where: { subscriptionId: id } }),
        this.prisma.subscribedEvent.createMany({ data: events.map((event) => ({ ...this.row(event), subscriptionId: id })) }),
        this.prisma.calendarSubscription.update({ where: { id }, data: { lastFetchedAt: now, lastError: null } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Calendar ${id} could not be refreshed: ${message}`);
      await this.prisma.calendarSubscription.update({ where: { id }, data: { lastFetchedAt: now, lastError: message.slice(0, 200) } });
    }
  }

  private async read(url: string, now: Date) {
    const text = await fetchPublic(url, { accept: 'text/calendar, text/plain;q=0.5', maxBytes: 1_000_000, timeoutMs: 10_000 });
    return readCalendar(text, new Date(now.getTime() - 365 * dayMs));
  }

  private row(event: ReturnType<typeof readCalendar>['events'][number]) {
    return { ...event, startsOn: dateValue(event.startsOn), endsOn: dateValue(event.endsOn) };
  }

  private checked(url: string) {
    try {
      return checkedUrl(url);
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async editable(userId: string, id: string) {
    const subscription = await this.prisma.calendarSubscription.findFirst({ where: { id, space: this.access.spacesOf(userId) }, select: { spaceId: true } });
    if (!subscription) throw new NotFoundException('That calendar is not followed here');
    await this.access.assertSpace(userId, subscription.spaceId, 'edit');
  }
}
