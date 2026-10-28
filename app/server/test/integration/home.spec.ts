import { describe, expect, it } from 'vitest';
import { dateText, dateValue, dayMs, localDate } from '../../src/recurrence/dates';
import { integrationApp } from './harness';

describe('Home summary against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('adds up what is next, what is due and what needs the user in one call', async () => {
    const owner = await member('homebody');
    const host = await member('home-host');
    const home = owner.personalSpaceId;
    const today = localDate((await owner.call('GET', '/me')).body.timeZone);
    const day = (offset: number) => dateText(new Date(dateValue(today).getTime() + offset * dayMs));
    const quiet = { nextEvent: null, dueToday: 0, safeToSpend: null, toReview: 0, payments: { missed: 0, upcoming: 0 }, invitations: 0, unread: 0 };

    expect((await owner.call('GET', '/me/home')).body).toEqual(quiet);

    await owner.call('POST', `/spaces/${home}/events`, { title: 'All day', startsOn: today });
    await owner.call('POST', `/spaces/${home}/events`, { title: 'Dentist', startsOn: day(1), startTime: '10:00', endTime: '11:00' });
    await owner.call('POST', `/spaces/${home}/events`, { title: 'Later', startsOn: day(2), startTime: '09:00', endTime: '10:00' });
    await owner.call('POST', `/spaces/${home}/tasks`, { title: 'Pay rent', dueDate: today });
    await owner.call('POST', `/spaces/${home}/tasks`, { title: 'Overdue', dueDate: day(-2) });
    await owner.call('POST', `/spaces/${home}/tasks`, { title: 'Next week', dueDate: day(6) });
    await owner.call('PUT', `/spaces/${home}/budgets/groceries`, { amountMinor: 30_000, currency: 'EUR' });
    await owner.call('POST', `/spaces/${home}/installments`, { name: 'Phone', currency: 'EUR', monthlyMinor: 1_000, count: 3, firstDueOn: day(-10) });
    await owner.call('POST', `/spaces/${home}/installments`, { name: 'Sofa', currency: 'EUR', monthlyMinor: 2_000, count: 3, firstDueOn: day(3) });
    await strata.prisma.capturedMessage.create({ data: { spaceId: home, userId: owner.id, sender: 'Bank', textSealed: 'sealed', hash: 'home-capture', receivedAt: new Date() } });
    await strata.prisma.inboxNotification.create({ data: { userId: owner.id, kind: 'invitation', title: 'Hello' } });
    const space = (await host.call('POST', '/spaces', { name: 'Flat' })).body;
    expect((await host.call('POST', `/spaces/${space.id}/invitations`, { handle: owner.handle, role: 'editor' })).status).toBe(201);

    const summary = (await owner.call('GET', '/me/home')).body;
    expect(summary).toEqual({
      nextEvent: expect.objectContaining({ kind: 'event', title: 'Dentist', allDay: false }),
      dueToday: 2,
      safeToSpend: { amountMinor: expect.any(Number), currency: 'EUR' },
      toReview: 1,
      payments: { missed: 1, upcoming: 1 },
      invitations: 1,
      unread: (await owner.call('GET', '/me/inbox/summary')).body.unread,
    });
    expect(summary.unread).toBeGreaterThanOrEqual(1);
    expect(summary.safeToSpend.amountMinor).toBeGreaterThan(0);

    expect((await host.call('GET', '/me/home')).body).toEqual(quiet);

    await owner.call('PATCH', '/me', { features: ['tasks', 'agenda'] });
    expect((await owner.call('GET', '/me/home')).body).toMatchObject({ safeToSpend: null, toReview: 0, payments: { missed: 0, upcoming: 0 }, dueToday: 2 });
  });
});
