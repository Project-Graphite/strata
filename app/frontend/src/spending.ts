import type { CostSplit } from './subscriptions';

export const spendingCategories = [
  'groceries',
  'eating out',
  'transport',
  'housing',
  'utilities',
  'health',
  'shopping',
  'entertainment',
  'travel',
  'gifts',
  'education',
  'other',
] as const;

export type SpendingCategory = (typeof spendingCategories)[number];

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
  category: SpendingCategory;
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

export interface SpendingMonth {
  month: string;
  currency: string;
  ratesOn: string | null;
  missing: string[];
  spentMinor: number;
  receivedMinor: number;
  budgetMinor: number | null;
  committedMinor: number;
  categories: { category: SpendingCategory; spentMinor: number; budgetMinor: number | null }[];
  budgets: { category: SpendingCategory; amountMinor: number; currency: string }[];
  expenses: Expense[];
}

export const categoryOptions = spendingCategories.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

export const categoryName = (category: string) => categoryOptions.find((option) => option.value === category)?.label ?? category;
