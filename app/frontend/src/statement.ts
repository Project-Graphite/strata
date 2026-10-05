import { catalogue } from './catalogue';

export interface StatementColumns {
  date: number;
  description: number;
  amount: number;
}

export type DateOrder = 'ymd' | 'dmy' | 'mdy';

export interface Charge {
  date: string;
  description: string;
  amount: number;
}

export interface Suggestion {
  key: string;
  name: string;
  amount: number;
  repeatRule: string;
  lastDate: string;
  count: number;
  category: string;
  cancelUrl: string | null;
}

export function parseCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce((best, candidate) => (firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const datePattern = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/;

export function dateOrder(values: string[]): DateOrder {
  const parts = values.map((value) => datePattern.exec(value)).filter((match) => match !== null);
  if (parts.some((match) => match[1]!.length === 4)) return 'ymd';
  if (parts.some((match) => Number(match[2]) > 12)) return 'mdy';
  return 'dmy';
}

export function parseDate(value: string, order: DateOrder) {
  const match = datePattern.exec(value);
  if (!match) return null;
  const [first, second, third] = [match[1]!, match[2]!, match[3]!].map(Number) as [number, number, number];
  const [year, month, day] = order === 'ymd' ? [first, second, third] : order === 'dmy' ? [third, second, first] : [third, first, second];
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function parseAmount(value: string) {
  const negative = /^\(.*\)$/.test(value.trim()) || /-\s*[\d.,]+|[\d.,]+\s*-$/.test(value);
  const digits = value.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return null;
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const decimal = lastDot > lastComma ? '.' : lastComma > -1 && digits.length - lastComma - 1 <= 2 ? ',' : '.';
  const normalised = digits.replace(decimal === '.' ? /,/g : /\./g, '').replace(',', '.');
  const amount = Number(normalised);
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

export function guessColumns(rows: string[][]): StatementColumns {
  const [header = [], ...body] = rows;
  const sample = body.slice(0, 20);
  const column = (pattern: RegExp, fits: (value: string) => boolean) => {
    const named = header.findIndex((title) => pattern.test(title));
    if (named > -1) return named;
    return header.findIndex((_title, index) => sample.length > 0 && sample.every((row) => fits(row[index] ?? '')));
  };
  const date = column(/date|booked|posted|datum/i, (value) => datePattern.test(value));
  const amount = column(/amount|^value$|debit|withdrawal|betrag|montant/i, (value) => parseAmount(value) !== null && !datePattern.test(value));
  const description = column(/description|payee|merchant|details|narrative|counterparty|name|memo|reference|beschreibung|libell/i, (value) => /[a-z]{3}/i.test(value));
  return { date: Math.max(date, 0), description: Math.max(description, 0), amount: Math.max(amount, 0) };
}

export function readCharges(rows: string[][], columns: StatementColumns, order: DateOrder): Charge[] {
  const entries = rows
    .slice(1)
    .map((row) => ({ date: parseDate(row[columns.date] ?? '', order), description: row[columns.description] ?? '', amount: parseAmount(row[columns.amount] ?? '') }))
    .filter((entry): entry is Charge => entry.date !== null && entry.amount !== null && entry.amount !== 0 && entry.description !== '');
  const outgoing = entries.some((entry) => entry.amount < 0) ? entries.filter((entry) => entry.amount < 0) : entries;
  return outgoing.map((entry) => ({ ...entry, amount: Math.abs(entry.amount) }));
}

const fillerWords = new Set(['card', 'payment', 'purchase', 'pos', 'debit', 'credit', 'visa', 'mastercard', 'direct', 'dd', 'sepa', 'ref', 'to', 'from', 'www', 'com', 'net', 'the', 'inc', 'ltd', 'llc']);

export function merchantKey(description: string) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .split(' ')
    .filter((word) => word && !/\d/.test(word) && !fillerWords.has(word))
    .slice(0, 2)
    .join(' ');
}

const cycles: [number, number, string][] = [
  [6, 8, 'FREQ=WEEKLY'],
  [26, 35, 'FREQ=MONTHLY'],
  [85, 96, 'FREQ=MONTHLY;INTERVAL=3'],
  [355, 376, 'FREQ=YEARLY'],
];

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const titleCase = (text: string) => text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export function suggestRecurring(charges: Charge[]): Suggestion[] {
  const groups = new Map<string, Charge[]>();
  for (const charge of charges) {
    const key = merchantKey(charge.description);
    if (key) groups.set(key, [...(groups.get(key) ?? []), charge]);
  }
  const suggestions: Suggestion[] = [];
  for (const [key, group] of groups) {
    const byDay = [...new Map(group.map((charge) => [charge.date, charge])).values()].sort((a, b) => a.date.localeCompare(b.date));
    if (byDay.length < 2) continue;
    const gaps = byDay.slice(1).map((charge, index) => (Date.parse(charge.date) - Date.parse(byDay[index]!.date)) / 86_400_000);
    const cycle = cycles.find(([low, high]) => median(gaps) >= low && median(gaps) <= high);
    if (!cycle || (byDay.length < 3 && cycle[2] !== 'FREQ=YEARLY')) continue;
    const typical = median(byDay.map((charge) => charge.amount));
    if (byDay.some((charge) => Math.abs(charge.amount - typical) > typical * 0.25)) continue;
    const last = byDay.at(-1)!;
    const known = catalogue.find((service) => merchantKey(service.name) && `${key} `.startsWith(`${merchantKey(service.name)} `));
    suggestions.push({
      key,
      name: known?.name ?? titleCase(key),
      amount: last.amount,
      repeatRule: cycle[2],
      lastDate: last.date,
      count: byDay.length,
      category: known?.category ?? 'other',
      cancelUrl: known?.cancelUrl ?? null,
    });
  }
  return suggestions.sort((a, b) => b.amount - a.amount);
}
