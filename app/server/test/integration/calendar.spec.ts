import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Calendar feeds against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('publishes my events at a secret link that can be reset or turned off', async () => {
    const owner = await member('feed-owner');
    const other = await member('feed-other');
    await owner.call('POST', `/spaces/${owner.personalSpaceId}/events`, { title: 'Dentist', startsOn: '2026-11-03', startTime: '09:30', timeZone: 'Europe/Lisbon' });
    await other.call('POST', `/spaces/${other.personalSpaceId}/events`, { title: 'Not mine', startsOn: '2026-11-03' });
    const feed = (url: string) => fetch(`${strata.base}${new URL(url).pathname.replace('/api/v1', '')}`);

    expect((await owner.call('GET', '/me/calendar-feed')).body).toEqual({ enabled: false });
    const first = (await owner.call('POST', '/me/calendar-feed')).body;
    expect(first.url).toMatch(/\/api\/v1\/calendar\/[\w-]{43}\.ics$/);
    expect((await owner.call('GET', '/me/calendar-feed')).body).toEqual({ enabled: true });

    const response = await feed(first.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    const text = await response.text();
    expect(text).toContain('SUMMARY:Dentist');
    expect(text).toContain('DTSTART;TZID=Europe/Lisbon:20261103T093000');
    expect(text).not.toContain('Not mine');

    const second = (await owner.call('POST', '/me/calendar-feed')).body;
    expect((await feed(first.url)).status).toBe(404);
    expect((await feed(second.url)).status).toBe(200);
    expect((await owner.call('DELETE', '/me/calendar-feed')).body).toEqual({ enabled: false });
    expect((await feed(second.url)).status).toBe(404);
    expect((await strata.anonymous('GET', '/calendar/not-a-feed.ics')).status).toBe(404);
  });
});
