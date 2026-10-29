import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Profile preferences against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('has no clock setting, so times follow the device', async () => {
    const person = await member('clock-reader');
    expect((await person.call('GET', '/me')).body).not.toHaveProperty('timeFormat');
    expect((await person.call('PATCH', '/me', { timeFormat: '12h' })).status).toBe(400);
  });

  it('starts the week on Sunday with a Friday and Saturday weekend until another week is chosen', async () => {
    const person = await member('week-planner');
    expect((await person.call('GET', '/me')).body).toMatchObject({ weekStart: 0, weekendDays: [5, 6] });
    expect((await person.call('PATCH', '/me', { weekStart: 7 })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { weekStart: null })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { weekendDays: [5, 5] })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { weekendDays: [0, 1, 2, 3, 4, 5, 6] })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { weekStart: 1, weekendDays: [6, 0] })).body).toMatchObject({ weekStart: 1, weekendDays: [0, 6] });
    expect((await person.call('GET', '/me')).body).toMatchObject({ weekStart: 1, weekendDays: [0, 6] });
    expect((await person.call('PATCH', '/me', { weekendDays: [] })).body.weekendDays).toEqual([]);
  });
});
