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
      await strata.prisma.exchangeRate.upsert({ where: { currency_publishedOn: { currency, publishedOn: new Date('2100-01-01') } }, create: { currency, perEuro, publishedOn: new Date('2100-01-01') }, update: { perEuro } });
    }
    const owner = await member('saver');
    const partner = await member('spender');
    const outsider = await member('nosy-neighbour');
    await owner.call('PATCH', '/me', { homeCurrency: 'EUR' });
    const flat = (await owner.call('POST', '/spaces', { name: 'Flat' })).body;
    await strata.join(flat.id, partner, SpaceRole.EDITOR);
    const home = { id: owner.personalSpaceId };

    const groceries = { title: 'Market', amountMinor: 4000, currency: 'eur', spentOn: '2026-10-05', category: 'groceries' };
    expect((await owner.call('POST', `/spaces/${flat.id}/expenses`, groceries)).status).toBe(403);
    expect((await partner.call('POST', `/spaces/${home.id}/expenses`, groceries)).status).toBe(404);
    expect((await owner.call('POST', `/spaces/${home.id}/expenses`, { ...groceries, paymentLabel: '4242 4242 4242 4242' })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${home.id}/expenses`, { ...groceries, category: 'yachts' })).status).toBe(400);
    const market = (await owner.call('POST', `/spaces/${home.id}/expenses`, { ...groceries, paymentLabel: 'Visa ending 1234' })).body;
    expect(market).toMatchObject({ title: 'Market', amountMinor: 4000, currency: 'EUR', spentOn: '2026-10-05', category: 'groceries' });
    expect(market).not.toHaveProperty('split');
    await owner.call('POST', `/spaces/${home.id}/expenses`, { title: 'Diner', amountMinor: 2500, currency: 'USD', spentOn: '2026-10-07', category: 'eating out' });
    expect(
      (
        await owner.call('POST', `/spaces/${home.id}/expenses/import`, {
          expenses: [
            { title: 'Corner shop', amountMinor: 1500, currency: 'EUR', spentOn: '2026-10-20', category: 'groceries' },
            { title: 'Train', amountMinor: 900, currency: 'EUR', spentOn: '2026-11-02', category: 'transport' },
          ],
        })
      ).body,
    ).toEqual({ added: 2 });
    expect((await owner.call('POST', `/spaces/${home.id}/expenses/import`, { expenses: [] })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${flat.id}/expenses/import`, { expenses: [groceries] })).status).toBe(403);

    expect((await owner.call('PUT', `/spaces/${home.id}/budgets/yachts`, { amountMinor: 100, currency: 'EUR' })).status).toBe(400);
    expect((await partner.call('PUT', `/spaces/${home.id}/budgets/groceries`, { amountMinor: 30000, currency: 'EUR' })).status).toBe(404);
    expect((await owner.call('PUT', `/spaces/${flat.id}/budgets/groceries`, { amountMinor: 30000, currency: 'EUR' })).status).toBe(403);
    expect((await owner.call('PUT', `/spaces/${home.id}/budgets/groceries`, { amountMinor: 30000, currency: 'EUR' })).body).toEqual({ category: 'groceries', amountMinor: 30000, currency: 'EUR' });
    await owner.call('PUT', `/spaces/${home.id}/budgets/health`, { amountMinor: 5000, currency: 'EUR' });
    await owner.call('POST', `/spaces/${home.id}/subscriptions`, { name: 'Internet', amountMinor: 3000, currency: 'EUR', repeatRule: 'FREQ=MONTHLY', startDate: '2026-09-15' });

    const october = (await owner.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).body;
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
    expect((await owner.call('GET', `/spaces/${home.id}/spending?month=2026-13`)).status).toBe(400);
    expect((await outsider.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).status).toBe(404);
    expect((await partner.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).status).toBe(404);
    expect((await partner.call('GET', `/spaces/${flat.id}/spending?month=2026-10`)).status).toBe(403);

    expect((await partner.call('PATCH', `/expenses/${market.id}`, { amountMinor: 1 })).status).toBe(404);
    expect((await owner.call('PATCH', `/expenses/${market.id}`, { amountMinor: 4200, note: 'Plus flowers' })).body).toMatchObject({ amountMinor: 4200, note: 'Plus flowers' });
    expect((await owner.call('PUT', `/expenses/${market.id}/split`, { payerId: owner.id, shares: [{ userId: owner.id, weight: 1 }, { userId: partner.id, weight: 1 }] })).status).toBe(404);
    expect((await partner.call('GET', `/spaces/${flat.id}/balances?month=2026-10`)).status).toBe(404);

    expect((await owner.call('DELETE', `/spaces/${home.id}/budgets/health`)).status).toBe(204);
    expect((await owner.call('DELETE', `/spaces/${home.id}/budgets/health`)).status).toBe(404);
    expect((await owner.call('POST', `/items/${market.id}/trash`)).status).toBe(204);
    expect((await owner.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).body.spentMinor).toBe(2000 + 1500);
  });

  it('keeps account balances from spending, income, refunds and transfers, and leaves transfers out of the month', async () => {
    await strata.prisma.exchangeRate.upsert({ where: { currency_publishedOn: { currency: 'EGP', publishedOn: new Date('2100-01-01') } }, create: { currency: 'EGP', perEuro: 50, publishedOn: new Date('2100-01-01') }, update: { perEuro: 50 } });
    const owner = await member('account-keeper');
    const viewer = await member('account-peeker');
    const outsider = await member('account-stranger');
    const home = { id: owner.personalSpaceId };
    const shared = (await owner.call('POST', '/spaces', { name: 'Home money' })).body;
    await strata.join(shared.id, viewer, SpaceRole.EDITOR);
    expect((await owner.call('POST', `/spaces/${shared.id}/accounts`, { name: 'Joint', currency: 'EGP' })).status).toBe(403);
    expect((await viewer.call('GET', `/spaces/${shared.id}/accounts`)).status).toBe(403);
    const elsewhereId = (await outsider.call('POST', `/spaces/${outsider.personalSpaceId}/accounts`, { name: 'Far bank', currency: 'EGP' })).body.id;

    expect((await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP', cardDigits: ['12345'] })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP', kind: 'vault' })).status).toBe(400);
    expect((await viewer.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP' })).status).toBe(404);
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'egp', cardDigits: ['1234', '1234', '5678'], senders: ['CIB'], balanceMinor: 1_000_000 })).body;
    expect(bank).toMatchObject({ name: 'CIB', kind: 'bank_current', currency: 'EGP', cardDigits: ['1234', '5678'], senders: ['CIB'], balanceMinor: 1_000_000, missing: [] });
    expect((await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Wallet', kind: 'wallet', currency: 'EGP', fundedByAccountId: elsewhereId })).status).toBe(400);
    const wallet = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Vodafone Cash', kind: 'wallet', currency: 'EGP', institution: 'Vodafone', handle: '01012345678', fundedByAccountId: bank.id })).body;
    expect(wallet).toMatchObject({ institution: 'Vodafone', handle: '01012345678', fundedByAccountId: bank.id, archivedAt: null, cardDigits: [] });
    expect((await owner.call('PATCH', `/accounts/${wallet.id}`, { fundedByAccountId: wallet.id })).status).toBe(400);
    const card = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Travel card', kind: 'credit_card', currency: 'EUR', creditLimitMinor: 100_000 })).body;
    const elsewhere = { id: elsewhereId };

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

    const balances = Object.fromEntries((await owner.call('GET', `/spaces/${home.id}/accounts`)).body.map((account: { name: string; balanceMinor: number }) => [account.name, account.balanceMinor]));
    expect(balances).toEqual({ CIB: 1_000_000 - 250_000 + 50_000 + 3_000_000 - 200_000, 'Vodafone Cash': 200_000 - 30_000, 'Travel card': -4000 });
    expect((await outsider.call('GET', `/spaces/${home.id}/accounts`)).status).toBe(404);

    const month = (await owner.call('GET', `/spaces/${home.id}/spending?month=2026-10`)).body;
    expect(month).toMatchObject({ currency: 'EGP', spentMinor: 250_000 - 50_000 + 200_000 + 30_000, receivedMinor: 3_000_000 });
    expect(month.categories).toEqual([
      { category: 'groceries', spentMinor: 200_000, budgetMinor: null, carriedMinor: 0, committedMinor: 0, pace: null },
      { category: 'eating out', spentMinor: 200_000, budgetMinor: null, carriedMinor: 0, committedMinor: 0, pace: null },
      { category: 'transport', spentMinor: 30_000, budgetMinor: null, carriedMinor: 0, committedMinor: 0, pace: null },
    ]);

    expect((await owner.call('PATCH', `/expenses/${groceries.id}`, { direction: 'transfer' })).status).toBe(400);
    expect((await owner.call('PATCH', `/expenses/${groceries.id}`, { direction: 'transfer', toAccountId: wallet.id })).body).toMatchObject({ direction: 'transfer', toAccountId: wallet.id });
    expect((await owner.call('PATCH', `/expenses/${groceries.id}`, { direction: 'spent' })).body).toMatchObject({ direction: 'spent', toAccountId: null });

    expect((await owner.call('PATCH', `/accounts/${bank.id}`, { balanceMinor: 500_000 })).body.balanceMinor).toBe(500_000);
    expect(await strata.prisma.accountBalance.findMany({ where: { accountId: bank.id }, orderBy: { recordedAt: 'asc' }, select: { balanceMinor: true, source: true } })).toEqual([
      { balanceMinor: 1_000_000n, source: 'manual' },
      { balanceMinor: 500_000n, source: 'manual' },
    ]);
    expect((await owner.call('PATCH', `/accounts/${bank.id}`, { cardDigits: ['5678', '4321'], archived: true })).body).toMatchObject({ cardDigits: ['5678', '4321'], archivedAt: expect.any(String) });
    expect((await owner.call('GET', `/expenses/${groceries.id}`)).body).toMatchObject({ kind: 'purchase', status: 'posted', cardId: null });
    expect((await viewer.call('PATCH', `/accounts/${bank.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await owner.call('DELETE', `/accounts/${wallet.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/expenses/${groceries.id}`)).body.accountId).toBe(bank.id);
    expect((await owner.call('GET', `/spaces/${home.id}/accounts`)).body.map((account: { name: string }) => account.name)).toEqual(['CIB', 'Travel card']);
  });

  it('edits the cards of an account and reconciles its balance with a history row', async () => {
    const owner = await member('card-keeper');
    const stranger = await member('card-stranger');
    const home = { id: owner.personalSpaceId };
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'NBE', currency: 'EGP', balanceMinor: 100_000 })).body;
    const coffee = (await owner.call('POST', `/spaces/${home.id}/expenses`, { title: 'Coffee', amountMinor: 5000, currency: 'EGP', spentOn: '2026-10-10', category: 'eating out', accountId: bank.id, cardDigits: '4512' })).body;
    expect(coffee.cardId).toBeNull();

    expect((await owner.call('POST', `/accounts/${bank.id}/cards`, { last4: '451' })).status).toBe(400);
    expect((await owner.call('POST', `/accounts/${bank.id}/cards`, { last4: '4512', network: 'amex' })).status).toBe(400);
    expect((await stranger.call('POST', `/accounts/${bank.id}/cards`, { last4: '4512' })).status).toBe(404);
    const debit = (await owner.call('POST', `/accounts/${bank.id}/cards`, { last4: '4512', network: 'meeza', label: ' Daily ' })).body;
    expect(debit).toMatchObject({ last4: '4512', network: 'meeza', kind: 'debit', label: 'Daily' });
    expect((await owner.call('POST', `/accounts/${bank.id}/cards`, { last4: '4512' })).status).toBe(409);
    expect((await owner.call('GET', `/expenses/${coffee.id}`)).body.cardId).toBe(debit.id);

    expect((await stranger.call('PATCH', `/cards/${debit.id}`, { label: 'Mine' })).status).toBe(404);
    expect((await owner.call('PATCH', `/cards/${debit.id}`, { last4: '9876', kind: 'virtual', network: null, label: '' })).body).toMatchObject({ last4: '9876', kind: 'virtual', network: null, label: null });
    expect((await owner.call('GET', `/expenses/${coffee.id}`)).body).toMatchObject({ cardId: debit.id, cardDigits: '9876' });
    expect((await owner.call('GET', `/spaces/${home.id}/accounts`)).body[0]).toMatchObject({ cardDigits: ['9876'], cards: [{ id: debit.id, last4: '9876', kind: 'virtual' }] });
    expect((await owner.call('DELETE', `/cards/${debit.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/expenses/${coffee.id}`)).body).toMatchObject({ cardId: null, cardDigits: '9876' });

    expect((await stranger.call('POST', `/accounts/${bank.id}/reconcile`, { balanceMinor: 0 })).status).toBe(404);
    const reconciled = (await owner.call('POST', `/accounts/${bank.id}/reconcile`, { balanceMinor: 120_000 })).body;
    expect(reconciled).toMatchObject({ differenceMinor: 120_000 - 95_000, account: { balanceMinor: 120_000 } });
    expect(reconciled.account.history.map((point: { balanceMinor: number; source: string }) => [point.balanceMinor, point.source])).toEqual([
      [100_000, 'manual'],
      [120_000, 'reconcile'],
    ]);
  });

  it('lists card endings seen only on transactions and forgets them', async () => {
    const owner = await member('card-spotter');
    const stranger = await member('card-snoop');
    const home = { id: owner.personalSpaceId };
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP' })).body;
    const paid = (spentOn: string, cardDigits: string, accountId: string | null = null) =>
      owner.call('POST', `/spaces/${home.id}/expenses`, { title: 'Shop', amountMinor: 1000, currency: 'EGP', spentOn, category: 'groceries', accountId, cardDigits });
    await paid('2026-10-01', '1111');
    await paid('2026-10-09', '1111', bank.id);
    await paid('2026-10-05', '2222');
    const saved = (await paid('2026-10-07', '3333', bank.id)).body;
    await owner.call('POST', `/accounts/${bank.id}/cards`, { last4: '3333' });

    expect((await stranger.call('GET', `/spaces/${home.id}/cards/seen`)).status).toBe(404);
    expect((await owner.call('GET', `/spaces/${home.id}/cards/seen`)).body).toEqual([
      { digits: '1111', accountId: bank.id, transactions: 2, lastSpentOn: '2026-10-09' },
      { digits: '2222', accountId: null, transactions: 1, lastSpentOn: '2026-10-05' },
    ]);

    expect((await owner.call('DELETE', `/spaces/${home.id}/cards/seen/12`)).status).toBe(400);
    expect((await owner.call('DELETE', `/spaces/${home.id}/cards/seen/3333`)).status).toBe(409);
    expect((await stranger.call('DELETE', `/spaces/${home.id}/cards/seen/1111`)).status).toBe(404);
    expect((await owner.call('DELETE', `/spaces/${home.id}/cards/seen/1111`)).status).toBe(204);
    expect((await owner.call('GET', `/spaces/${home.id}/cards/seen`)).body.map((card: { digits: string }) => card.digits)).toEqual(['2222']);
    expect((await owner.call('GET', `/spaces/${home.id}/cards`)).body.map((card: { digits: string }) => card.digits).sort()).toEqual(['2222', '3333']);
    expect((await owner.call('GET', `/expenses/${saved.id}`)).body.cardDigits).toBe('3333');
  });

  it('lets a space rename, recolour, add and remove spending categories without losing expenses', async () => {
    const owner = await member('categoriser');
    const viewer = await member('category-watcher');
    const home = { id: owner.personalSpaceId };
    expect((await viewer.call('GET', `/spaces/${home.id}/spending-categories`)).status).toBe(404);
    const defaults = (await owner.call('GET', `/spaces/${home.id}/spending-categories`)).body;
    expect(defaults).toHaveLength(15);
    expect(defaults[0]).toEqual({ name: 'groceries', colour: 'green', icon: 'checklist', kind: 'expense', uses: 0 });
    expect(defaults.filter((category: { kind: string }) => category.kind === 'income').map((category: { name: string }) => category.name)).toEqual(['salary', 'refund', 'other income']);

    const base = { currency: 'EGP', spentOn: '2026-10-10' };
    const market = (await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Market', amountMinor: 100, category: 'groceries' })).body;
    const cinema = (await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Cinema', amountMinor: 200, category: 'entertainment' })).body;
    const used = (await owner.call('GET', `/spaces/${home.id}/spending-categories`)).body;
    expect(used.filter((category: { uses: number }) => category.uses > 0)).toEqual([
      { name: 'groceries', colour: 'green', icon: 'checklist', kind: 'expense', uses: 1 },
      { name: 'entertainment', colour: 'teal', icon: 'gamepad', kind: 'expense', uses: 1 },
    ]);
    await owner.call('PUT', `/spaces/${home.id}/budgets/groceries`, { amountMinor: 5000, currency: 'EGP' });
    await owner.call('PUT', `/spaces/${home.id}/budgets/entertainment`, { amountMinor: 3000, currency: 'EGP' });
    expect((await owner.call('POST', `/spaces/${home.id}/expenses`, { ...base, title: 'Gym', amountMinor: 300, category: 'fitness' })).status).toBe(400);

    const save = (who: typeof owner, categories: object[]) => who.call('PUT', `/spaces/${home.id}/spending-categories`, { categories });
    expect((await save(viewer, [{ name: 'other', colour: 'gray' }])).status).toBe(404);
    expect((await save(owner, [{ name: 'food', colour: 'green' }])).status).toBe(400);
    expect((await save(owner, [{ name: 'food', colour: 'green' }, { name: 'Food', colour: 'red' }, { name: 'other', colour: 'gray' }])).status).toBe(400);
    expect((await save(owner, [{ name: 'food', colour: 'violet' }, { name: 'other', colour: 'gray' }])).status).toBe(400);
    const saved = await save(owner, [
      { name: 'food', colour: 'orange', previous: 'groceries' },
      { name: 'fitness', colour: 'teal' },
      { name: 'other', colour: 'gray', previous: 'other' },
    ]);
    expect(saved.body).toEqual([
      { name: 'food', colour: 'orange', icon: 'checklist', kind: 'expense' },
      { name: 'fitness', colour: 'teal', icon: null, kind: 'expense' },
      { name: 'other', colour: 'gray', icon: 'more', kind: 'expense' },
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
    const home = { id: owner.personalSpaceId };
    const plan = (body: object) => owner.call('PUT', `/spaces/${home.id}/spending-plan`, body);
    expect((await plan({ budgetMinor: null, currency: 'EGP', startDay: 25, rollover: true })).status).toBe(400);
    expect((await plan({ budgetMinor: 100_000, currency: 'EGP', startDay: 29, rollover: true })).status).toBe(400);
    expect((await viewer.call('PUT', `/spaces/${home.id}/spending-plan`, { budgetMinor: null, currency: null, startDay: 1, rollover: false })).status).toBe(404);
    expect((await plan({ budgetMinor: 100_000, currency: 'EGP', startDay: 25, rollover: true })).body).toEqual({ budgetMinor: 100_000, currency: 'EGP', startDay: 25, rollover: true });
    expect((await plan({ budgetMinor: 100_000, currency: 'EGP', rollover: true })).body.startDay).toBe(25);
    expect((await owner.call('GET', '/me')).body).toMatchObject({ monthStartDay: 25, budgetsEnabled: true });
    expect((await partner.call('GET', '/me')).body.monthStartDay).toBe(1);
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
      budgetsEnabled: true,
    });
    await owner.call('PATCH', '/me', { budgetsEnabled: false });
    expect((await owner.call('GET', `/spaces/${home.id}/spending?month=2026-08`)).body.budgetsEnabled).toBe(false);
    await owner.call('PATCH', '/me', { budgetsEnabled: true });
    expect((await partner.call('GET', `/spaces/${partner.personalSpaceId}/spending`)).body).toMatchObject({ currency: 'EGP', budgetsEnabled: true });
    expect(august.categories).toEqual([{ category: 'groceries', spentMinor: 8000, budgetMinor: 16_000, carriedMinor: 6000, committedMinor: 0, pace: null }]);

    const today = new Date().toISOString().slice(0, 10);
    const current = (await owner.call('GET', `/spaces/${home.id}/spending`)).body;
    expect(current.from <= today && today <= current.until).toBe(true);
    expect(current.safeDailyMinor).toBeGreaterThan(0);

    const alerted = await member('alert-reader');
    const shared = (await alerted.call('POST', '/spaces', { name: 'Alerts' })).body;
    await strata.join(shared.id, partner, SpaceRole.EDITOR);
    await strata.join(shared.id, viewer, SpaceRole.VIEWER);
    const settings = { budgetMinor: 10_000, currency: 'EGP', startDay: 1, rollover: false };
    expect((await alerted.call('PUT', `/spaces/${shared.id}/spending-plan`, settings)).status).toBe(403);
    await alerted.call('PUT', `/spaces/${alerted.personalSpaceId}/spending-plan`, settings);
    const spend = (title: string, amountMinor: number) =>
      alerted.call('POST', `/spaces/${alerted.personalSpaceId}/expenses`, { title, amountMinor, currency: 'EGP', spentOn: today, category: 'groceries' });
    const alerts = (who: { id: string }) =>
      strata.prisma.inboxNotification.findMany({ where: { userId: who.id, kind: 'budget_alert' }, orderBy: { createdAt: 'asc' }, select: { title: true, body: true } });
    await spend('Small shop', 7000);
    expect(await alerts(alerted)).toEqual([]);
    await spend('Bigger shop', 1500);
    expect(await alerts(alerted)).toEqual([{ title: '80% of the monthly budget used', body: expect.stringMatching(/^EGP\s85\.00 of EGP\s100\.00$/) }]);
    await spend('Treat', 2000);
    await spend('Another treat', 500);
    expect((await alerts(alerted)).map((alert) => alert.title)).toEqual(['80% of the monthly budget used', 'Over the monthly budget']);
    expect(await alerts(partner)).toEqual([]);
    expect(await alerts(viewer)).toEqual([]);
  });

  it('carries leftovers over several months, leaves paid renewals out of what is committed, projects the pace and alerts when a budget changes', async () => {
    const owner = await member('roller');
    const home = owner.personalSpaceId;
    const add = (title: string, amountMinor: number, spentOn: string, category = 'groceries') => owner.call('POST', `/spaces/${home}/expenses`, { title, amountMinor, currency: 'EGP', spentOn, category });
    await owner.call('PUT', `/spaces/${home}/spending-plan`, { budgetMinor: 100_000, currency: 'EGP', startDay: 1, rollover: true });
    await owner.call('PUT', `/spaces/${home}/budgets/groceries`, { amountMinor: 10_000, currency: 'EGP' });
    await owner.call('PUT', `/spaces/${home}/budgets/transport`, { amountMinor: 1000, currency: 'EGP' });
    await add('June market', 4000, '2026-06-10');
    await add('June taxi', 5000, '2026-06-12', 'transport');
    await add('July market', 12_000, '2026-07-10');
    await add('August market', 1000, '2026-08-10');
    for (const [name, amountMinor, startDate] of [['Netflix', 25_000, '2026-09-05'], ['Gym', 50_000, '2026-09-20']] as const) {
      await owner.call('POST', `/spaces/${home}/subscriptions`, { name, amountMinor, currency: 'EGP', repeatRule: 'FREQ=MONTHLY', startDate });
    }
    await add('NETFLIX.COM', 25_000, '2026-09-06', 'entertainment');

    const september = (await owner.call('GET', `/spaces/${home}/spending?month=2026-09`)).body;
    expect(september).toMatchObject({ carriedMinor: 91_000 + 88_000 + 99_000, budgetMinor: 100_000 + 278_000, committedMinor: 50_000, upcomingMinor: 0, pace: null });
    expect(september.categories.find((row: { category: string }) => row.category === 'groceries')).toMatchObject({ budgetMinor: 23_000, carriedMinor: 13_000 });
    expect(september.categories.find((row: { category: string }) => row.category === 'transport')).toMatchObject({ budgetMinor: 1000 + 2000, carriedMinor: 2000 });

    const planner = await member('pace-keeper');
    const own = planner.personalSpaceId;
    const today = new Date().toISOString().slice(0, 10);
    await planner.call('POST', `/spaces/${own}/expenses`, { title: 'Market', amountMinor: 40_000, currency: 'EGP', spentOn: today, category: 'groceries' });
    await planner.call('PUT', `/spaces/${own}/budgets/groceries`, { amountMinor: 10_000_000, currency: 'EGP' });
    expect(await strata.prisma.inboxNotification.count({ where: { userId: planner.id, kind: 'budget_alert' } })).toBe(0);
    await planner.call('PUT', `/spaces/${own}/spending-plan`, { budgetMinor: 30_000, currency: 'EGP', startDay: 1, rollover: false });
    expect(await strata.prisma.inboxNotification.findMany({ where: { userId: planner.id, kind: 'budget_alert' }, select: { title: true } })).toEqual([{ title: 'Over the monthly budget' }]);
    const now = (await planner.call('GET', `/spaces/${own}/spending`)).body;
    expect(now.pace).toEqual({ projectedMinor: expect.any(Number), overOn: today });
    expect(now.pace.projectedMinor).toBeGreaterThanOrEqual(40_000);
    expect(now.categories[0]).toMatchObject({ category: 'groceries', pace: { overOn: null } });
  });

  it('flags statement rows that are already recorded and links imported rows to their merchant', async () => {
    const owner = await member('statement-reader');
    const stranger = await member('statement-stranger');
    const home = owner.personalSpaceId;
    const bank = (await owner.call('POST', `/spaces/${home}/accounts`, { name: 'CIB', currency: 'EGP' })).body;
    const wallet = (await owner.call('POST', `/spaces/${home}/accounts`, { name: 'Wallet', kind: 'wallet', currency: 'EGP' })).body;
    await owner.call('POST', `/spaces/${home}/merchant-rules`, { match: 'CARREFOUR', rename: 'Carrefour', category: 'groceries' });
    const recorded = { title: 'Carrefour', amountMinor: 25_000, currency: 'EGP', spentOn: '2026-10-14', category: 'groceries', accountId: bank.id };
    await owner.call('POST', `/spaces/${home}/expenses`, recorded);
    await owner.call('POST', `/spaces/${home}/expenses`, { ...recorded, title: 'Salary', amountMinor: 900_000, direction: 'received', category: 'salary', reference: 'FT2610' });

    const rows = [
      { ...recorded, title: 'CARREFOUR MAADI', merchant: 'CARREFOUR MAADI', spentOn: '2026-10-15' },
      { ...recorded, title: 'CARREFOUR MAADI', merchant: 'CARREFOUR MAADI', spentOn: '2026-10-15' },
      { ...recorded, title: 'CARREFOUR MAADI', spentOn: '2026-10-17' },
      { ...recorded, title: 'CARREFOUR MAADI', accountId: wallet.id },
      { ...recorded, title: 'CARREFOUR MAADI', direction: 'refund' },
      { ...recorded, title: 'Payroll', amountMinor: 900_000, direction: 'received', category: 'salary', reference: 'FT2610' },
      { ...recorded, title: 'Payroll', amountMinor: 900_000, direction: 'received', category: 'salary', reference: 'FT2611', spentOn: '2026-10-28' },
    ];
    expect((await stranger.call('POST', `/spaces/${home}/expenses/import/check`, { expenses: rows })).status).toBe(404);
    expect((await owner.call('POST', `/spaces/${home}/expenses/import/check`, { expenses: rows })).body).toEqual({ duplicates: [0, 5] });

    expect((await owner.call('POST', `/spaces/${home}/expenses/import`, { expenses: [rows[1], rows[6]] })).body).toEqual({ added: 2 });
    const imported = await strata.prisma.expense.findMany({ where: { item: { spaceId: home }, source: 'import' }, orderBy: { spentOn: 'asc' }, select: { reference: true, direction: true, knownMerchant: { select: { name: true } } } });
    expect(imported).toEqual([
      { reference: null, direction: 'spent', knownMerchant: { name: 'Carrefour' } },
      { reference: 'FT2611', direction: 'received', knownMerchant: null },
    ]);
  });

  it('keeps amounts far beyond the old 32-bit limit and returns them as plain numbers', async () => {
    const owner = await member('tycoon');
    const home = owner.personalSpaceId;
    const big = 5_000_000_000_000;
    expect((await owner.call('POST', `/spaces/${home}/expenses`, { title: 'Villa', amountMinor: 10_000_000_000_001, currency: 'EGP', spentOn: '2026-10-10' })).status).toBe(400);
    const villa = (await owner.call('POST', `/spaces/${home}/expenses`, { title: 'Villa', amountMinor: big, currency: 'EGP', spentOn: '2026-10-10', category: 'housing' })).body;
    expect(villa.amountMinor).toBe(big);
    expect((await owner.call('POST', `/spaces/${home}/accounts`, { name: 'Private bank', currency: 'EGP', balanceMinor: -9_000_000_000_000 })).body.balanceMinor).toBe(-9_000_000_000_000);
    expect((await owner.call('POST', `/spaces/${home}/assets`, { name: 'Land', currency: 'EGP', valueMinor: big })).body.valueMinor).toBe(big);
    expect((await owner.call('GET', `/spaces/${home}/spending?month=2026-10`)).body.spentMinor).toBe(big);
  });

  it('adds up recent months, top merchants and days, and exports every transaction as CSV', async () => {
    const owner = await member('analyst');
    const outsider = await member('analyst-outsider');
    const home = { id: owner.personalSpaceId };
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'NBE', currency: 'EGP' })).body;
    const today = new Date().toISOString().slice(0, 10);
    const add = (body: object) => owner.call('POST', `/spaces/${home.id}/expenses`, { currency: 'EGP', spentOn: today, category: 'eating out', ...body });
    await add({ title: 'Talabat', amountMinor: 30_000, merchant: 'Talabat' });
    await add({ title: 'Talabat again', amountMinor: 20_000, merchant: 'TALABAT' });
    const lunch = (await add({ title: 'Lunch, with "friends"', amountMinor: 5000, accountId: bank.id, paymentLabel: 'Visa ending 4512', cardDigits: '4512' })).body;
    const command = (await add({ title: '=cmd()', amountMinor: 1000, category: 'other' })).body;
    const salary = (await add({ title: 'Salary', amountMinor: 900_000, direction: 'received', accountId: bank.id })).body;

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
    expect(insights.merchants[0]).toEqual({ merchantId: null, merchant: 'Talabat', count: 2, totalMinor: 50_000, averageMinor: 25_000, lastOn: today });
    expect(insights.days.find((day: { day: string }) => day.day === today).spentMinor).toBe(56_000);
    expect(insights.days[0].day).toBe(insights.periods.at(-1).from);

    const response = await fetch(`${strata.base}/spaces/${home.id}/expenses/export`, { headers: { Authorization: `Bearer ${owner.token}` } });
    expect(response.headers.get('content-type')).toContain('text/csv');
    const lines = (await response.text()).trim().split('\r\n');
    expect(lines[0]).toBe('date,title,merchant,type,amount,currency,category,account,to account,note,card,label,source,id');
    expect(lines).toContain(`${today},"Lunch, with ""friends""",,spent,50.00,EGP,eating out,NBE,,,4512,Visa ending 4512,manual,${lunch.id}`);
    expect(lines).toContain(`${today},'=cmd(),,spent,10.00,EGP,other,,,,,,manual,${command.id}`);
    expect(lines).toContain(`${today},Salary,,received,9000.00,EGP,,NBE,,,,,manual,${salary.id}`);
    const exported = (range: string) => fetch(`${strata.base}/spaces/${home.id}/expenses/export?${range}`, { headers: { Authorization: `Bearer ${owner.token}` } });
    expect((await (await exported('from=2000-01-01&until=2000-12-31')).text()).trim().split('\r\n')).toHaveLength(1);
    expect((await (await exported(`from=${today}&until=${today}`)).text()).trim().split('\r\n')).toHaveLength(6);
    expect((await exported('from=yesterday')).status).toBe(400);
  });

  it('pages through transactions by cursor with filters, day totals, running balances and bulk changes', async () => {
    const owner = await member('ledger');
    const outsider = await member('ledger-outsider');
    const home = owner.personalSpaceId;
    const shared = (await owner.call('POST', '/spaces', { name: 'Ledger club' })).body;
    const bank = (await owner.call('POST', `/spaces/${home}/accounts`, { name: 'CIB', currency: 'EGP', balanceMinor: 100_000, cardDigits: ['4512'] })).body;
    const wallet = (await owner.call('POST', `/spaces/${home}/accounts`, { name: 'Wallet', kind: 'wallet', currency: 'EGP' })).body;
    const add = (title: string, amountMinor: number, spentOn: string, body: object = {}) =>
      owner.call('POST', `/spaces/${home}/expenses`, { title, amountMinor, currency: 'EGP', spentOn, category: 'groceries', accountId: bank.id, ...body });
    const market = (await add('Market', 4000, '2026-10-01')).body;
    const uber = (await add('Uber ride', 1500, '2026-10-02', { category: 'transport', cardDigits: '4512', note: 'airport' })).body;
    await add('Salary', 50_000, '2026-10-02', { direction: 'received' });
    await add('Top-up', 2000, '2026-10-03', { direction: 'transfer', toAccountId: wallet.id });
    const lunch = (await add('Lunch', 900, '2026-10-03', { accountId: wallet.id })).body;
    const list = async (query = '') => (await owner.call('GET', `/spaces/${home}/expenses${query}`)).body;

    expect((await outsider.call('GET', `/spaces/${home}/expenses`)).status).toBe(404);
    expect((await owner.call('GET', `/spaces/${shared.id}/expenses`)).status).toBe(403);
    expect((await owner.call('GET', `/spaces/${home}/expenses?cursor=nope`)).status).toBe(400);
    const first = await list('?limit=2');
    expect(first).toMatchObject({ currency: 'EGP', count: 5, days: [{ day: '2026-10-03', spentMinor: 900, receivedMinor: 0 }] });
    expect(first.expenses.map((expense: { title: string }) => expense.title)).toEqual(['Lunch', 'Top-up']);
    const second = await list(`?limit=2&cursor=${first.next}`);
    expect(second.count).toBeNull();
    expect(second.expenses.map((expense: { title: string }) => expense.title)).toEqual(['Salary', 'Uber ride']);
    expect(second.days).toEqual([{ day: '2026-10-02', spentMinor: 1500, receivedMinor: 50_000 }]);
    const third = await list(`?limit=2&cursor=${second.next}`);
    expect(third.expenses.map((expense: { title: string }) => expense.title)).toEqual(['Market']);
    expect(third.next).toBeNull();

    expect((await list('?q=AIRPORT')).expenses.map((expense: { id: string }) => expense.id)).toEqual([uber.id]);
    expect((await list('?card=4512')).expenses.map((expense: { id: string }) => expense.id)).toEqual([uber.id]);
    expect((await list('?direction=received')).count).toBe(1);
    expect((await list('?min=1000&max=2000')).count).toBe(2);
    expect((await list('?category=groceries')).count).toBe(2);
    const banked = await list(`?account=${bank.id}`);
    expect(banked.expenses.map((expense: { title: string; balanceMinor: number }) => [expense.title, expense.balanceMinor])).toEqual([
      ['Top-up', 142_500],
      ['Salary', 144_500],
      ['Uber ride', 94_500],
      ['Market', 96_000],
    ]);
    expect((await list()).expenses[0].balanceMinor).toBeNull();

    expect((await owner.call('PATCH', `/spaces/${home}/expenses`, { ids: [market.id] })).status).toBe(400);
    expect((await owner.call('PATCH', `/spaces/${home}/expenses`, { ids: [market.id], category: 'yachts' })).status).toBe(400);
    expect((await outsider.call('PATCH', `/spaces/${home}/expenses`, { ids: [market.id], category: 'health' })).status).toBe(404);
    expect((await owner.call('PATCH', `/spaces/${home}/expenses`, { ids: [market.id, lunch.id], category: 'health' })).body).toEqual({ updated: 2 });
    expect((await owner.call('PATCH', `/spaces/${home}/expenses`, { ids: [uber.id], accountId: wallet.id })).body).toEqual({ updated: 1 });
    expect((await owner.call('GET', `/expenses/${uber.id}`)).body).toMatchObject({ accountId: wallet.id, cardId: null, cardDigits: '4512' });
    expect((await list('?category=health')).count).toBe(2);

    expect((await outsider.call('POST', `/spaces/${home}/expenses/trash`, { ids: [market.id] })).status).toBe(404);
    expect((await owner.call('POST', `/spaces/${home}/expenses/trash`, { ids: [market.id, lunch.id] })).body).toEqual({ trashed: 2 });
    expect((await list()).count).toBe(3);
    expect((await owner.call('POST', `/spaces/${home}/expenses/restore`, { ids: [market.id, lunch.id] })).body).toEqual({ restored: 2 });
    expect((await list()).count).toBe(5);
  });
});
