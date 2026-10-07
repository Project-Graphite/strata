import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { SecretBox } from '../crypto/secret-box.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateValue, dayMs } from '../recurrence/dates';
import { checkedUrl, fetchPublic, UnsafeUrlError } from '../widgets/safe-fetch';
import { readCalendar } from './ical-reader';

const maxPerSpace = 10;
const refreshAfterMs = 6 * 60 * 60 * 1000;
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

  async refreshNow(userId: string, id: string) {
    await this.editable(userId, id);
    await this.refresh(id, new Date());
    return present(await this.prisma.calendarSubscription.findUniqueOrThrow({ where: { id }, select: subscriptionFields }));
  }

  async remove(userId: string, id: string) {
    await this.editable(userId, id);
    await this.prisma.calendarSubscription.deleteMany({ where: { id } });
  }

  async refreshDue(now: Date) {
    const due = await this.prisma.calendarSubscription.findMany({
      where: { OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: new Date(now.getTime() - refreshAfterMs) } }] },
      orderBy: { lastFetchedAt: { sort: 'asc', nulls: 'first' } },
      take: refreshesPerRun,
      select: { id: true },
    });
    for (const { id } of due) await this.refresh(id, now);
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
