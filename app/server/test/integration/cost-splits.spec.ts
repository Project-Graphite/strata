import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Cost splitting against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('splits renewals by weight, nets payments and lets only the two people record them', async () => {
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
    const weekly = (
      await amr.call('POST', `/spaces/${flat.id}/subscriptions`, {
        name: 'Veg box',
        amountMinor: 1000,
        currency: 'EUR',
        repeatRule: 'FREQ=WEEKLY',
        startDate: '2026-10-01',
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
    await sam.call('PUT', `/subscriptions/${weekly.id}/split`, { payerId: sam.id, shares: [{ userId: amr.id, weight: 1 }, { userId: sam.id, weight: 1 }] });
    expect((await vic.call('GET', `/subscriptions/${internet.id}`)).body.split.payerId).toBe(amr.id);

    const october = await vic.call('GET', `/spaces/${flat.id}/balances?month=2026-10`);
    expect(october.body.charges).toEqual([
      { itemId: internet.id, name: 'Internet', payerId: amr.id, payerName: 'splitter', amountMinor: 3000, currency: 'EUR', renewals: ['2026-10-10'] },
      {
        itemId: weekly.id,
        name: 'Veg box',
        payerId: sam.id,
        payerName: 'sharer',
        amountMinor: 5000,
        currency: 'EUR',
        renewals: ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'],
      },
    ]);
    expect(october.body.debts).toEqual([{ fromUserId: amr.id, fromName: 'splitter', toUserId: sam.id, toName: 'sharer', amountMinor: 500, currency: 'EUR' }]);
    expect((await amr.call('GET', `/spaces/${flat.id}/balances?month=2026-13`)).status).toBe(400);

    const payment = { fromUserId: amr.id, toUserId: sam.id, amountMinor: 300, currency: 'EUR', month: '2026-10' };
    expect((await vic.call('POST', `/spaces/${flat.id}/settlements`, payment)).status).toBe(403);
    expect((await outsider.call('POST', `/spaces/${flat.id}/settlements`, payment)).status).toBe(404);
    const settled = (await sam.call('POST', `/spaces/${flat.id}/settlements`, payment)).body;
    const after = (await amr.call('GET', `/spaces/${flat.id}/balances?month=2026-10`)).body;
    expect(after.debts).toEqual([expect.objectContaining({ fromUserId: amr.id, toUserId: sam.id, amountMinor: 200 })]);
    expect(after.settlements).toEqual([expect.objectContaining({ id: settled.id, fromName: 'splitter', toName: 'sharer', amountMinor: 300 })]);

    expect((await vic.call('DELETE', `/settlements/${settled.id}`)).status).toBe(404);
    expect((await amr.call('DELETE', `/settlements/${settled.id}`)).status).toBe(204);
    expect((await amr.call('GET', `/spaces/${flat.id}/balances?month=2026-10`)).body.debts[0].amountMinor).toBe(500);

    await amr.call('POST', `/subscriptions/${weekly.id}/cancel`);
    expect((await amr.call('DELETE', `/subscriptions/${internet.id}/split`)).status).toBe(204);
    expect((await amr.call('GET', `/subscriptions/${internet.id}`)).body.split).toBeNull();
    expect((await amr.call('GET', `/spaces/${flat.id}/balances?month=2027-01`)).body).toMatchObject({ charges: [], debts: [] });
  });
});
