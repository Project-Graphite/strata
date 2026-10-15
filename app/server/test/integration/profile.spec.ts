import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Profile preferences against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps a 12- or 24-hour clock, following the device until one is chosen', async () => {
    const person = await member('clock-reader');
    expect((await person.call('GET', '/me')).body.timeFormat).toBe('auto');
    expect((await person.call('PATCH', '/me', { timeFormat: '13h' })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { timeFormat: null })).status).toBe(400);
    expect((await person.call('PATCH', '/me', { timeFormat: '12h' })).body.timeFormat).toBe('12h');
    expect((await person.call('GET', '/me')).body.timeFormat).toBe('12h');
    expect((await person.call('PATCH', '/me', { timeFormat: '24h' })).body.timeFormat).toBe('24h');
  });
});
