import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind, Prisma, type GoogleCalendar } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { uniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs } from '../recurrence/dates';
import { fieldsOf, fromGoogle, originalDate, storedEvent, strataHash, toGoogle, type GoogleEventResource } from './calendar-mapping';
import { calendarSyncKind, CalendarSyncNudge } from './calendar-sync-nudge';
import { forgetCalendars } from './forget-calendars';
import { GoogleApiError, GoogleClient, GoogleDisconnectedError, googleHttpError, googleScopes } from './google-client';

const api = 'https://www.googleapis.com/calendar/v3';
const syncEveryMs = 5 * 60 * 1000;
const freshForMs = 60 * 1000;
const leaseMs = 5 * 60 * 1000;
const accountsPerRun = 10;
const pushesPerRun = 200;
const historyDays = 90;
const writableRoles = new Set(['owner', 'writer']);

interface CalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole?: string;
}

interface EventsPage {
  items?: GoogleEventResource[];
  nextPageToken?: string;
  nextSyncToken?: string;
  timeZone?: string;
}

const linkedItem = { select: { id: true, title: true, updatedAt: true, trashedAt: true, event: true } } satisfies Prisma.ItemDefaultArgs;

const nameOf = (entry: CalendarListEntry) => (entry.summaryOverride ?? entry.summary ?? entry.id).slice(0, 120);
const eventsPath = (calendarId: string) => `${api}/calendars/${encodeURIComponent(calendarId)}/events`;

function problem(error: unknown) {
  if (error instanceof GoogleDisconnectedError) return error.message;
  if (error instanceof GoogleApiError && (error.status === 401 || error.status === 403)) return 'Google refused access to this calendar. Connect Google Calendar again.';
  if (error instanceof GoogleApiError && error.status === 404) return 'This calendar no longer exists in Google, or you lost access to it.';
  return 'Google Calendar could not be reached. Strata will try again.';
}

