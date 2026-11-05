import { describe, expect, it, vi } from 'vitest';
import { storedEvent, strataHash, type EventFields } from '../src/google/calendar-mapping';
import { GoogleApiError } from '../src/google/google-client';
import { GoogleCalendarService } from '../src/google/google-calendar.service';

const calendar = { id: 'cal-1', userId: 'user-1', calendarId: 'primary', writable: true, isDefault: true, syncToken: null, createdAt: new Date('2026-11-01T00:00:00Z') };
const fields: EventFields = {
  title: 'Dinner',
  startsOn: '2026-11-20',
  startTime: '19:00',
  endsOn: '2026-11-20',
  endTime: '21:00',
  timeZone: 'Africa/Cairo',
  repeatRule: null,
  excludedDates: [],
  location: null,
  description: '',
  meetingUrl: null,
  reminderMinutes: null,
};
const stored = { ...storedEvent(fields), meetingUrl: null };
const googleEvent = (id: string, etag: string, extra: Record<string, unknown> = {}) => ({
  id,
  etag,
  summary: 'Dinner',
  start: { dateTime: '2026-11-20T19:00:00+02:00', timeZone: 'Africa/Cairo' },
  end: { dateTime: '2026-11-20T21:00:00+02:00', timeZone: 'Africa/Cairo' },
  ...extra,
});

