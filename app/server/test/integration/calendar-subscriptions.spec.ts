import { SpaceRole } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarSubscriptionsService } from '../../src/calendar/calendar-subscriptions.service';
import { FetchError, fetchPublic } from '../../src/widgets/safe-fetch';
import { integrationApp } from './harness';

vi.mock('../../src/widgets/safe-fetch', async (original) => ({ ...(await original<typeof import('../../src/widgets/safe-fetch')>()), fetchPublic: vi.fn() }));

const ics = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Club fixtures', ...events.flatMap((event) => ['BEGIN:VEVENT', ...event.split('\n'), 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

describe('Followed calendars against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  afterEach(() => vi.mocked(fetchPublic).mockReset());

  it('follows a public calendar in a space, shows its events in the agenda and keeps the address private', async () => {
    const owner = await member('fixtures-owner');
    const viewer = await member('fixtures-viewer');
    const outsider = await member('fixtures-outsider');
    const space = (await owner.call('POST', '/spaces', { name: 'Football' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    vi.mocked(fetchPublic).mockResolvedValue(ics('UID:m1\nSUMMARY:Home match\nDTSTART:20261107T150000Z\nDTEND:20261107T170000Z\nDESCRIPTION:Gates open at two\nX-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij', 'UID:m2\nSUMMARY:Training\nDTSTART;VALUE=DATE:20261105'));

    expect((await owner.call('POST', `/spaces/${space.id}/calendars`, { url: 'http://fixtures.example/cal.ics' })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/calendars`, { url: 'https://10.0.0.1/cal.ics' })).status).toBe(400);
    vi.mocked(fetchPublic).mockRejectedValueOnce(new FetchError('That address took too long to answer', 'timeout'));
    expect((await owner.call('POST', `/spaces/${space.id}/calendars`, { url: 'https://fixtures.example/slow.ics' })).body.message).toBe(
      'The calendar’s server took too long to answer. Try again later.',
    );
    expect((await viewer.call('POST', `/spaces/${space.id}/calendars`, { url: 'https://fixtures.example/cal.ics' })).status).toBe(403);
    const added = await owner.call('POST', `/spaces/${space.id}/calendars`, { url: 'webcal://fixtures.example/private/token123/cal.ics' });
    expect(added.status).toBe(201);
    expect(vi.mocked(fetchPublic)).toHaveBeenLastCalledWith('https://fixtures.example/private/token123/cal.ics', expect.objectContaining({ maxBytes: 1_000_000 }));
    expect(added.body).toMatchObject({ spaceId: space.id, name: 'Club fixtures', host: 'fixtures.example', events: 2, lastError: null });
    expect(JSON.stringify(added.body)).not.toContain('token123');
    const stored = await strata.prisma.calendarSubscription.findUniqueOrThrow({ where: { id: added.body.id } });
    expect(stored.urlSealed).not.toContain('token123');

    const agenda = (await viewer.call('GET', '/agenda?from=2026-11-01&to=2026-11-10')).body;
    expect(agenda.filter((entry: { kind: string }) => entry.kind === 'external')).toEqual([
      expect.objectContaining({ title: 'Training', allDay: true, start: '2026-11-05', calendar: 'Club fixtures', spaceId: space.id }),
      expect.objectContaining({ title: 'Home match', allDay: false, start: '2026-11-07T15:00:00.000Z', end: '2026-11-07T17:00:00.000Z', calendarId: added.body.id, uid: 'm1' }),
    ]);
    expect((await viewer.call('GET', `/calendars/${added.body.id}/event?uid=m1`)).body).toMatchObject({
      title: 'Home match',
      startsOn: '2026-11-07',
      startTime: '15:00',
      description: 'Gates open at two',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      calendar: { id: added.body.id, name: 'Club fixtures', host: 'fixtures.example' },
    });
    expect((await outsider.call('GET', `/calendars/${added.body.id}/event?uid=m1`)).status).toBe(404);
    expect((await viewer.call('GET', `/calendars/${added.body.id}/event?uid=missing`)).status).toBe(404);
    expect((await outsider.call('GET', '/agenda?from=2026-11-01&to=2026-11-10')).body).toEqual([]);
    expect((await viewer.call('GET', '/me/calendars')).body).toHaveLength(1);
    expect((await outsider.call('GET', '/me/calendars')).body).toEqual([]);

    const refreshFailing = async () => (await owner.call('POST', `/calendars/${added.body.id}/refresh`)).body;
    vi.mocked(fetchPublic).mockRejectedValueOnce(new FetchError('The address answered with status 500', 'status', 500));
    expect(await refreshFailing()).toMatchObject({ lastError: 'The calendar’s server could not send the calendar. Try again later.', events: 2 });
    vi.mocked(fetchPublic).mockRejectedValueOnce(new FetchError('The address answered with status 403', 'status', 403));
    expect((await refreshFailing()).lastError).toBe('This calendar needs a private link that allows access. Copy the secret iCal address from your calendar app.');
    vi.mocked(fetchPublic).mockRejectedValueOnce(new FetchError('The address answered with status 404', 'status', 404));
    expect((await refreshFailing()).lastError).toBe('This calendar link no longer exists. Copy a fresh link from your calendar app.');
    vi.mocked(fetchPublic).mockRejectedValueOnce(new FetchError('That address could not be found', 'unreachable'));
    expect((await refreshFailing()).lastError).toBe('The calendar’s server could not be reached. Check the link, or try again later.');
    vi.mocked(fetchPublic).mockResolvedValueOnce('<html>Sign in</html>');
    expect((await refreshFailing()).lastError).toBe('This link is not a calendar file. Copy the iCal (.ics) link from your calendar app.');
    vi.mocked(fetchPublic).mockRejectedValueOnce(new Error('getaddrinfo EAI_FAIL fixtures.example'));
    expect(await refreshFailing()).toMatchObject({ lastError: 'This calendar could not be read. Try again later.', events: 2 });

    vi.mocked(fetchPublic).mockResolvedValue(ics('UID:m3\nSUMMARY:Cup final\nDTSTART;VALUE=DATE:20261108'));
    await strata.prisma.calendarSubscription.update({ where: { id: added.body.id }, data: { lastFetchedAt: new Date(Date.now() - 20 * 60 * 1000) } });
    await strata.service(CalendarSubscriptionsService).refreshDue(new Date());
    const titles = (await owner.call('GET', '/agenda?from=2026-11-01&to=2026-11-10')).body.map((entry: { title: string }) => entry.title);
    expect(titles).toEqual(['Cup final']);

    vi.mocked(fetchPublic).mockResolvedValue(ics('UID:m4\nSUMMARY:Replay\nDTSTART;VALUE=DATE:20261109'));
    expect((await owner.call('POST', '/me/calendars/refresh')).body).toEqual({ refreshed: 0 });
    await strata.prisma.calendarSubscription.update({ where: { id: added.body.id }, data: { lastFetchedAt: new Date(Date.now() - 2 * 60 * 1000) } });
    expect((await outsider.call('POST', '/me/calendars/refresh')).body).toEqual({ refreshed: 0 });
    expect((await viewer.call('POST', '/me/calendars/refresh')).body).toEqual({ refreshed: 1 });
    expect((await viewer.call('POST', '/me/calendars/refresh')).body).toEqual({ refreshed: 0 });
    expect((await owner.call('GET', '/agenda?from=2026-11-01&to=2026-11-10')).body.map((entry: { title: string }) => entry.title)).toEqual(['Replay']);

    expect((await viewer.call('DELETE', `/calendars/${added.body.id}`)).status).toBe(403);
    expect((await owner.call('DELETE', `/calendars/${added.body.id}`)).status).toBe(204);
    expect(await strata.prisma.subscribedEvent.count({ where: { subscriptionId: added.body.id } })).toBe(0);
  });
});
