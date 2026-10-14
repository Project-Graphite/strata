import type { TagColor } from '@project-graphite/ui';
import type { CostSplit } from './subscriptions';
import { useResource } from './useResource';

export interface SpendingCategory {
  name: string;
  colour: TagColor;
}

export interface MerchantRule {
  id: string;
  match: string;
  rename: string | null;
  category: string | null;
  ignore: boolean;
}

export type ExpenseDirection = 'spent' | 'received' | 'refund' | 'transfer';

export const directionOptions: { value: ExpenseDirection; label: string }[] = [
  { value: 'spent', label: 'Spent' },
  { value: 'received', label: 'Received' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer between accounts' },
];

export type AccountKind = 'bank' | 'credit' | 'wallet' | 'cash';

export const accountKindOptions: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'credit', label: 'Credit card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'cash', label: 'Cash' },
];

export interface MoneyAccount {
  id: string;
  spaceId: string;
  name: string;
  kind: AccountKind;
  currency: string;
  cardDigits: string[];
  senders: string[];
  creditLimitMinor: number | null;
  balanceMinor: number;
  missing: string[];
}

export interface Expense {
  id: string;
  spaceId: string;
  title: string;
  amountMinor: number;
  currency: string;
  spentOn: string;
  category: string;
  paymentLabel: string | null;
  note: string;
  direction: ExpenseDirection;
  merchant: string | null;
  source: 'manual' | 'import' | 'sms';
  accountId: string | null;
  toAccountId: string | null;
  split: CostSplit | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapturedMessage {
  id: string;
  sender: string;
  text: string;
  receivedAt: string;
  suggestion: {
    direction: Exclude<ExpenseDirection, 'transfer'> | null;
    amountMinor: number | null;
    currency: string | null;
    merchant: string | null;
    accountId: string | null;
  };
}

export interface SpendingPlan {
  budgetMinor: number | null;
  currency: string | null;
  startDay: number;
  rollover: boolean;
}

export interface SpendingMonth {
  month: string;
  from: string;
  until: string;
  carriedMinor: number;
  safeDailyMinor: number | null;
  plan: SpendingPlan;
  currency: string;
  ratesOn: string | null;
  missing: string[];
  spentMinor: number;
  receivedMinor: number;
  budgetMinor: number | null;
  committedMinor: number;
  categories: { category: string; spentMinor: number; budgetMinor: number | null; carriedMinor: number }[];
  budgets: { category: string; amountMinor: number; currency: string }[];
  expenses: Expense[];
}

export function useCategories(spaceId: string | null | undefined) {
  return useResource<SpendingCategory[]>(spaceId ? `/spaces/${spaceId}/spending-categories` : null, true);
}

export const categoryName = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

export const categoryOptions = (categories: SpendingCategory[]) =>
  categories.map(({ name, colour }) => ({ value: name, label: categoryName(name), leading: <span aria-hidden="true" className={`swatch-dot tag-${colour}`} /> }));
