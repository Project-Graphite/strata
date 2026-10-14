import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';

export const ratesUrl = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const egyptRatesUrl = 'https://www.cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates';
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

const sources: { name: string; url: string; headers: Record<string, string>; read: typeof parseRates; marker: string }[] = [
  { name: 'ECB', url: ratesUrl, headers: {}, read: parseRates, marker: 'EUR' },
  {
    name: 'CBE',
    url: egyptRatesUrl,
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
    read: parseEgyptRates,
    marker: 'EGP',
  },
];

function fractionDigits(currency: string) {
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

  private async refreshFrom({ name, url, headers, read, marker }: (typeof sources)[number], now: Date) {
    const latest = await this.prisma.exchangeRate.findUnique({ where: { currency: marker }, select: { updatedAt: true } });
    if (latest && now.getTime() - latest.updatedAt.getTime() < refreshAfterMs) return;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).catch((error: Error) => error);
    if (response instanceof Error || !response.ok) {
      this.logger.warn(`Could not reach the ${name} rates; trying again on the next run`);
      return;
    }
    const { publishedOn, rates } = read(await response.text());
    await this.prisma.$transaction(
      rates.map(({ currency, perEuro }) =>
        this.prisma.exchangeRate.upsert({
          where: { currency },
          create: { currency, perEuro, publishedOn: dateValue(publishedOn) },
          update: { perEuro, publishedOn: dateValue(publishedOn) },
        }),
      ),
    );
  }

  async table() {
    const rows = await this.prisma.exchangeRate.findMany({ orderBy: { currency: 'asc' } });
    return {
      rates: new Map(rows.map((row) => [row.currency, row.perEuro])) as RateTable,
      publishedOn: rows.length ? dateText(new Date(Math.max(...rows.map((row) => row.publishedOn.getTime())))) : null,
    };
  }
}
