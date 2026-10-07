import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

const code = (link: string) => /\/rsvp\/([A-Za-z0-9_-]{43})/.exec(link)![1]!;

describe('Date polls against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('lets members and guests vote on dates, and the organiser picks one that moves the event', async () => {
    const host = await member('poll-host');
    const friend = await member('poll-friend');
    const outsider = await member('poll-outsider');
    const space = (await host.call('POST', '/spaces', { name: 'Friends' })).body;
    await strata.join(space.id, friend, SpaceRole.VIEWER);
    const dinner = (
      await host.call('POST', `/spaces/${space.id}/events`, { title: 'Dinner', startsOn: '2026-11-01', startTime: '19:00', endTime: '22:30', timeZone: 'Europe/Lisbon' })
    ).body;

    expect((await host.call('PUT', `/events/${dinner.id}/poll`, { options: [{ startsOn: '2026-11-06' }] })).status).toBe(400);
    expect((await host.call('PUT', `/events/${dinner.id}/poll`, { options: [{ startsOn: '2026-11-06' }, { startsOn: '2026-11-06' }] })).status).toBe(400);
    expect((await friend.call('PUT', `/events/${dinner.id}/poll`, { options: [{ startsOn: '2026-11-06' }, { startsOn: '2026-11-07' }] })).status).toBe(403);
    const poll = (
      await host.call('PUT', `/events/${dinner.id}/poll`, {
        options: [
          { startsOn: '2026-11-07', startTime: '23:00' },
          { startsOn: '2026-11-06', startTime: '20:00' },
        ],
      })
    ).body;
    const [friday, saturday] = poll.options;
    expect([friday.startsOn, saturday.startsOn]).toEqual(['2026-11-06', '2026-11-07']);

    expect((await friend.call('PUT', `/events/${dinner.id}/poll/votes`, { votes: { [friday.id]: 'yes', [saturday.id]: 'maybe' } })).body.options).toEqual([
      expect.objectContaining({ id: friday.id, yes: 1, maybe: 0, no: 0, mine: 'yes', voters: [{ name: 'poll-friend', answer: 'yes' }] }),
      expect.objectContaining({ id: saturday.id, yes: 0, maybe: 1, no: 0, mine: 'maybe' }),
    ]);
    expect((await friend.call('PUT', `/events/${dinner.id}/poll/votes`, { votes: { [friday.id]: 'pending' } })).status).toBe(400);
    expect((await outsider.call('GET', `/events/${dinner.id}/poll`)).status).toBe(404);

    const guest = code((await host.call('POST', `/events/${dinner.id}/guests`, { name: 'Robin' })).body.link);
    expect((await strata.anonymous('PUT', `/rsvp/${guest}/poll`, { votes: { [friday.id]: 'no', [saturday.id]: 'yes' } })).body.options).toEqual([
      { id: friday.id, startsOn: '2026-11-06', startTime: '20:00', yes: 1, maybe: 0, no: 1, mine: 'no' },
      { id: saturday.id, startsOn: '2026-11-07', startTime: '23:00', yes: 1, maybe: 1, no: 0, mine: 'yes' },
    ]);
    expect((await strata.anonymous('PUT', `/rsvp/${guest}/poll`, { votes: { 'not-an-option': 'yes' } })).status).toBe(400);

    await host.call('PUT', `/events/${dinner.id}/poll`, {
      options: [
        { startsOn: '2026-11-07', startTime: '23:00' },
        { startsOn: '2026-11-08' },
      ],
    });
    const kept = (await host.call('GET', `/events/${dinner.id}/poll`)).body.options;
    expect(kept.map((option: { startsOn: string; yes: number }) => [option.startsOn, option.yes])).toEqual([
      ['2026-11-07', 1],
      ['2026-11-08', 0],
    ]);

    expect((await friend.call('POST', `/events/${dinner.id}/poll/pick`, { optionId: saturday.id })).status).toBe(403);
    const picked = (await host.call('POST', `/events/${dinner.id}/poll/pick`, { optionId: saturday.id })).body;
    expect(picked).toMatchObject({ startsOn: '2026-11-07', startTime: '23:00', endsOn: '2026-11-08', endTime: '02:30' });
    expect((await host.call('GET', `/events/${dinner.id}/poll`)).body.options).toEqual([]);
    expect((await strata.anonymous('GET', `/rsvp/${guest}/poll`)).body.options).toEqual([]);
  });

  it('keeps repeating events out of polls', async () => {
    const host = await member('weekly-host');
    const weekly = (await host.call('POST', `/spaces/${host.personalSpaceId}/events`, { title: 'Quiz', startsOn: '2026-11-03', repeatRule: 'FREQ=WEEKLY' })).body;
    expect((await host.call('PUT', `/events/${weekly.id}/poll`, { options: [{ startsOn: '2026-11-04' }, { startsOn: '2026-11-05' }] })).status).toBe(400);
  });
});
