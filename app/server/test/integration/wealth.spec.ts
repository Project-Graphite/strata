import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Savings goals and net worth against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('tracks goals by hand or by account and adds up net worth from accounts, assets and installments', async () => {
    await strata.prisma.exchangeRate.upsert({ where: { currency_publishedOn: { currency: 'EGP', publishedOn: new Date('2100-01-01') } }, create: { currency: 'EGP', perEuro: 50, publishedOn: new Date('2100-01-01') }, update: { perEuro: 50 } });
    await strata.prisma.exchangeRate.upsert({ where: { currency_publishedOn: { currency: 'EUR', publishedOn: new Date('2100-01-01') } }, create: { currency: 'EUR', perEuro: 1, publishedOn: new Date('2100-01-01') }, update: { perEuro: 1 } });
    const owner = await member('saver-of-wealth');
    const viewer = await member('wealth-viewer');
    const home = { id: owner.personalSpaceId };
    const shared = (await owner.call('POST', '/spaces', { name: 'Wealth' })).body;
    await strata.join(shared.id, viewer, SpaceRole.EDITOR);
    expect((await owner.call('POST', `/spaces/${shared.id}/savings-goals`, { name: 'Car', currency: 'EGP', targetMinor: 1 })).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${shared.id}/assets`, { name: 'Gold', currency: 'EGP', valueMinor: 1 })).status).toBe(403);
    await owner.call('PATCH', '/me', { homeCurrency: 'EGP' });
    const savings = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Savings', currency: 'EGP', balanceMinor: 2_000_000 })).body;
    await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Visa', kind: 'credit_card', currency: 'EGP', balanceMinor: -300_000 });
    await owner.call('POST', `/spaces/${home.id}/installments`, { name: 'Phone', currency: 'EGP', monthlyMinor: 100_000, count: 5, firstDueOn: '2027-01-01' });

    expect((await viewer.call('POST', `/spaces/${home.id}/savings-goals`, { name: 'Car', currency: 'EGP', targetMinor: 1 })).status).toBe(404);
    const car = (await owner.call('POST', `/spaces/${home.id}/savings-goals`, { name: 'Car', currency: 'EGP', targetMinor: 50_000_000, savedMinor: 1_000_000, dueOn: '2027-06-01' })).body;
    expect(car).toEqual({ id: car.id, spaceId: home.id, accountId: null, name: 'Car', currency: 'EGP', targetMinor: 50_000_000, savedMinor: 1_000_000, dueOn: '2027-06-01' });
    expect((await owner.call('POST', `/savings-goals/${car.id}/add`, { amountMinor: 500_000 })).body.savedMinor).toBe(1_500_000);
    expect((await owner.call('POST', `/savings-goals/${car.id}/add`, { amountMinor: -2_000_000 })).status).toBe(400);
    expect((await owner.call('POST', `/savings-goals/${car.id}/add`, { amountMinor: 0 })).status).toBe(400);
    const trip = (await owner.call('POST', `/spaces/${home.id}/savings-goals`, { name: 'Trip', currency: 'EUR', targetMinor: 100_000, accountId: savings.id })).body;
    expect(trip.savedMinor).toBe(40_000);
    expect((await owner.call('POST', `/savings-goals/${trip.id}/add`, { amountMinor: 100 })).status).toBe(400);
    expect((await viewer.call('GET', `/spaces/${home.id}/savings-goals`)).status).toBe(404);
    expect((await owner.call('GET', `/spaces/${home.id}/savings-goals`)).body.map((goal: { name: string }) => goal.name)).toEqual(['Car', 'Trip']);

    expect((await owner.call('POST', `/spaces/${home.id}/assets`, { name: 'Gold', kind: 'jewels', currency: 'EGP', valueMinor: 1 })).status).toBe(400);
    const gold = (await owner.call('POST', `/spaces/${home.id}/assets`, { name: '21k gold, 20 g', kind: 'gold', currency: 'EGP', valueMinor: 8_000_000 })).body;
    await owner.call('POST', `/spaces/${home.id}/assets`, { name: 'Bank certificate', kind: 'certificate', currency: 'EGP', valueMinor: 10_000_000, ratePercent: 27, maturesOn: '2029-10-01' });
    await owner.call('POST', `/spaces/${home.id}/assets`, { name: 'Euro cash', kind: 'cash', currency: 'EUR', valueMinor: 20_000 });
    expect((await viewer.call('GET', `/spaces/${home.id}/net-worth`)).status).toBe(404);
    const worth = (await owner.call('GET', `/spaces/${home.id}/net-worth`)).body;
    expect(worth).toMatchObject({
      currency: 'EGP',
      missing: [],
      accountsMinor: 2_000_000 - 300_000,
      assetsMinor: 8_000_000 + 10_000_000 + 1_000_000,
      installmentsMinor: 500_000,
      totalMinor: 1_700_000 + 19_000_000 - 500_000,
    });
    expect(worth.assets.map((asset: { name: string }) => asset.name)).toEqual(['Bank certificate', '21k gold, 20 g', 'Euro cash']);
    expect(worth.assets[0]).toMatchObject({ kind: 'certificate', ratePercent: 27, maturesOn: '2029-10-01' });

    expect((await owner.call('PATCH', `/assets/${gold.id}`, { valueMinor: 9_000_000 })).body.valueMinor).toBe(9_000_000);
    expect((await viewer.call('DELETE', `/assets/${gold.id}`)).status).toBe(404);
    expect((await owner.call('DELETE', `/assets/${gold.id}`)).status).toBe(204);
    expect((await owner.call('DELETE', `/savings-goals/${car.id}`)).status).toBe(204);
    await owner.call('PATCH', '/me', { homeCurrency: null });
  });
});
