import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Spending and budgets against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('adds up a month of spending against budgets in the home currency, with renewals as committed', async () => {
    for (const [currency, perEuro] of [
      ['EUR', 1],
      ['USD', 1.25],
    ] as const) {
      await strata.prisma.exchangeRate.upsert({ where: { currency }, create: { currency, perEuro, publishedOn: new Date('2026-10-09') }, update: { perEuro } });
    }
    const owner = await member('saver');
    const partner = await member('spender');
    const viewer = await member('auditor');
    const outsider = await member('nosy-neighbour');
    await owner.call('PATCH', '/me', { homeCurrency: 'EUR' });
    const flat = (await owner.call('POST', '/spaces', { name: 'Flat' })).body;
    await strata.join(flat.id, partner, SpaceRole.EDITOR);
    await strata.join(flat.id, viewer, SpaceRole.VIEWER);

    const groceries = { title: 'Market', amountMinor: 4000, currency: 'eur', spentOn: '2026-10-05', category: 'groceries' };
    expect((await viewer.call('POST', `/spaces/${flat.id}/expenses`, groceries)).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${flat.id}/expenses`, { ...groceries, paymentLabel: '4242 4242 4242 4242' })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${flat.id}/expenses`, { ...groceries, category: 'yachts' })).status).toBe(400);
    const market = (await owner.call('POST', `/spaces/${flat.id}/expenses`, { ...groceries, paymentLabel: 'Visa ending 1234' })).body;
    expect(market).toMatchObject({ title: 'Market', amountMinor: 4000, currency: 'EUR', spentOn: '2026-10-05', category: 'groceries', split: null });
    await partner.call('POST', `/spaces/${flat.id}/expenses`, { title: 'Diner', amountMinor: 2500, currency: 'USD', spentOn: '2026-10-07', category: 'eating out' });
    expect(
      (
        await owner.call('POST', `/spaces/${flat.id}/expenses/import`, {
          expenses: [
            { title: 'Corner shop', amountMinor: 1500, currency: 'EUR', spentOn: '2026-10-20', category: 'groceries' },
            { title: 'Train', amountMinor: 900, currency: 'EUR', spentOn: '2026-11-02', category: 'transport' },
          ],
        })
      ).body,
    ).toEqual({ added: 2 });
    expect((await owner.call('POST', `/spaces/${flat.id}/expenses/import`, { expenses: [] })).status).toBe(400);

    expect((await owner.call('PUT', `/spaces/${flat.id}/budgets/yachts`, { amountMinor: 100, currency: 'EUR' })).status).toBe(400);
    expect((await viewer.call('PUT', `/spaces/${flat.id}/budgets/groceries`, { amountMinor: 30000, currency: 'EUR' })).status).toBe(403);
    expect((await owner.call('PUT', `/spaces/${flat.id}/budgets/groceries`, { amountMinor: 30000, currency: 'EUR' })).body).toEqual({ category: 'groceries', amountMinor: 30000, currency: 'EUR' });
    await owner.call('PUT', `/spaces/${flat.id}/budgets/health`, { amountMinor: 5000, currency: 'EUR' });
    await owner.call('POST', `/spaces/${flat.id}/subscriptions`, { name: 'Internet', amountMinor: 3000, currency: 'EUR', repeatRule: 'FREQ=MONTHLY', startDate: '2026-09-15' });

    const october = (await viewer.call('GET', `/spaces/${flat.id}/spending?month=2026-10`)).body;
    expect(october).toMatchObject({
      month: '2026-10',
      currency: 'EUR',
      missing: [],
      spentMinor: 4000 + 2000 + 1500,
      budgetMinor: 35000,
      committedMinor: 3000,
      categories: [
        { category: 'groceries', spentMinor: 5500, budgetMinor: 30000 },
        { category: 'eating out', spentMinor: 2000, budgetMinor: null },
        { category: 'health', spentMinor: 0, budgetMinor: 5000 },
      ],
    });
    expect(october.expenses.map((expense: { title: string }) => expense.title)).toEqual(['Corner shop', 'Diner', 'Market']);
    expect((await owner.call('GET', `/spaces/${flat.id}/spending?month=2026-13`)).status).toBe(400);
    expect((await outsider.call('GET', `/spaces/${flat.id}/spending?month=2026-10`)).status).toBe(404);

    expect((await partner.call('PATCH', `/expenses/${market.id}`, { amountMinor: 4200, note: 'Plus flowers' })).body).toMatchObject({ amountMinor: 4200, note: 'Plus flowers' });
    expect((await owner.call('PUT', `/expenses/${market.id}/split`, { payerId: owner.id, shares: [{ userId: owner.id, weight: 1 }, { userId: partner.id, weight: 1 }] })).status).toBe(200);
    const balances = (await partner.call('GET', `/spaces/${flat.id}/balances?month=2026-10`)).body;
    expect(balances.charges).toMatchObject([{ itemId: market.id, name: 'Market', amountMinor: 4200, renewals: ['2026-10-05'] }]);
    expect(balances.debts).toMatchObject([{ fromUserId: partner.id, toUserId: owner.id, amountMinor: 2100, currency: 'EUR' }]);
    expect((await owner.call('GET', `/spaces/${flat.id}/balances?month=2026-11`)).body.charges).toEqual([]);

    expect((await owner.call('DELETE', `/spaces/${flat.id}/budgets/health`)).status).toBe(204);
    expect((await owner.call('DELETE', `/spaces/${flat.id}/budgets/health`)).status).toBe(404);
    expect((await owner.call('POST', `/items/${market.id}/trash`)).status).toBe(204);
    expect((await owner.call('GET', `/spaces/${flat.id}/spending?month=2026-10`)).body.spentMinor).toBe(2000 + 1500);
  });
});
