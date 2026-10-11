import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Goals against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('turns features on per person and keeps the choice in the session', async () => {
    const person = await member('chooser');

    expect((await person.call('GET', '/me')).body.features).toEqual([]);
    expect((await person.call('PATCH', '/me', { features: ['rockets'] })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { features: ['goals', 'goals'] })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { features: ['goals'] })).body.features).toEqual(['goals']);
    expect((await strata.prisma.user.findUniqueOrThrow({ where: { id: person.id } })).features).toEqual(['goals']);
  });

  it('keeps goals for a period, with progress from a number or from linked tasks, and follows habits', async () => {
    const owner = await member('planner');
    const viewer = await member('watcher');
    const outsider = await member('stranger');
    const home = (await owner.call('POST', '/spaces', { name: 'Home' })).body;
    await strata.join(home.id, viewer, SpaceRole.VIEWER);

    expect((await viewer.call('POST', `/spaces/${home.id}/goals`, { title: 'Run more', period: 'year', startsOn: '2026-05-04' })).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${home.id}/goals`, { title: 'Run more', period: 'decade', startsOn: '2026-05-04' })).status).toBe(400);

    const run = (await owner.call('POST', `/spaces/${home.id}/goals`, { title: 'Run 500 km', period: 'year', startsOn: '2026-05-04', target: 500, current: 125, unit: 'km' })).body;
    expect(run).toMatchObject({ title: 'Run 500 km', period: 'year', startsOn: '2026-01-01', endsOn: '2026-12-31', status: 'active', progress: 0.25, spaceName: 'Home' });

    const garden = (await owner.call('POST', `/spaces/${home.id}/goals`, { title: 'Tidy the garden', period: 'quarter', startsOn: '2026-11-20' })).body;
    expect(garden).toMatchObject({ startsOn: '2026-10-01', endsOn: '2026-12-31', progress: null, tasks: { done: 0, total: 0 } });

    const weeds = (await owner.call('POST', `/spaces/${home.id}/tasks`, { title: 'Pull the weeds' })).body;
    const shed = (await owner.call('POST', `/spaces/${home.id}/tasks`, { title: 'Clear the shed' })).body;
    for (const task of [weeds, shed]) {
      expect((await owner.call('POST', `/items/${garden.id}/links`, { targetId: task.id, kind: 'reference' })).status).toBe(201);
    }
    await owner.call('POST', `/tasks/${weeds.id}/complete`);
    const detail = (await owner.call('GET', `/goals/${garden.id}`)).body;
    expect(detail).toMatchObject({ progress: 0.5, tasks: { done: 1, total: 2 } });
    expect(detail.taskList.map((task: { title: string }) => task.title)).toEqual(['Clear the shed', 'Pull the weeds']);
    expect(detail.taskList[0].linkId).toEqual(expect.any(String));

    const water = (await owner.call('POST', `/spaces/${home.id}/habits`, { name: 'Water the beds' })).body;
    const other = (await owner.call('POST', '/spaces', { name: 'Elsewhere' })).body;
    const elsewhere = (await owner.call('POST', `/spaces/${other.id}/habits`, { name: 'Somewhere else' })).body;
    expect((await owner.call('PUT', `/goals/${garden.id}/habits`, { habitIds: [elsewhere.id] })).status).toBe(400);
    const followed = (await owner.call('PUT', `/goals/${garden.id}/habits`, { habitIds: [water.id] })).body;
    expect(followed.habits).toMatchObject([{ id: water.id, name: 'Water the beds', streak: 0 }]);
    expect(followed.habitCount).toBe(1);

    expect((await viewer.call('PATCH', `/goals/${garden.id}`, { status: 'done' })).status).toBe(403);
    expect((await outsider.call('GET', `/goals/${garden.id}`)).status).toBe(404);
    expect((await owner.call('PATCH', `/goals/${run.id}`, { period: 'month', startsOn: '2026-02-14', current: 600 })).body).toMatchObject({
      startsOn: '2026-02-01',
      endsOn: '2026-02-28',
      progress: 1,
    });
    expect((await owner.call('PATCH', `/goals/${run.id}`, { status: 'done' })).body.status).toBe('done');

    expect((await viewer.call('GET', '/me/goals')).body.map((goal: { title: string }) => goal.title)).toEqual(['Tidy the garden']);
    expect((await viewer.call('GET', '/me/goals?status=finished')).body.map((goal: { title: string }) => goal.title)).toEqual(['Run 500 km']);
    expect((await outsider.call('GET', '/me/goals')).body).toEqual([]);

    expect((await owner.call('POST', `/items/${garden.id}/trash`)).status).toBe(204);
    expect((await owner.call('PATCH', `/goals/${garden.id}`, { title: 'Too late' })).status).toBe(400);
    expect((await owner.call('GET', '/me/goals')).body).toEqual([]);
  });
});
