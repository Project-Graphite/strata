import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/events/events.service';

describe('EventsService agenda', () => {
  it('leaves the skipped dates of a repeating event out of the agenda', async () => {
    const weekly = {
      id: 'standup',
      title: 'Standup',
      event: {
        startsOn: new Date('2026-11-02T00:00:00Z'),
        startTime: '09:00',
        endsOn: new Date('2026-11-02T00:00:00Z'),
        endTime: '09:15',
        timeZone: 'Europe/Paris',
        repeatRule: 'FREQ=WEEKLY;BYDAY=MO',
        excludedDates: [new Date('2026-11-16T00:00:00Z')],
        location: null,
      },
    };
    const prisma = {
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timeZone: 'Europe/Paris', features: [] }) },
      item: { findMany: vi.fn().mockResolvedValueOnce([weekly]).mockResolvedValue([]) },
      subscription: { findMany: vi.fn().mockResolvedValue([]) },
      subscribedEvent: { findMany: vi.fn().mockResolvedValue([]) },
      installmentPlan: { findMany: vi.fn().mockResolvedValue([]) },
      moneyAccount: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const access = { ownedBy: () => ({}), itemsOf: () => ({}) };
    const service = new EventsService(prisma as never, access as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    const entries = await service.agenda('user-1', '2026-11-08', '2026-11-30');

    expect(entries.map((entry) => entry.start)).toEqual(['2026-11-09T08:00:00.000Z', '2026-11-23T08:00:00.000Z']);
  });
});
