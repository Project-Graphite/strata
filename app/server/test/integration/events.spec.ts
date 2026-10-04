import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { JobsService } from '../../src/jobs/jobs.service';
import { integrationApp } from './harness';

const dayMs = 24 * 60 * 60 * 1000;
const utcDate = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);
const code = (link: string) => /\/(?:rsvp|share)\/([A-Za-z0-9_-]{43})/.exec(link)![1]!;

describe('Events and the agenda against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('merges repeating events, due tasks and renewals into one agenda for the people who can see them', async () => {
    const owner = await member('organiser');
    const viewer = await member('attendee');
    const outsider = await member('outsider');
    const space = (await owner.call('POST', '/spaces', { name: 'Club' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);

    for (const [change, reason] of [
      [{ startsOn: utcDate(1), startTime: '19:00', endTime: '18:00' }, 'ends before it starts'],
      [{ startsOn: utcDate(1), endTime: '18:00' }, 'end time without a start time'],
      [{ startsOn: utcDate(1), meetingUrl: 'http://meet.example.com/x' }, 'plain http link'],
      [{ startsOn: utcDate(1), endsOn: utcDate(40) }, 'longer than 31 days'],
      [{ startsOn: utcDate(1), repeatRule: 'FREQ=HOURLY' }, 'unsupported rule'],
    ] as const) {
      expect({ reason, status: (await owner.call('POST', `/spaces/${space.id}/events`, { title: 'Bad', ...change })).status }).toEqual({
        reason,
        status: 400,
      });
    }

    const practice = (
      await owner.call('POST', `/spaces/${space.id}/events`, {
        title: 'Practice',
        startsOn: utcDate(1),
        startTime: '18:00',
        endTime: '19:30',
        timeZone: 'UTC',
        repeatRule: 'FREQ=WEEKLY;COUNT=3',
        location: 'Hall',
      })
    ).body;
    expect(practice).toMatchObject({ title: 'Practice', startTime: '18:00', endsOn: utcDate(1), repeatRule: 'FREQ=WEEKLY;COUNT=3', headcount: { yes: 0 } });
    await owner.call('POST', `/spaces/${space.id}/events`, { title: 'Picnic', startsOn: utcDate(3) });
    await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Book the hall', dueDate: utcDate(2) });
    await owner.call('POST', `/spaces/${space.id}/subscriptions`, {
      name: 'Hall hire',
      amountMinor: 2000,
      currency: 'EUR',
      repeatRule: 'FREQ=MONTHLY',
      startDate: utcDate(5),
    });

    const agenda = (await viewer.call('GET', `/agenda?from=${utcDate(0)}&to=${utcDate(30)}`)).body;
    expect(agenda.filter((entry: { title: string }) => entry.title === 'Practice').map((entry: { start: string; end: string }) => [entry.start, entry.end])).toEqual([
      [`${utcDate(1)}T18:00:00.000Z`, `${utcDate(1)}T19:30:00.000Z`],
      [`${utcDate(8)}T18:00:00.000Z`, `${utcDate(8)}T19:30:00.000Z`],
      [`${utcDate(15)}T18:00:00.000Z`, `${utcDate(15)}T19:30:00.000Z`],
    ]);
    expect(agenda.find((entry: { title: string }) => entry.title === 'Picnic')).toMatchObject({ kind: 'event', allDay: true, start: utcDate(3), end: utcDate(3) });
    expect(agenda.find((entry: { title: string }) => entry.title === 'Book the hall')).toMatchObject({ kind: 'task', allDay: true, start: utcDate(2) });
    expect(agenda.find((entry: { title: string }) => entry.title === 'Hall hire')).toMatchObject({ kind: 'renewal', start: utcDate(5) });
    expect((await outsider.call('GET', `/agenda?from=${utcDate(0)}&to=${utcDate(30)}`)).body).toEqual([]);
    expect((await outsider.call('GET', `/events/${practice.id}`)).status).toBe(404);
    expect((await viewer.call('PATCH', `/events/${practice.id}`, { title: 'Mine' })).status).toBe(403);
    expect((await viewer.call('GET', `/agenda?from=${utcDate(0)}&to=${utcDate(200)}`)).status).toBe(400);
  });

  it('lets guests answer from a personal or shared link without seeing anything else', async () => {
    const owner = await member('host');
    const party = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/events`, { title: 'Party', startsOn: utcDate(10), startTime: '20:00' })).body;

    const invited = (await owner.call('POST', `/events/${party.id}/guests`, { name: 'Sam', email: strata.email('sam') })).body;
    expect(invited).toMatchObject({ emailed: true, guest: { name: 'Sam', response: 'pending' } });
    expect(strata.mail.at(-1)).toMatchObject({ to: strata.email('sam'), text: expect.stringContaining('/rsvp/') });
    const personal = code(invited.link);

    const view = (await strata.anonymous('GET', `/rsvp/${personal}`)).body;
    expect(view).toEqual({
      event: expect.objectContaining({ title: 'Party', startsOn: utcDate(10), startTime: '20:00' }),
      guest: { name: 'Sam', response: 'pending', note: null },
    });
    expect(JSON.stringify(view)).not.toContain(owner.personalSpaceId);
    expect((await strata.anonymous('POST', `/rsvp/${personal}`, { response: 'yes', note: 'see www.example.com' })).status).toBe(400);
    expect((await strata.anonymous('POST', `/rsvp/${personal}`, { response: 'yes', note: 'Bringing cake' })).body.guest).toEqual({
      name: 'Sam',
      response: 'yes',
      note: 'Bringing cake',
    });

    const shared = (await owner.call('POST', `/items/${party.id}/share-links`, { access: 'view' })).body;
    const open = code(shared.link);
    expect((await strata.anonymous('GET', `/share/${open}`)).body.event).toMatchObject({ title: 'Party', startTime: '20:00' });
    const walkIn = (await strata.anonymous('POST', `/share/${open}/rsvp`, { name: 'Alex', response: 'maybe' })).body;
    expect((await strata.anonymous('GET', `/rsvp/${code(walkIn.link)}`)).body.guest).toMatchObject({ name: 'Alex', response: 'maybe' });

    const event = (await owner.call('GET', `/events/${party.id}`)).body;
    expect(event.headcount).toEqual({ yes: 1, no: 0, maybe: 1, pending: 0 });
    const sam = event.guests.find((guest: { name: string }) => guest.name === 'Sam');
    expect((await owner.call('DELETE', `/events/${party.id}/guests/${sam.id}`)).status).toBe(204);
    expect((await strata.anonymous('GET', `/rsvp/${personal}`)).status).toBe(404);
  });

  it('reminds the organiser before each occurrence of a repeating event', async () => {
    const owner = await member('busy-host');
    const jobs = strata.service(JobsService);
    const standup = (
      await owner.call('POST', `/spaces/${owner.personalSpaceId}/events`, {
        title: 'Stand-up',
        startsOn: utcDate(1),
        startTime: '09:00',
        timeZone: 'UTC',
        repeatRule: 'FREQ=DAILY;COUNT=3',
        reminderMinutes: 15,
      })
    ).body;
    const pending = () =>
      strata.prisma.scheduledJob.findMany({ where: { kind: 'event.reminder', doneAt: null, payload: { path: ['itemId'], equals: standup.id } } });
    const [first] = await pending();
    expect(first!.runAt.toISOString()).toBe(`${utcDate(1)}T08:45:00.000Z`);

    await jobs.runDue(new Date(first!.runAt.getTime() + 1_000));
    expect((await owner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({ kind: 'event_soon', title: 'Stand-up starts at 09:00' });
    const [second] = await pending();
    expect(second!.runAt.toISOString()).toBe(`${utcDate(2)}T08:45:00.000Z`);
  });
});
