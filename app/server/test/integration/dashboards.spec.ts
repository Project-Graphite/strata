import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Dashboards against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('starts everyone with a Home dashboard and keeps layouts valid and private', async () => {
    const owner = await member('arranger');
    const other = await member('peeker');

    const [home] = (await owner.call('GET', '/me/dashboards')).body;
    expect(home).toMatchObject({ name: 'Home' });
    expect(home.layout.widgets.map((widget: { type: string }) => widget.type)).toEqual(['clock', 'today', 'agenda', 'recurring', 'inbox']);
    expect((await owner.call('GET', '/me/dashboards')).body).toHaveLength(1);

    const layout = {
      widgets: [
        { id: 'a', type: 'today', size: 'full', settings: {} },
        { id: 'b', type: 'shortcuts', size: 'wide', settings: { links: [{ label: 'Mail', url: 'https://mail.example.com' }] } },
      ],
    };
    const saved = await owner.call('PATCH', `/me/dashboards/${home.id}`, { name: 'Mornings', layout });
    expect(saved.body).toMatchObject({ name: 'Mornings', layout });

    for (const [widgets, reason] of [
      [[{ id: 'a', type: 'weather', size: 'small', settings: {} }], 'unknown widget'],
      [[{ id: 'a', type: 'today', size: 'huge', settings: {} }], 'unknown size'],
      [[{ id: 'a', type: 'today', size: 'small', settings: {} }, { id: 'a', type: 'inbox', size: 'small', settings: {} }], 'repeated id'],
      [[{ id: 'a', type: 'shortcuts', size: 'small', settings: { links: [{ label: 'Bad', url: 'http://example.com' }] } }], 'plain http link'],
      [[{ id: 'a', type: 'clock', size: 'small', settings: { notes: 'x'.repeat(5_000) } }], 'oversized settings'],
    ] as const) {
      expect({ reason, status: (await owner.call('PATCH', `/me/dashboards/${home.id}`, { layout: { widgets } })).status }).toEqual({
        reason,
        status: 400,
      });
    }

    expect((await other.call('PATCH', `/me/dashboards/${home.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await other.call('DELETE', `/me/dashboards/${home.id}`)).status).toBe(404);
    expect((await owner.call('DELETE', `/me/dashboards/${home.id}`)).status).toBe(400);

    const travel = await owner.call('POST', '/me/dashboards', { name: 'Trip', template: 'travel' });
    expect(travel.body.layout.widgets[0]).toMatchObject({ type: 'clock', settings: { zones: ['Europe/London', 'America/New_York', 'Asia/Tokyo'] } });
    expect((await owner.call('DELETE', `/me/dashboards/${home.id}`)).status).toBe(204);
    expect((await owner.call('GET', '/me/dashboards')).body.map((dashboard: { name: string }) => dashboard.name)).toEqual(['Trip']);
  });
});
