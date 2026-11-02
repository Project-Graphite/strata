import { describe, expect, it } from 'vitest';
import { localDate } from '../../src/recurrence/dates';
import { shiftDay } from '../../src/habits/streaks';
import { integrationApp } from './harness';

describe('Habits against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps habits and their check-ins for their owner', async () => {
    const owner = await member('keeper');
    const outsider = await member('nosy');
    const today = localDate('Etc/UTC');
    const yesterday = shiftDay(today, -1);

    expect((await owner.call('POST', '/me/habits', { name: ' ', perWeek: 3 })).status).toBe(400);
    expect((await owner.call('POST', '/me/habits', { name: 'Run', perWeek: 8 })).status).toBe(400);
    const plants = (await owner.call('POST', '/me/habits', { name: 'Water the plants' })).body;
    expect(plants).toMatchObject({ name: 'Water the plants', perWeek: 7, today, checkedToday: false, streak: 0, recent: [] });
    expect(plants).not.toHaveProperty('spaceId');

    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${yesterday}`)).body).toMatchObject({ streak: 1, checkedToday: false });
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).body).toMatchObject({ streak: 2, checkedToday: true, recent: [yesterday, today] });
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).body.streak).toBe(2);
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/${shiftDay(today, -2)}`)).status).toBe(400);
    expect((await owner.call('PUT', `/habits/${plants.id}/check-ins/not-a-day`)).status).toBe(400);

    expect((await owner.call('GET', '/me/habits')).body).toMatchObject([{ id: plants.id, streak: 2 }]);
    expect((await outsider.call('PATCH', `/habits/${plants.id}`, { name: 'Mine now' })).status).toBe(404);
    expect((await outsider.call('PUT', `/habits/${plants.id}/check-ins/${today}`)).status).toBe(404);
    expect((await outsider.call('GET', '/me/habits')).body).toEqual([]);

    expect((await owner.call('DELETE', `/habits/${plants.id}/check-ins/${today}`)).body).toMatchObject({ streak: 1, checkedToday: false });
    expect((await owner.call('PATCH', `/habits/${plants.id}`, { name: 'Plants', perWeek: 3 })).body).toMatchObject({ name: 'Plants', perWeek: 3 });
    expect((await outsider.call('DELETE', `/habits/${plants.id}`)).status).toBe(404);
    expect((await owner.call('DELETE', `/habits/${plants.id}`)).status).toBe(204);
    expect(await strata.prisma.habitCheckIn.count({ where: { habitId: plants.id } })).toBe(0);
  });
});
