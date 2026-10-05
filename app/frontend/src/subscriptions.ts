export interface CostSplit {
  payerId: string;
  shares: { userId: string; weight: number }[];
}

export interface Subscription {
  id: string;
  spaceId: string;
  name: string;
  amountMinor: number;
  currency: string;
  repeatRule: string;
  startDate: string;
  nextRenewal: string;
  timeZone: string;
  trialEndsOn: string | null;
  noticeDays: number | null;
  category: string;
  paymentLabel: string | null;
  cancelUrl: string | null;
  supportUrl: string | null;
  usedBy: string | null;
  reminderDays: number | null;
  lastUsedOn: string | null;
  cancelledOn: string | null;
  split: CostSplit | null;
}

export const categories = [
  'streaming',
  'music',
  'software',
  'cloud',
  'news',
  'fitness',
  'utilities',
  'phone and internet',
  'insurance',
  'housing',
  'transport',
  'education',
  'other',
];

export const billingCycles = [
  ['FREQ=MONTHLY', 'Monthly'],
  ['FREQ=YEARLY', 'Yearly'],
  ['FREQ=WEEKLY', 'Weekly'],
  ['FREQ=MONTHLY;INTERVAL=3', 'Every three months'],
  ['FREQ=MONTHLY;INTERVAL=6', 'Every six months'],
] as const;

function fractionDigits(currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 10 ** fractionDigits(currency));
}

export function toMinor(amount: string, currency: string) {
  return Math.round(Number(amount.replace(',', '.')) * 10 ** fractionDigits(currency));
}

export function fromMinor(amountMinor: number, currency: string) {
  return (amountMinor / 10 ** fractionDigits(currency)).toFixed(fractionDigits(currency));
}

export function cycleLabel(rule: string) {
  return billingCycles.find(([value]) => value === rule)?.[1].toLowerCase() ?? 'custom cycle';
}

export function shortDate(text: string) {
  return new Date(`${text}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
