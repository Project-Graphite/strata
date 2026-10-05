import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';

export const ratesUrl = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
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
    const latest = await this.prisma.exchangeRate.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
    if (latest && now.getTime() - latest.updatedAt.getTime() < refreshAfterMs) return;
    const response = await fetch(ratesUrl, { signal: AbortSignal.timeout(10_000) }).catch((error: Error) => error);
    if (response instanceof Error || !response.ok) {
      this.logger.warn('Could not reach the ECB rates; trying again on the next run');
      return;
    }
    const { publishedOn, rates } = parseRates(await response.text());
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
      publishedOn: rows[0] ? dateText(rows[0].publishedOn) : null,
    };
  }
}
