import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExchangeRatesService, ratesUrl } from '../../src/exchange-rates/exchange-rates.service';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
import { integrationApp } from './harness';

const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-05'>
  <Cube currency='USD' rate='1.25'/><Cube currency='GBP' rate='0.85'/>
</Cube></Cube></gesmes:Envelope>`;

describe('Home currency totals against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;
  const realFetch = globalThis.fetch;

  afterEach(() => vi.restoreAllMocks());

  it('refreshes the ECB rates at most twice a day and converts totals into the home currency', async () => {
    const owner = await member('converter');
    const maintenance = strata.service(MaintenanceScheduler) as unknown as { running: boolean };
    await vi.waitFor(() => expect(maintenance.running).toBe(false), { timeout: 15_000 });
    await strata.prisma.exchangeRate.deleteMany();
    const ecb = vi.fn(() => Promise.resolve(new Response(xml, { status: 200 })));
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => (String(input) === ratesUrl ? ecb() : realFetch(input, init)));
    const rates = strata.service(ExchangeRatesService);
    const later = () => new Date(Date.now() + 13 * 60 * 60 * 1000);

    await rates.refresh(later());
    await rates.refresh(new Date());
    expect(ecb).toHaveBeenCalledTimes(1);
    await rates.refresh(later());
    expect(ecb).toHaveBeenCalledTimes(2);
    const listed = (await owner.call('GET', '/exchange-rates')).body;
    expect(listed.publishedOn).toBe('2026-10-05');
    expect(listed.currencies).toEqual(expect.arrayContaining(['EUR', 'GBP', 'USD']));

    const space = owner.personalSpaceId;
    for (const [name, amountMinor, currency] of [['Music', 1250, 'USD'], ['Video', 850, 'GBP'], ['Gym', 3000, 'XAU']] as const) {
      await owner.call('POST', `/spaces/${space}/subscriptions`, { name, amountMinor, currency, repeatRule: 'FREQ=YEARLY', startDate: '2026-01-10' });
    }
    expect((await owner.call('GET', '/subscriptions/summary')).body.home).toBeNull();

    expect((await owner.call('PATCH', '/me', { homeCurrency: 'eur' })).status).toBe(400);
    expect((await owner.call('PATCH', '/me', { homeCurrency: 'EUR' })).body.homeCurrency).toBe('EUR');
    expect((await owner.call('GET', '/subscriptions/summary')).body.home).toEqual({
      currency: 'EUR',
      yearlyMinor: 2000,
      monthlyMinor: 167,
      ratesOn: '2026-10-05',
      missing: ['XAU'],
    });

    expect((await owner.call('PATCH', '/me', { homeCurrency: null })).body.homeCurrency).toBeNull();
  });
});
