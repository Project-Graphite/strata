import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';

export const ratesUrl = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const egyptRatesUrl = 'https://www.cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates';
export const egyptFallbackUrl = 'https://open.er-api.com/v6/latest/EUR';
const refreshAfterMs = 12 * 60 * 60 * 1000;

export type RateTable = Map<string, number>;

export function parseRates(xml: string) {
  const publishedOn = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  const rates = [...xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)]
    .map(([, currency, rate]) => ({ currency: currency!, perEuro: Number(rate) }))
    .filter(({ perEuro }) => Number.isFinite(perEuro) && perEuro > 0);
  if (!publishedOn || rates.length === 0) throw new Error('The ECB rates file had no rates');
  return { publishedOn, rates: [...rates, { currency: 'EUR', perEuro: 1 }] };
}

export function parseEgyptRates(html: string) {
  const day = html.match(/Rates for Date:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const euro = html.match(/>\s*Euro\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*</);
  const perEuro = euro ? (Number(euro[1]) + Number(euro[2])) / 2 : NaN;
  if (!day || !(perEuro > 0)) throw new Error('The CBE rates page had no euro rate');
  return { publishedOn: `${day[3]}-${day[2]}-${day[1]}`, rates: [{ currency: 'EGP', perEuro }] };
}

export function parseOpenRates(json: string) {
  const feed = JSON.parse(json) as { result?: string; time_last_update_unix?: number; rates?: Record<string, number> };
  const perEuro = feed.rates?.EGP ?? NaN;
  if (feed.result !== 'success' || !feed.time_last_update_unix || !(perEuro > 0)) throw new Error('The open.er-api.com feed had no Egyptian pound rate');
  return { publishedOn: dateText(new Date(feed.time_last_update_unix * 1000)), rates: [{ currency: 'EGP', perEuro }] };
}

type Feed = { name: string; url: string; headers: Record<string, string>; read: typeof parseRates };

const sources: { marker: string; feeds: Feed[] }[] = [
  { marker: 'EUR', feeds: [{ name: 'ECB', url: ratesUrl, headers: {}, read: parseRates }] },
  {
    marker: 'EGP',
    feeds: [
      {
        name: 'CBE',
        url: egyptRatesUrl,
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
        read: parseEgyptRates,
      },
      { name: 'open.er-api.com', url: egyptFallbackUrl, headers: {}, read: parseOpenRates },
    ],
  },
];

export const ratesSourcesOf = (sources: Map<string, string>, currencies: string[]) =>
  [...new Set(currencies.filter((currency) => currency !== 'EUR').map((currency) => sources.get(currency) ?? 'ECB'))].sort();

export function fractionDigits(currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function convertMinor(amountMinor: number, from: string, to: string, rates: RateTable) {
  const fromRate = rates.get(from);
  const toRate = rates.get(to);
  if (fromRate === undefined || toRate === undefined) return null;
  const major = amountMinor / 10 ** fractionDigits(from);
  return Math.round((major / fromRate) * toRate * 10 ** fractionDigits(to));
}

@Injectable()
export class ExchangeRatesService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceScheduler,
  ) {}

  onModuleInit() {
    this.maintenance.register((now) => this.refresh(now));
  }

  async refresh(now: Date) {
    for (const source of sources) await this.refreshFrom(source, now);
  }

  private async refreshFrom({ marker, feeds }: (typeof sources)[number], now: Date) {
    const latest = await this.prisma.exchangeRate.findFirst({ where: { currency: marker }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
    if (latest && now.getTime() - latest.updatedAt.getTime() < refreshAfterMs) return;
    for (const feed of feeds) {
      const read = await this.readFeed(feed);
      if (!read) continue;
      await this.prisma.$transaction(
        read.rates.map(({ currency, perEuro }) => {
          const publishedOn = dateValue(read.publishedOn);
          return this.prisma.exchangeRate.upsert({
            where: { currency_publishedOn: { currency, publishedOn } },
            create: { currency, perEuro, publishedOn, source: feed.name },
            update: { perEuro, source: feed.name },
          });
        }),
      );
      return;
    }
    this.logger.warn(`Could not refresh the ${marker} rates from ${feeds.map((feed) => feed.name).join(' or ')}; trying again on the next run`);
  }

  private async readFeed({ name, url, headers, read }: Feed) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).catch((error: Error) => error);
    if (response instanceof Error || !response.ok) {
      this.logger.warn(`Could not reach the ${name} rates`);
      return null;
    }
    try {
      return read(await response.text());
    } catch (error) {
      this.logger.warn(`Could not read the ${name} rates: ${(error as Error).message}`);
      return null;
    }
  }

  async table() {
    const rows = await this.prisma.$queryRaw<{ currency: string; perEuro: number; publishedOn: Date; source: string }[]>`
      SELECT DISTINCT ON (currency) currency, per_euro AS "perEuro", published_on AS "publishedOn", source
      FROM exchange_rates
      ORDER BY currency, published_on DESC`;
    return {
      rates: new Map(rows.map((row) => [row.currency, row.perEuro])) as RateTable,
      sources: new Map(rows.map((row) => [row.currency, row.source])),
      publishedOn: rows.length ? dateText(new Date(Math.max(...rows.map((row) => row.publishedOn.getTime())))) : null,
    };
  }
}
