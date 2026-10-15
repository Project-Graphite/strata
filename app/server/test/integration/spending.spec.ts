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

  it('keeps account balances from spending, income, refunds and transfers, and leaves transfers out of the month', async () => {
    await strata.prisma.exchangeRate.upsert({ where: { currency: 'EGP' }, create: { currency: 'EGP', perEuro: 50, publishedOn: new Date('2026-10-09') }, update: { perEuro: 50 } });
    const owner = await member('account-keeper');
    const viewer = await member('account-peeker');
    const outsider = await member('account-stranger');
    const home = (await owner.call('POST', '/spaces', { name: 'Home money' })).body;
    await strata.join(home.id, viewer, SpaceRole.VIEWER);
    const other = (await owner.call('POST', '/spaces', { name: 'Elsewhere' })).body;

    expect((await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP', cardDigits: ['12345'] })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP', kind: 'vault' })).status).toBe(400);
    expect((await viewer.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP' })).status).toBe(403);
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'egp', cardDigits: ['1234', '1234', '5678'], senders: ['CIB'], balanceMinor: 1_000_000 })).body;
    expect(bank).toMatchObject({ name: 'CIB', kind: 'bank', currency: 'EGP', cardDigits: ['1234', '5678'], senders: ['CIB'], balanceMinor: 1_000_000, missing: [] });
    const wallet = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Vodafone Cash', kind: 'wallet', currency: 'EGP' })).body;
    const card = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Travel card', kind: 'credit', currency: 'EUR', creditLimitMinor: 100_000 })).body;
    const elsewhere = (await owner.call('POST', `/spaces/${other.id}/accounts`, { name: 'Other bank', currency: 'EGP' })).body;

    const base = { currency: 'EGP', spentOn: '2026-10-10' };
    const add = (body: object) => owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, ...body });
    expect((await add({ title: 'Lunch', amountMinor: 100, accountId: elsewhere.id })).status).toBe(400);
    expect((await add({ title: 'Move', amountMinor: 100, direction: 'transfer', accountId: bank.id })).status).toBe(400);
    expect((await add({ title: 'Move', amountMinor: 100, direction: 'transfer', accountId: bank.id, toAccountId: bank.id })).status).toBe(400);
    const groceries = (await add({ title: 'Carrefour', amountMinor: 250_000, category: 'groceries', accountId: bank.id, merchant: 'Carrefour Maadi' })).body;
    expect(groceries).toMatchObject({ direction: 'spent', merchant: 'Carrefour Maadi', source: 'manual', accountId: bank.id, toAccountId: null });
    await add({ title: 'Carrefour refund', amountMinor: 50_000, category: 'groceries', direction: 'refund', accountId: bank.id });
    await add({ title: 'Salary', amountMinor: 3_000_000, direction: 'received', accountId: bank.id });
    await add({ title: 'Top up', amountMinor: 200_000, direction: 'transfer', accountId: bank.id, toAccountId: wallet.id });
    await add({ title: 'Paris dinner', amountMinor: 4000, currency: 'EUR', category: 'eating out', accountId: card.id });
    await add({ title: 'Taxi', amountMinor: 30_000, category: 'transport', accountId: wallet.id, toAccountId: bank.id });

    const balances = Object.fromEntries((await viewer.call('GET', `/spaces/${home.id}/accounts`)).body.map((account: { name: string; balanceMinor: number }) => [account.name, account.balanceMinor]));
    expect(balances).toEqual({ CIB: 1_000_000 - 250_000 + 50_000 + 3_000_000 - 200_000, 'Vodafone Cash': 200_000 - 30_000, 'Travel card': -4000 });
    expect((await outsider.call('GET', `/spaces/${home.id}/accounts`)).status).toBe(404);

    const month = (await owner.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).body;
    expect(month).toMatchObject({ currency: 'EGP', spentMinor: 250_000 - 50_000 + 200_000 + 30_000, receivedMinor: 3_000_000 });
    expect(month.categories).toEqual([
      { category: 'groceries', spentMinor: 200_000, budgetMinor: null, carriedMinor: 0 },
      { category: 'eating out', spentMinor: 200_000, budgetMinor: null, carriedMinor: 0 },
      { category: 'transport', spentMinor: 30_000, budgetMinor: null, carriedMinor: 0 },
    ]);

    expect((await owner.call('PATCH', `/expenses/${groceries.id}`, { direction: 'transfer' })).status).toBe(400);
    expect((await owner.call('PATCH', `/expenses/${groceries.id}`, { direction: 'transfer', toAccountId: wallet.id })).body).toMatchObject({ direction: 'transfer', toAccountId: wallet.id });
    expect((await owner.call('PATCH', `/expenses/${groceries.id}`, { direction: 'spent' })).body).toMatchObject({ direction: 'spent', toAccountId: null });

    expect((await owner.call('PATCH', `/accounts/${bank.id}`, { balanceMinor: 500_000 })).body.balanceMinor).toBe(500_000);
    expect((await viewer.call('PATCH', `/accounts/${bank.id}`, { name: 'Mine' })).status).toBe(403);
    expect((await owner.call('DELETE', `/accounts/${wallet.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/expenses/${groceries.id}`)).body.accountId).toBe(bank.id);
    expect((await owner.call('GET', `/spaces/${home.id}/accounts`)).body.map((account: { name: string }) => account.name)).toEqual(['CIB', 'Travel card']);
  });

  it('lets a space rename, recolour, add and remove spending categories without losing expenses', async () => {
    const owner = await member('categoriser');
    const viewer = await member('category-watcher');
    const home = (await owner.call('POST', '/spaces', { name: 'Categories' })).body;
    await strata.join(home.id, viewer, SpaceRole.VIEWER);
    const defaults = (await viewer.call('GET', `/spaces/${home.id}/spending-categories`)).body;
    expect(defaults).toHaveLength(12);
    expect(defaults[0]).toEqual({ name: 'groceries', colour: 'green', uses: 0 });

    const base = { currency: 'EGP', spentOn: '2026-10-10' };
    const market = (await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Market', amountMinor: 100, category: 'groceries' })).body;
    const cinema = (await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Cinema', amountMinor: 200, category: 'entertainment' })).body;
    const used = (await viewer.call('GET', `/spaces/${home.id}/spending-categories`)).body;
    expect(used.filter((category: { uses: number }) => category.uses > 0)).toEqual([
      { name: 'groceries', colour: 'green', uses: 1 },
      { name: 'entertainment', colour: 'teal', uses: 1 },
    ]);
    await owner.call('PUT', `/spaces/${home.id}/budgets/groceries`, { amountMinor: 5000, currency: 'EGP' });
    await owner.call('PUT', `/spaces/${home.id}/budgets/entertainment`, { amountMinor: 3000, currency: 'EGP' });
    expect((await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Gym', amountMinor: 300, category: 'fitness' })).status).toBe(400);

    const save = (who: typeof owner, categories: object[]) => who.call('PUT', `/spaces/${home.id}/spending-categories`, { categories });
    expect((await save(viewer, [{ name: 'other', colour: 'gray' }])).status).toBe(403);
    expect((await save(owner, [{ name: 'food', colour: 'green' }])).status).toBe(400);
    expect((await save(owner, [{ name: 'food', colour: 'green' }, { name: 'Food', colour: 'red' }, { name: 'other', colour: 'gray' }])).status).toBe(400);
    expect((await save(owner, [{ name: 'food', colour: 'violet' }, { name: 'other', colour: 'gray' }])).status).toBe(400);
    const saved = await save(owner, [
      { name: 'food', colour: 'orange', previous: 'groceries' },
      { name: 'fitness', colour: 'teal' },
      { name: 'other', colour: 'gray', previous: 'other' },
    ]);
    expect(saved.body).toEqual([
      { name: 'food', colour: 'orange' },
      { name: 'fitness', colour: 'teal' },
      { name: 'other', colour: 'gray' },
    ]);
    expect((await owner.call('GET', `/expenses/${market.id}`)).body.category).toBe('food');
    expect((await owner.call('GET', `/expenses/${cinema.id}`)).body.category).toBe('other');
    const month = (await owner.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).body;
    expect(month.budgets).toEqual([{ category: 'food', amountMinor: 5000, currency: 'EGP' }]);
    expect(month.categories.map((row: { category: string }) => row.category)).toEqual(['other', 'food']);
    expect((await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Gym', amountMinor: 300, category: 'fitness' })).status).toBe(201);
    expect((await owner.call('PUT', `/spaces/${home.id}/budgets/groceries`, { amountMinor: 5000, currency: 'EGP' })).status).toBe(400);

    expect((await save(owner, [{ name: 'fitness', colour: 'teal', previous: 'food' }, { name: 'food', colour: 'orange', previous: 'fitness' }, { name: 'other', colour: 'gray' }])).status).toBe(200);
    expect((await owner.call('GET', `/expenses/${market.id}`)).body.category).toBe('fitness');
  });

  it('runs months from payday, carries leftovers over and warns at 80% and 100% of a budget', async () => {
    const owner = await member('planner');
    const partner = await member('plan-partner');
    const viewer = await member('plan-viewer');
    const home = (await owner.call('POST', '/spaces', { name: 'Plans' })).body;
    await strata.join(home.id, partner, SpaceRole.EDITOR);
    await strata.join(home.id, viewer, SpaceRole.VIEWER);
    const plan = (body: object) => owner.call('PUT', `/spaces/${home.id}/spending-plan`, body);
    expect((await plan({ budgetMinor: null, currency: 'EGP', startDay: 25, rollover: true })).status).toBe(400);
    expect((await plan({ budgetMinor: 100_000, currency: 'EGP', startDay: 29, rollover: true })).status).toBe(400);
    expect((await viewer.call('PUT', `/spaces/${home.id}/spending-plan`, { budgetMinor: null, currency: null, startDay: 1, rollover: false })).status).toBe(403);
    expect((await plan({ budgetMinor: 100_000, currency: 'EGP', startDay: 25, rollover: true })).body).toEqual({ budgetMinor: 100_000, currency: 'EGP', startDay: 25, rollover: true });
    await owner.call('PUT', `/spaces/${home.id}/budgets/groceries`, { amountMinor: 10_000, currency: 'EGP' });

    const add = (title: string, amountMinor: number, spentOn: string, category = 'groceries') =>
      owner.call('POST', `/spaces/${home.id}/expenses`, { title, amountMinor, currency: 'EGP', spentOn, category });
    await add('July market', 4000, '2026-08-24');
    await add('August market', 7000, '2026-08-25');
    await add('Late August market', 1000, '2026-09-24');
    const august = (await owner.call('GET', `/spaces/${home.id}/spending?month=2026-08`)).body;
    expect(august).toMatchObject({
      month: '2026-08',
      from: '2026-08-25',
      until: '2026-09-24',
      spentMinor: 8000,
      budgetMinor: 100_000 + 96_000,
      carriedMinor: 96_000,
      safeDailyMinor: null,
      plan: { budgetMinor: 100_000, currency: 'EGP', startDay: 25, rollover: true },
    });
    expect(august.categories).toEqual([{ category: 'groceries', spentMinor: 8000, budgetMinor: 16_000, carriedMinor: 6000 }]);

    const today = new Date().toISOString().slice(0, 10);
    const current = (await owner.call('GET', `/spaces/${home.id}/spending`)).body;
    expect(current.from <= today && today <= current.until).toBe(true);
    expect(current.safeDailyMinor).toBeGreaterThan(0);

    const shared = (await owner.call('POST', '/spaces', { name: 'Alerts' })).body;
    await strata.join(shared.id, partner, SpaceRole.EDITOR);
    await strata.join(shared.id, viewer, SpaceRole.VIEWER);
    await owner.call('PUT', `/spaces/${shared.id}/spending-plan`, { budgetMinor: 10_000, currency: 'EGP', startDay: 1, rollover: false });
    const spend = (title: string, amountMinor: number) =>
      owner.call('POST', `/spaces/${shared.id}/expenses`, { title, amountMinor, currency: 'EGP', spentOn: today, category: 'groceries' });
    const alerts = (who: { id: string }) =>
      strata.prisma.inboxNotification.findMany({ where: { userId: who.id, kind: 'budget_alert' }, orderBy: { createdAt: 'asc' }, select: { title: true, body: true } });
    await spend('Small shop', 7000);
    expect(await alerts(owner)).toEqual([]);
    await spend('Bigger shop', 1500);
    expect(await alerts(partner)).toEqual([{ title: '80% of the monthly budget used', body: expect.stringMatching(/^EGP\s85\.00 of EGP\s100\.00$/) }]);
    await spend('Treat', 2000);
    await spend('Another treat', 500);
    expect((await alerts(owner)).map((alert) => alert.title)).toEqual(['80% of the monthly budget used', 'Over the monthly budget']);
    expect(await alerts(viewer)).toHaveLength(2);
  });

  it('adds up recent months, top merchants and days, and exports every transaction as CSV', async () => {
    const owner = await member('analyst');
    const outsider = await member('analyst-outsider');
    const home = (await owner.call('POST', '/spaces', { name: 'Insights' })).body;
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'NBE', currency: 'EGP' })).body;
    const today = new Date().toISOString().slice(0, 10);
    const add = (body: object) => owner.call('POST', `/spaces/${home.id}/expenses`, { currency: 'EGP', spentOn: today, category: 'eating out', ...body });
    await add({ title: 'Talabat', amountMinor: 30_000, merchant: 'Talabat' });
    await add({ title: 'Talabat again', amountMinor: 20_000, merchant: 'TALABAT' });
    await add({ title: 'Lunch, with "friends"', amountMinor: 5000, accountId: bank.id });
    await add({ title: '=cmd()', amountMinor: 1000, category: 'other' });
    await add({ title: 'Salary', amountMinor: 900_000, direction: 'received', accountId: bank.id });

    expect((await owner.call('GET', `/spaces/${home.id}/spending/insights?months=30`)).status).toBe(400);
    expect((await outsider.call('GET', `/spaces/${home.id}/spending/insights`)).status).toBe(404);
    const insights = (await owner.call('GET', `/spaces/${home.id}/spending/insights?months=3`)).body;
    expect(insights.periods).toHaveLength(3);
    expect(insights.periods.at(-1)).toMatchObject({
      spentMinor: 56_000,
      receivedMinor: 900_000,
      categories: [
        { category: 'eating out', spentMinor: 55_000 },
        { category: 'other', spentMinor: 1000 },
      ],
    });
    expect(insights.periods[0]).toMatchObject({ spentMinor: 0, categories: [] });
    expect(insights.merchants[0]).toEqual({ merchant: 'Talabat', count: 2, totalMinor: 50_000, averageMinor: 25_000, lastOn: today });
    expect(insights.days.find((day: { day: string }) => day.day === today).spentMinor).toBe(56_000);
    expect(insights.days[0].day).toBe(insights.periods.at(-1).from);

    const response = await fetch(`${strata.base}/spaces/${home.id}/expenses/export`, { headers: { Authorization: `Bearer ${owner.token}` } });
    expect(response.headers.get('content-type')).toContain('text/csv');
    const lines = (await response.text()).trim().split('\r\n');
    expect(lines[0]).toBe('date,title,merchant,type,amount,currency,category,account,to account,note');
    expect(lines).toContain(`${today},"Lunch, with ""friends""",,spent,50.00,EGP,eating out,NBE,,`);
    expect(lines).toContain(`${today},'=cmd(),,spent,10.00,EGP,other,,,`);
    expect(lines).toContain(`${today},Salary,,received,9000.00,EGP,,NBE,,`);
  });
});