@Injectable()
export class GoogleCalendarService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleClient,
    private readonly jobs: JobsService,
    private readonly maintenance: MaintenanceScheduler,
    private readonly nudge: CalendarSyncNudge,
    private readonly changes: ChangesService,
  ) {}

  onModuleInit() {
    this.maintenance.register((now) => this.syncDue(now));
    this.jobs.handle(calendarSyncKind, async (payload) => {
      if ((await this.sync((payload as { userId: string }).userId, new Date())) === null) throw new Error('A sync for this account is already running');
    });
  }

  async calendars(userId: string) {
    const account = await this.prisma.googleAccount.findUnique({ where: { userId }, select: { scopes: true, refreshTokenSealed: true } });
    const connected = Boolean(account?.refreshTokenSealed) && googleScopes.calendar.every((scope) => account!.scopes.includes(scope));
    const synced = await this.prisma.googleCalendar.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        calendarId: true,
        name: true,
        color: true,
        writable: true,
        isDefault: true,
        lastSyncedAt: true,
        lastError: true,
        _count: { select: { events: { where: { item: { trashedAt: null } } } } },
      },
    });
    let available: CalendarListEntry[] = [];
    let error: string | null = null;
    if (connected) {
      try {
        available = (await this.google.request<{ items?: CalendarListEntry[] }>(userId, `${api}/users/me/calendarList?minAccessRole=reader&maxResults=250`)).items ?? [];
      } catch (reason) {
        error = problem(reason);
      }
    }
    return {
      connected,
      error,
      calendars: [
        ...synced.map(({ _count, ...calendar }) => ({ ...calendar, synced: true, events: _count.events })),
        ...available
          .filter((entry) => !synced.some((calendar) => calendar.calendarId === entry.id))
          .map((entry) => ({
            id: null,
            calendarId: entry.id,
            name: nameOf(entry),
            color: entry.backgroundColor ?? null,
            writable: writableRoles.has(entry.accessRole ?? ''),
            isDefault: false,
            lastSyncedAt: null,
            lastError: null,
            synced: false,
            events: 0,
          })),
      ],
    };
  }

  async add(userId: string, calendarId: string) {
    const entry = await this.google
      .request<CalendarListEntry>(userId, `${api}/users/me/calendarList/${encodeURIComponent(calendarId)}`)
      .catch((error: unknown) => googleHttpError(error, 'That calendar is not in your Google account'));
    const writable = writableRoles.has(entry.accessRole ?? '');
    const hasDefault = (await this.prisma.googleCalendar.count({ where: { userId, isDefault: true } })) > 0;
    try {
      await this.prisma.googleCalendar.create({
        data: { userId, calendarId: entry.id, name: nameOf(entry), color: entry.backgroundColor ?? null, writable, isDefault: writable && !hasDefault },
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new ConflictException('This calendar is already synced');
      throw error;
    }
    await this.nudge.soon(userId);
    return this.calendars(userId);
  }

  async remove(userId: string, id: string) {
    const calendar = await this.own(userId, id);
    await this.prisma.$transaction(forgetCalendars(this.prisma, { id, userId }));
    if (calendar.isDefault) {
      const next = await this.prisma.googleCalendar.findFirst({ where: { userId, writable: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (next) await this.prisma.googleCalendar.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    this.changes.notify('items', { userId });
  }

  async makeDefault(userId: string, id: string) {
    const calendar = await this.own(userId, id);
    if (!calendar.writable) throw new BadRequestException('Strata can only add events to a Google calendar you can edit');
    await this.prisma.$transaction([
      this.prisma.googleCalendar.updateMany({ where: { userId }, data: { isDefault: false } }),
      this.prisma.googleCalendar.update({ where: { id }, data: { isDefault: true } }),
    ]);
    await this.nudge.soon(userId);
    return this.calendars(userId);
  }

  async syncNow(userId: string) {
    await this.sync(userId, new Date());
    return this.calendars(userId);
  }

  async syncIfStale(userId: string, now: Date) {
    const due = await this.prisma.googleAccount.count({
      where: { userId, user: { googleCalendars: { some: {} } }, OR: [{ calendarSyncedAt: null }, { calendarSyncedAt: { lt: new Date(now.getTime() - freshForMs) } }] },
    });
    return due ? ((await this.sync(userId, now)) ?? 0) : 0;
  }

  async syncDue(now: Date) {
    const due = await this.prisma.googleAccount.findMany({
      where: { user: { googleCalendars: { some: {} } }, OR: [{ calendarSyncedAt: null }, { calendarSyncedAt: { lt: new Date(now.getTime() - syncEveryMs) } }] },
      orderBy: { calendarSyncedAt: { sort: 'asc', nulls: 'first' } },
      take: accountsPerRun,
      select: { userId: true },
    });
    for (const { userId } of due) await this.sync(userId, now);
  }

  async sync(userId: string, now: Date) {
    const claimed = await this.prisma.googleAccount.updateMany({
      where: { userId, OR: [{ calendarSyncingUntil: null }, { calendarSyncingUntil: { lt: now } }] },
      data: { calendarSyncingUntil: new Date(now.getTime() + leaseMs) },
    });
    if (claimed.count === 0) return null;
    let changed = 0;
    try {
      const calendars = await this.prisma.googleCalendar.findMany({ where: { userId } });
      for (const calendar of calendars) {
        try {
          changed += await this.pull(userId, calendar, now);
        } catch (error) {
          this.logger.warn(`Google calendar ${calendar.id} could not be read: ${error instanceof Error ? error.message : String(error)}`);
          await this.prisma.googleCalendar.updateMany({ where: { id: calendar.id }, data: { lastError: problem(error) } });
        }
      }
      try {
        await this.push(userId, calendars);
      } catch (error) {
        this.logger.warn(`Events for ${userId} could not be sent to Google: ${error instanceof Error ? error.message : String(error)}`);
        await this.prisma.googleCalendar.updateMany({ where: { userId, isDefault: true }, data: { lastError: problem(error) } });
      }
    } finally {
      await this.prisma.googleAccount.updateMany({ where: { userId }, data: { calendarSyncingUntil: null, calendarSyncedAt: now } });
    }
    if (changed > 0) this.changes.notify('items', { userId });
    return changed;
  }

  private async pull(userId: string, calendar: GoogleCalendar, now: Date) {
    let syncToken = calendar.syncToken;
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    let zone = 'Etc/UTC';
    const items: GoogleEventResource[] = [];
    for (;;) {
      const query = new URLSearchParams({
        maxResults: '250',
        showDeleted: 'true',
        ...(syncToken ? { syncToken } : { timeMin: new Date(now.getTime() - historyDays * dayMs).toISOString() }),
        ...(pageToken ? { pageToken } : {}),
      });
      let page: EventsPage;
      try {
        page = await this.google.request<EventsPage>(userId, `${eventsPath(calendar.calendarId)}?${query}`);
      } catch (error) {
        if (!(error instanceof GoogleApiError && error.status === 410 && syncToken)) throw error;
        syncToken = null;
        pageToken = undefined;
        items.length = 0;
        continue;
      }
      items.push(...(page.items ?? []));
      zone = page.timeZone ?? zone;
      nextSyncToken = page.nextSyncToken ?? null;
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }
    let changed = 0;
    for (const event of [...items.filter((found) => !found.recurringEventId), ...items.filter((found) => found.recurringEventId)]) {
      changed += await this.applyGoogle(userId, calendar.id, event, zone);
    }
    await this.prisma.googleCalendar.updateMany({ where: { id: calendar.id }, data: { syncToken: nextSyncToken, lastSyncedAt: now, lastError: null } });
    return changed;
  }

  private async applyGoogle(userId: string, calendarId: string, event: GoogleEventResource, zone: string) {
    const link = await this.prisma.googleEvent.findUnique({ where: { calendarId_eventId: { calendarId, eventId: event.id } }, include: { item: linkedItem } });
    const original = event.recurringEventId && event.originalStartTime ? originalDate(event.originalStartTime, zone) : null;
    let changed = original && event.recurringEventId ? await this.exclude(calendarId, event.recurringEventId, original) : 0;
    if (event.status === 'cancelled') {
      if (!link) return changed;
      await this.prisma.$transaction([
        ...(link.item && !link.item.trashedAt ? [this.prisma.item.update({ where: { id: link.item.id }, data: { trashedAt: new Date() } })] : []),
        this.prisma.googleEvent.delete({ where: { id: link.id } }),
      ]);
      return changed + 1;
    }
    if (link?.etag === event.etag) return changed;
    const read = fromGoogle(event, zone);
    if (!read) return changed;
    if (link && !link.item?.event) return changed;
    const current = link?.item?.event ? fieldsOf(link.item.title, link.item.event) : null;
    if (link && current && strataHash(current) !== link.strataHash && link.item!.updatedAt > new Date(event.updated ?? 0)) {
      await this.prisma.googleEvent.update({ where: { id: link.id }, data: { etag: event.etag } });
      return changed;
    }
    const fields = {
      ...read.fields,
      meetingUrl: read.fields.meetingUrl ?? current?.meetingUrl ?? null,
      excludedDates: read.fields.repeatRule ? [...new Set([...read.fields.excludedDates, ...(current?.excludedDates ?? [])])].sort() : [],
    };
    const linkFields = {
      etag: event.etag,
      strataHash: strataHash(fields),
      unreadableRule: read.unreadableRule,
      recurringEventId: event.recurringEventId ?? null,
      originalStartsOn: original ? dateValue(original) : null,
    };
    const details = { ...storedEvent(fields), meetingUrl: fields.meetingUrl };
    if (!link) {
      await this.prisma.item.create({
        data: {
          ownerId: userId,
          kind: ItemKind.EVENT,
          title: fields.title,
          createdById: userId,
          updatedById: userId,
          event: { create: details },
          googleEvent: { create: { calendarId, eventId: event.id, fromGoogle: true, ...linkFields } },
        },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.item.update({ where: { id: link.item!.id }, data: { title: fields.title, event: { update: details } } }),
        this.prisma.googleEvent.update({ where: { id: link.id }, data: linkFields }),
      ]);
    }
    return changed + 1;
  }

  private async exclude(calendarId: string, recurringEventId: string, day: string) {
    const master = await this.prisma.googleEvent.findUnique({
      where: { calendarId_eventId: { calendarId, eventId: recurringEventId } },
      select: { id: true, strataHash: true, item: linkedItem },
    });
    const item = master?.item;
    if (!master || !item?.event?.repeatRule) return 0;
    const fields = fieldsOf(item.title, item.event);
    if (fields.excludedDates.includes(day)) return 0;
    const next = { ...fields, excludedDates: [...fields.excludedDates, day].sort() };
    await this.prisma.$transaction([
      this.prisma.event.update({ where: { itemId: item.id }, data: { excludedDates: next.excludedDates.map(dateValue) } }),
      ...(strataHash(fields) === master.strataHash ? [this.prisma.googleEvent.update({ where: { id: master.id }, data: { strataHash: strataHash(next) } })] : []),
    ]);
    return 1;
  }

  private async push(userId: string, calendars: GoogleCalendar[]) {
    const writable = new Map(calendars.filter((calendar) => calendar.writable).map((calendar) => [calendar.id, calendar]));
    let pushed = 0;
    for (const orphan of await this.prisma.googleEvent.findMany({ where: { itemId: null, calendar: { userId } } })) {
      const calendar = writable.get(orphan.calendarId);
      if (calendar) await this.removeRemote(userId, calendar, orphan.eventId);
      await this.prisma.googleEvent.deleteMany({ where: { id: orphan.id } });
    }
    const links = await this.prisma.googleEvent.findMany({ where: { calendar: { userId }, itemId: { not: null } }, include: { item: linkedItem } });
    const instanceDates = new Map<string, Set<string>>();
    for (const link of links) {
      if (!link.recurringEventId || !link.originalStartsOn) continue;
      const key = `${link.calendarId} ${link.recurringEventId}`;
      instanceDates.set(key, (instanceDates.get(key) ?? new Set()).add(dateText(link.originalStartsOn)));
    }
    for (const link of links) {
      const calendar = writable.get(link.calendarId);
      const item = link.item;
      if (pushed >= pushesPerRun) return;
      if (!calendar || !item?.event) continue;
      if (item.trashedAt) {
        await this.removeRemote(userId, calendar, link.eventId);
        await this.prisma.googleEvent.deleteMany({ where: { id: link.id } });
        pushed += 1;
        continue;
      }
      const fields = fieldsOf(item.title, item.event);
      const hash = strataHash(fields);
      if (hash === link.strataHash) continue;
      pushed += 1;
      const body = toGoogle(fields, {
        keepRecurrence: link.unreadableRule || link.recurringEventId !== null,
        instanceDates: instanceDates.get(`${link.calendarId} ${link.eventId}`) ?? new Set(),
      });
      try {
        const saved = await this.google.request<GoogleEventResource>(userId, `${eventsPath(calendar.calendarId)}/${encodeURIComponent(link.eventId)}?sendUpdates=none`, {
          method: 'PATCH',
          headers: { 'If-Match': link.etag },
          body: JSON.stringify(body),
        });
        await this.prisma.googleEvent.update({ where: { id: link.id }, data: { etag: saved.etag, strataHash: hash } });
      } catch (error) {
        if (!(error instanceof GoogleApiError) || error.status === 401 || error.status === 403) throw error;
        if (error.status === 404 || error.status === 410) await this.prisma.googleEvent.deleteMany({ where: { id: link.id } });
        else if (error.status !== 412) await this.refused(calendar, item.title, error);
      }
    }
    const target = calendars.find((calendar) => calendar.isDefault && calendar.writable);
    if (!target) return;
    const fresh = await this.prisma.item.findMany({
      where: {
        ownerId: userId,
        kind: ItemKind.EVENT,
        trashedAt: null,
        googleEvent: { is: null },
        event: { OR: [{ repeatRule: { not: null } }, { endsOn: { gte: new Date(target.createdAt.getTime() - 30 * dayMs) } }] },
      },
      select: { id: true, title: true, event: true },
      take: Math.max(pushesPerRun - pushed, 0),
    });
    for (const item of fresh) {
      const fields = fieldsOf(item.title, item.event!);
      const body = toGoogle(fields, { keepRecurrence: false, instanceDates: new Set() });
      const eventId = item.id.replaceAll('-', '');
      try {
        const saved = await this.google
          .request<GoogleEventResource>(userId, `${eventsPath(target.calendarId)}?sendUpdates=none`, { method: 'POST', body: JSON.stringify({ ...body, id: eventId }) })
          .catch((error: unknown) => {
            if (!(error instanceof GoogleApiError && error.status === 409)) throw error;
            return this.google.request<GoogleEventResource>(userId, `${eventsPath(target.calendarId)}/${eventId}?sendUpdates=none`, {
              method: 'PATCH',
              body: JSON.stringify({ ...body, status: 'confirmed' }),
            });
          });
        await this.prisma.googleEvent.create({ data: { calendarId: target.id, itemId: item.id, eventId, etag: saved.etag, strataHash: strataHash(fields), fromGoogle: false } });
      } catch (error) {
        if (!(error instanceof GoogleApiError) || error.status === 401 || error.status === 403) throw error;
        await this.refused(target, item.title, error);
      }
    }
  }

  private async refused(calendar: GoogleCalendar, title: string, error: GoogleApiError) {
    this.logger.warn(`Google calendar ${calendar.id} refused “${title}”: ${error.message}`);
    await this.prisma.googleCalendar.updateMany({ where: { id: calendar.id }, data: { lastError: `Google did not accept “${title}”. Change it in Strata to try again.` } });
  }

  private async removeRemote(userId: string, calendar: GoogleCalendar, eventId: string) {
    try {
      await this.google.request(userId, `${eventsPath(calendar.calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof GoogleApiError && (error.status === 404 || error.status === 410))) throw error;
    }
  }

  private async own(userId: string, id: string) {
    const calendar = await this.prisma.googleCalendar.findFirst({ where: { id, userId } });
    if (!calendar) throw new NotFoundException('That Google calendar is not synced here');
    return calendar;
  }
}