function setup(options: { links?: unknown[]; fresh?: unknown[]; found?: Record<string, unknown>; events?: unknown[]; claimed?: number } = {}) {
  const prisma = {
    googleAccount: { updateMany: vi.fn().mockResolvedValueOnce({ count: options.claimed ?? 1 }).mockResolvedValue({ count: 1 }) },
    googleCalendar: { findMany: vi.fn().mockResolvedValue([calendar]), updateMany: vi.fn() },
    googleEvent: {
      findUnique: vi.fn(({ where }: { where: { calendarId_eventId: { eventId: string } } }) => Promise.resolve(options.found?.[where.calendarId_eventId.eventId] ?? null)),
      findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(options.links ?? []),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    item: { create: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue(options.fresh ?? []) },
    event: { update: vi.fn() },
    $transaction: vi.fn((work: Promise<unknown>[]) => Promise.all(work)),
  };
  const google = {
    request: vi.fn((url: string, init: RequestInit = {}) => {
      if (!init.method) return Promise.resolve({ items: options.events ?? [], nextSyncToken: 'next-sync', timeZone: 'Africa/Cairo' });
      if (init.method === 'POST') return Promise.reject(new GoogleApiError('duplicate', 409));
      return Promise.resolve({ etag: `"saved-${init.method}"` });
    }),
  };
  const changes = { notify: vi.fn() };
  const service = new GoogleCalendarService(
    prisma as never,
    { request: (_userId: string, url: string, init?: RequestInit) => google.request(url, init) } as never,
    {} as never,
    {} as never,
    {} as never,
    changes as never,
  );
  return { prisma, google, changes, service };
}

describe('GoogleCalendarService.sync', () => {
  it('skips the run when another sync for the account holds the lease', async () => {
    const { google, service } = setup({ claimed: 0 });

    await expect(service.sync('user-1', new Date())).resolves.toBeNull();
    expect(google.request).not.toHaveBeenCalled();
  });

  it('pulls new Google events into Strata, ignores ones it already has and trashes cancelled ones', async () => {
    const { prisma, google, changes, service } = setup({
      events: [googleEvent('new', '"1"'), googleEvent('same', '"7"'), { id: 'gone', etag: '"9"', status: 'cancelled' }],
      found: {
        same: { id: 'link-same', etag: '"7"', item: { id: 'item-same', title: 'Dinner', event: stored } },
        gone: { id: 'link-gone', etag: '"8"', item: { id: 'item-gone', trashedAt: null } },
      },
    });

    await expect(service.sync('user-1', new Date('2026-11-05T10:00:00Z'))).resolves.toBe(2);
    expect(google.request.mock.calls[0]![0]).toContain('timeMin=');
    expect(prisma.item.create).toHaveBeenCalledTimes(1);
    expect(prisma.item.create.mock.calls[0]![0].data).toMatchObject({
      ownerId: 'user-1',
      title: 'Dinner',
      event: { create: { startTime: '19:00', endTime: '21:00', timeZone: 'Africa/Cairo' } },
      googleEvent: { create: { calendarId: 'cal-1', eventId: 'new', etag: '"1"', fromGoogle: true, strataHash: strataHash(fields) } },
    });
    expect(prisma.item.update).toHaveBeenCalledWith({ where: { id: 'item-gone' }, data: { trashedAt: expect.any(Date) } });
    expect(prisma.googleEvent.delete).toHaveBeenCalledWith({ where: { id: 'link-gone' } });
    expect(prisma.googleCalendar.updateMany).toHaveBeenCalledWith({ where: { id: 'cal-1' }, data: expect.objectContaining({ syncToken: 'next-sync', lastError: null }) });
    expect(changes.notify).toHaveBeenCalledWith('items', { userId: 'user-1' });
  });

  it('keeps a Strata edit that is newer than the Google one and adopts Google’s version tag so the edit can be sent', async () => {
    const { prisma, service } = setup({
      events: [googleEvent('both', '"2"', { summary: 'Supper', updated: '2026-11-05T09:00:00Z' })],
      found: { both: { id: 'link-both', etag: '"1"', strataHash: 'before-edit', item: { id: 'item-both', title: 'Dinner', updatedAt: new Date('2026-11-05T09:30:00Z'), event: stored } } },
    });

    await service.sync('user-1', new Date('2026-11-05T10:00:00Z'));
    expect(prisma.item.update).not.toHaveBeenCalled();
    expect(prisma.googleEvent.update).toHaveBeenCalledWith({ where: { id: 'link-both' }, data: { etag: '"2"' } });
  });

  it('sends only changed Strata events, deletes trashed ones and adds new ones to the default calendar', async () => {
    const changed = { id: 'link-changed', calendarId: 'cal-1', eventId: 'g-changed', etag: '"3"', strataHash: 'stale', unreadableRule: false, recurringEventId: null, item: { id: 'i-1', title: 'Dinner', trashedAt: null, event: stored } };
    const unchanged = { ...changed, id: 'link-unchanged', eventId: 'g-unchanged', strataHash: strataHash(fields), item: { ...changed.item, id: 'i-2' } };
    const trashed = { ...changed, id: 'link-trashed', eventId: 'g-trashed', item: { ...changed.item, id: 'i-3', trashedAt: new Date() } };
    const fresh = { id: '0f8b2d36-1c1e-4a51-9a4e-5b3c1f6a7d20', title: 'Dinner', event: stored };
    const { prisma, google, service } = setup({ links: [changed, unchanged, trashed], fresh: [fresh] });

    await service.sync('user-1', new Date('2026-11-05T10:00:00Z'));
    const sent = google.request.mock.calls.filter(([, init]) => init?.method).map(([url, init]) => [init!.method, url.replace(/^.*\/events/, ''), (init!.headers as Record<string, string> | undefined)?.['If-Match']]);
    expect(sent).toEqual([
      ['PATCH', '/g-changed?sendUpdates=none', '"3"'],
      ['DELETE', '/g-trashed?sendUpdates=none', undefined],
      ['POST', '?sendUpdates=none', undefined],
      ['PATCH', '/0f8b2d361c1e4a519a4e5b3c1f6a7d20?sendUpdates=none', undefined],
    ]);
    expect(JSON.parse(google.request.mock.calls.at(-1)![1]!.body as string)).toMatchObject({ status: 'confirmed', summary: 'Dinner' });
    expect(prisma.googleEvent.update).toHaveBeenCalledWith({ where: { id: 'link-changed' }, data: { etag: '"saved-PATCH"', strataHash: strataHash(fields) } });
    expect(prisma.googleEvent.deleteMany).toHaveBeenCalledWith({ where: { id: 'link-trashed' } });
    expect(prisma.googleEvent.create).toHaveBeenCalledWith({
      data: { calendarId: 'cal-1', itemId: fresh.id, eventId: '0f8b2d361c1e4a519a4e5b3c1f6a7d20', etag: '"saved-PATCH"', strataHash: strataHash(fields), fromGoogle: false },
    });
  });
});
