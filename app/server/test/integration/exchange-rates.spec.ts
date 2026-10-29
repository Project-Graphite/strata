import { afterEach, describe, expect, it, vi } from 'vitest';
import { egyptFallbackUrl, egyptRatesUrl, ExchangeRatesService, ratesUrl } from '../../src/exchange-rates/exchange-rates.service';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
import { integrationApp } from './harness';

const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-05'>
  <Cube currency='USD' rate='1.25'/><Cube currency='GBP' rate='0.85'/>
</Cube></Cube></gesmes:Envelope>`;
const html = `Rates for Date: 04/10/2026 <tr><td>Euro</td><td>60.0000</td><td>60.2000</td></tr>`;

describe('Home currency totals against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;
  const realFetch = globalThis.fetch;

  afterEach(() => vi.restoreAllMocks());

  it('refreshes the ECB and CBE rates at most twice a day and converts totals into the home currency', async () => {
    const owner = await member('converter');
    const maintenance = strata.service(MaintenanceScheduler) as unknown as { running: boolean };
    await vi.waitFor(() => expect(maintenance.running).toBe(false), { timeout: 15_000 });
    await strata.prisma.exchangeRate.deleteMany();
    const ecb = vi.fn(() => Promise.resolve(new Response(xml, { status: 200 })));
    const cbe = vi.fn(() => Promise.resolve(new Response(html, { status: 200 })));
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input) === ratesUrl ? ecb() : String(input) === egyptRatesUrl ? cbe() : realFetch(input, init),
    );
    const rates = strata.service(ExchangeRatesService);
    const later = () => new Date(Date.now() + 13 * 60 * 60 * 1000);

    await rates.refresh(later());
    await rates.refresh(new Date());
    expect(ecb).toHaveBeenCalledTimes(1);
    expect(cbe).toHaveBeenCalledTimes(1);
    await rates.refresh(later());
    expect(ecb).toHaveBeenCalledTimes(2);
    expect(cbe).toHaveBeenCalledTimes(2);
    const listed = (await owner.call('GET', '/exchange-rates')).body;
    expect(listed.publishedOn).toBe('2026-10-05');
    expect(listed.currencies).toEqual(expect.arrayContaining(['EGP', 'EUR', 'GBP', 'USD']));

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
      ratesFrom: ['ECB'],
      missing: ['XAU'],
    });

    expect((await owner.call('PATCH', '/me', { homeCurrency: 'EGP' })).body.homeCurrency).toBe('EGP');
    expect((await owner.call('GET', '/subscriptions/summary')).body.home).toMatchObject({ currency: 'EGP', yearlyMinor: 120_200, ratesFrom: ['CBE', 'ECB'], missing: ['XAU'] });

    expect((await owner.call('PATCH', '/me', { homeCurrency: null })).body.homeCurrency).toBeNull();
  });

  it('falls back to open.er-api.com for the pound when the CBE page fails, and keeps a rate per day', async () => {
    const maintenance = strata.service(MaintenanceScheduler) as unknown as { running: boolean };
    await vi.waitFor(() => expect(maintenance.running).toBe(false), { timeout: 15_000 });
    await strata.prisma.exchangeRate.deleteMany();
    let updated = Date.parse('2026-10-14T00:00:01Z') / 1000;
    const fallback = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ result: 'success', time_last_update_unix: updated, rates: { EGP: 59.5 } }), { status: 200 })));
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input) === ratesUrl
        ? Promise.resolve(new Response(xml, { status: 200 }))
        : String(input) === egyptRatesUrl
          ? Promise.resolve(new Response('The requested URL was rejected.', { status: 200 }))
          : String(input) === egyptFallbackUrl
            ? fallback()
            : realFetch(input, init),
    );
    const rates = strata.service(ExchangeRatesService);
    await rates.refresh(new Date(Date.now() + 13 * 60 * 60 * 1000));
    updated += 86_400;
    await rates.refresh(new Date(Date.now() + 26 * 60 * 60 * 1000));
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(await strata.prisma.exchangeRate.findMany({ where: { currency: 'EGP' }, orderBy: { publishedOn: 'asc' }, select: { publishedOn: true, source: true } })).toEqual([
      { publishedOn: new Date('2026-10-14'), source: 'open.er-api.com' },
      { publishedOn: new Date('2026-10-15'), source: 'open.er-api.com' },
    ]);
    const table = await rates.table();
    expect(table.rates.get('EGP')).toBe(59.5);
    expect(table.sources.get('EGP')).toBe('open.er-api.com');
    expect(table.sources.get('USD')).toBe('ECB');
  });
});
