import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Cost splitting against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('splits shared subscriptions by weight between members and no longer splits expenses or shows balances', async () => {
    const amr = await member('splitter');
    const sam = await member('sharer');
    const vic = await member('bystander');
    const outsider = await member('stranger');
    const flat = (await amr.call('POST', '/spaces', { name: 'Flat' })).body;
    await strata.join(flat.id, sam, SpaceRole.EDITOR);
    await strata.join(flat.id, vic, SpaceRole.VIEWER);
    const internet = (
      await amr.call('POST', `/spaces/${flat.id}/subscriptions`, {
        name: 'Internet',
        amountMinor: 3000,
        currency: 'EUR',
        repeatRule: 'FREQ=MONTHLY',
        startDate: '2026-09-10',
      })
    ).body;
    const split = { payerId: amr.id, shares: [{ userId: amr.id, weight: 1 }, { userId: sam.id, weight: 2 }] };

    expect((await vic.call('PUT', `/subscriptions/${internet.id}/split`, split)).status).toBe(403);
    expect((await amr.call('PUT', `/subscriptions/${internet.id}/split`, { ...split, shares: [...split.shares, { userId: outsider.id, weight: 1 }] })).status).toBe(400);
    expect((await amr.call('PUT', `/subscriptions/${internet.id}/split`, { ...split, shares: [split.shares[0]] })).status).toBe(400);
    expect((await amr.call('PUT', `/subscriptions/${internet.id}/split`, split)).body).toEqual({
      payerId: amr.id,
      shares: expect.arrayContaining([{ userId: amr.id, weight: 1 }, { userId: sam.id, weight: 2 }]),
    });
    expect((await vic.call('GET', `/subscriptions/${internet.id}`)).body.split.payerId).toBe(amr.id);

    const lunch = (await amr.call('POST', `/spaces/${amr.personalSpaceId}/expenses`, { title: 'Lunch', amountMinor: 1000, currency: 'EUR', spentOn: '2026-10-10' })).body;
    expect((await amr.call('PUT', `/expenses/${lunch.id}/split`, split)).status).toBe(404);
    expect((await amr.call('PUT', `/subscriptions/${lunch.id}/split`, split)).status).toBe(404);
    expect((await vic.call('GET', `/spaces/${flat.id}/balances?month=2026-10`)).status).toBe(404);
    expect((await sam.call('POST', `/spaces/${flat.id}/settlements`, { fromUserId: amr.id, toUserId: sam.id, amountMinor: 300, currency: 'EUR', month: '2026-10' })).status).toBe(404);

    expect((await amr.call('DELETE', `/subscriptions/${internet.id}/split`)).status).toBe(204);
    expect((await amr.call('GET', `/subscriptions/${internet.id}`)).body.split).toBeNull();
  });
});
