import { amountDigits, amountOf, normalise } from './bank-messages';

export interface PrivateValues {
  amounts?: (number | null | undefined)[];
  cardDigits?: (string | null | undefined)[];
  names?: (string | null | undefined)[];
}

export const sampleCard = '1234';
export const samplePhone = '01000000000';

const token = new RegExp(
  [
    String.raw`(?<phone>(?<!\d)(?:\+20|0020|0)1[0125][\dXx*]{8}(?![\dXx*]))`,
    String.raw`(?<handle>[\p{L}\p{N}._-]+@[\p{L}\p{N}.-]*[\p{L}\p{N}])`,
    String.raw`(?<date>(?<!\d)(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?)(?!\d))`,
    String.raw`(?<number>(?<![\d.,])(?:${amountDigits})(?!\d))`,
  ].join('|'),
  'gu',
);
const cardBefore = /(?:[*xX•#]|ending(?: with| in)?|ends with|card(?: no\.?| number)?|المنتهي(?:ة)? ?ب(?:ـ)?|المنتهية|رقم)\s*$/i;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rounded = (value: number) => Number(value.toFixed(10));

const sampleName = (name: string, index: number) => (/[؀-ۿ]/.test(name) ? `مثال ${'أبجدهوزحطي'[index % 10]}` : `SAMPLE ${'ABCDEFGHIJ'[index % 10]}`);

const magnitudeOf = (value: number) => rounded(10 ** Math.floor(Math.log10(value)));

function formatLike(original: string, value: number) {
  const decimals = original.includes('.') ? original.split('.')[1]!.length : 0;
  const [whole, fraction] = value.toFixed(decimals).split('.');
  const grouped = original.includes(',') ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole!;
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function anonymise(raw: string, values: PrivateValues = {}) {
  const amounts = new Map<number, number>();
  for (const value of new Set((values.amounts ?? []).filter((amount): amount is number => typeof amount === 'number' && amount > 0))) {
    const magnitude = magnitudeOf(value);
    const taken = new Set(amounts.values());
    amounts.set(value, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((step) => rounded(step * magnitude)).find((candidate) => !taken.has(candidate)) ?? magnitude);
  }
  const names = new Map<string, string>();
  for (const name of (values.names ?? []).filter((found): found is string => !!found && found.trim().length >= 3 && /\p{L}/u.test(found))) {
    const key = normalise(name).toLowerCase();
    if (!names.has(key)) names.set(key, sampleName(name, names.size));
  }
  const cards = new Set(values.cardDigits?.filter(Boolean));
  const amountFor = (value: number) => [...amounts].find(([known]) => Math.abs(known - value) < 1e-9)?.[1];

  let text = normalise(raw);
  for (const [name, sample] of [...names].sort(([a], [b]) => b.length - a.length)) text = text.replace(new RegExp(escape(name), 'giu'), sample);
  text = text.replace(token, (found: string, ...rest: unknown[]) => {
    const groups = rest.at(-1) as Record<string, string | undefined>;
    const at = rest.at(-3) as number;
    if (groups.phone) return samplePhone;
    if (groups.handle) return `sample@${found.split('@')[1]}`;
    if (groups.date) return found;
    if (/^\d{4}$/.test(found) && (cards.has(found) || cardBefore.test(text.slice(Math.max(0, at - 20), at)))) return sampleCard;
    const amount = amountFor(amountOf(found));
    if (amount !== undefined) return formatLike(found, amount);
    return found.replace(/[^\d]/g, '').length >= 6 ? found.replace(/\d/g, '0') : found;
  });

  return {
    text,
    amount: (value: number | null | undefined) => (typeof value !== 'number' || value <= 0 ? null : (amountFor(value) ?? magnitudeOf(value))),
    card: (digits: string | null | undefined) => (digits ? sampleCard : null),
    name: (name: string | null | undefined) => (name ? (names.get(normalise(name).toLowerCase()) ?? sampleName(name, names.size)) : null),
  };
}
