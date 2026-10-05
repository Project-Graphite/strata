import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { localDate } from '../../src/recurrence/dates';
import { shiftDay } from '../../src/habits/streaks';
import { integrationApp } from './harness';

describe('Habits against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps habits in a space and check-ins for each member', async () => {
    const owner = await member('keeper');
    const viewer = await member('follower');
    const outsider = await member('nosy');
    const flat = (await owner.call('POST', '/spaces', { name: 'Flat' })).body;
    await strata.join(flat.id, viewer, SpaceRole.VIEWER);
    const today = localDate('Etc/UTC');
    const yesterday = shiftDay(today, -1);

    expect((await viewer.call('POST', `/spaces/${flat.id}/habits`, { name: 'Water the plants' })).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${flat.id}/habits`, { name: ' ', perWeek: 3 })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${flat.id}/habits`, { name: 'Run', perWeek: 8 })).status).toBe(400);
    const plants = (await owner.call('POST', `/spaces/${flat.id}/habits`, { name: 'Water the plants' })).body;
    expect(plants).toMatchObject({ name: 'Water the plants', perWeek: 7, spaceName: 'Flat', today, checkedToday: false, streak: 0, recent: [] });

    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${yesterday}`)).body).toMatchObject({ streak: 1, checkedToday: false });
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).body).toMatchObject({ streak: 2, checkedToday: true, recent: [yesterday, today] });
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).body.streak).toBe(2);
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${shiftDay(today, -2)}`)).status).toBe(400);
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/not-a-day`)).status).toBe(400);

    expect((await viewer.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).body).toMatchObject({ streak: 1, checkedToday: true });
    expect((await viewer.call('GET', `/spaces/${flat.id}/habits`)).body).toMatchObject([{ id: plants.id, streak: 1 }]);
    expect((await owner.call('GET', '/me/habits')).body).toMatchObject([{ id: plants.id, streak: 2 }]);
    expect((await viewer.call('PATCH', `/habits/${plants.id}`, { name: 'Mine now' })).status).toBe(403);
    expect((await outsider.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).status).toBe(404);
    expect((await outsider.call('GET', '/me/habits')).body).toEqual([]);

    expect((await owner.call('DELETE', `/habits/${plants.id}/check-ins/${today}`)).body).toMatchObject({ streak: 1, checkedToday: false });
    expect((await owner.call('PATCH', `/habits/${plants.id}`, { name: 'Plants', perWeek: 3 })).body).toMatchObject({ name: 'Plants', perWeek: 3 });
    expect((await viewer.call('DELETE', `/habits/${plants.id}`)).status).toBe(403);
    expect((await owner.call('DELETE', `/habits/${plants.id}`)).status).toBe(204);
    expect(await strata.prisma.habitCheckIn.count({ where: { habitId: plants.id } })).toBe(0);
  });
});
