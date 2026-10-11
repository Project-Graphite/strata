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
  budgetMinor: number | null;
  committedMinor: number;
  categories: { category: SpendingCategory; spentMinor: number; budgetMinor: number | null }[];
  budgets: { category: SpendingCategory; amountMinor: number; currency: string }[];
  expenses: Expense[];
}

export const categoryOptions = spendingCategories.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

export const categoryName = (category: string) => categoryOptions.find((option) => option.value === category)?.label ?? category;
