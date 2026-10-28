import { useSyncExternalStore } from 'react';
import type { TagColor } from '@project-graphite/ui';
import type { CostSplit } from './subscriptions';
import { useResource } from './useResource';

export interface SpendingCategory {
  name: string;
  colour: TagColor;
  icon: string | null;
  kind: 'expense' | 'income';
  uses?: number;
}

export const expenseCategories = (categories: SpendingCategory[] | undefined) => (categories ?? []).filter((category) => category.kind !== 'income');

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

export type AccountKind = 'bank_current' | 'bank_savings' | 'credit_card' | 'prepaid' | 'wallet' | 'online' | 'bnpl' | 'loan' | 'cash' | 'investment';

export const accountKindOptions: { value: AccountKind; label: string }[] = [
  { value: 'bank_current', label: 'Bank account' },
  { value: 'bank_savings', label: 'Savings account' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'prepaid', label: 'Prepaid card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'online', label: 'Online account' },
  { value: 'bnpl', label: 'Buy now, pay later' },
  { value: 'loan', label: 'Loan' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
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
  dueDay: number | null;
  balanceMinor: number;
  missing: string[];
}

export interface KnownCard {
  digits: string;
  accountId: string | null;
}

export const paymentMethods: [string, string][] = [
  ['PayPal', 'Online'],
  ['Apple Pay', 'Online'],
  ['Google Pay', 'Online'],
  ['InstaPay', 'Online'],
  ['nSave', 'Online'],
  ['Vodafone Cash', 'Wallet'],
  ['Cash', 'In person'],
];

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
  cardDigits: string | null;
  split: CostSplit | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentPlan {
  id: string;
  spaceId: string;
  accountId: string | null;
  name: string;
  currency: string;
  monthlyMinor: number;
  count: number;
  firstDueOn: string;
  paidCount: number;
  reminderDays: number;
  totalMinor: number;
  remainingMinor: number;
  nextDueOn: string | null;
  status: 'due' | 'missed' | 'done';
}

export const assetKindOptions = [
  { value: 'gold', label: 'Gold or silver' },
  { value: 'certificate', label: 'Certificate or deposit' },
  { value: 'property', label: 'Property' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export interface Asset {
  id: string;
  spaceId: string;
  name: string;
  kind: string;
  currency: string;
  valueMinor: number;
  ratePercent: number | null;
  maturesOn: string | null;
  updatedAt: string;
}

export interface NetWorth {
  currency: string;
  missing: string[];
  accountsMinor: number;
  assetsMinor: number;
  installmentsMinor: number;
  totalMinor: number;
  assets: Asset[];
}

export interface SavingsGoal {
  id: string;
  spaceId: string;
  accountId: string | null;
  name: string;
  currency: string;
  targetMinor: number;
  savedMinor: number | null;
  dueOn: string | null;
}

export interface SpendingInsights {
  currency: string;
  missing: string[];
  periods: { month: string; from: string; until: string; spentMinor: number; receivedMinor: number; categories: { category: string; spentMinor: number }[] }[];
  merchants: { merchant: string; count: number; totalMinor: number; averageMinor: number; lastOn: string }[];
  days: { day: string; spentMinor: number }[];
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
    cardDigits: string | null;
    accountId: string | null;
    paymentLabel?: string | null;
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

export type SpendingTab = 'overview' | 'transactions' | 'accounts' | 'budgets' | 'recurring' | 'insights' | 'net-worth';

const spendingTabList: [SpendingTab, string][] = [
  ['overview', 'Overview'],
  ['transactions', 'Transactions'],
  ['accounts', 'Accounts'],
  ['budgets', 'Budgets'],
  ['recurring', 'Recurring'],
  ['insights', 'Insights'],
  ['net-worth', 'Net worth'],
];

export const spendingHref = (tab: SpendingTab, params?: URLSearchParams) => {
  const kept = new URLSearchParams([...(params ?? [])].filter(([key]) => key === 'space' || key === 'month')).toString();
  return `/spending${tab === 'overview' ? '' : `/${tab}`}${kept ? `?${kept}` : ''}`;
};

export const spendingTabs = (active: SpendingTab, params: URLSearchParams) =>
  spendingTabList.map(([key, label]) => ({ active: key === active, href: spendingHref(key, params), label }));

const byCategoryKey = 'strata-spending-by-category';
const byCategoryListeners = new Set<() => void>();
let byCategoryShown = (() => {
  try {
    return localStorage.getItem(byCategoryKey) !== 'hidden';
  } catch {
    return true;
  }
})();

const showByCategory = (shown: boolean) => {
  byCategoryShown = shown;
  try {
    localStorage.setItem(byCategoryKey, shown ? 'shown' : 'hidden');
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
  byCategoryListeners.forEach((listener) => listener());
};

export function useByCategory() {
  const shown = useSyncExternalStore(
    (listener) => {
      byCategoryListeners.add(listener);
      return () => byCategoryListeners.delete(listener);
    },
    () => byCategoryShown,
  );
  return [shown, showByCategory] as const;
}

export function useCategories(spaceId: string | null | undefined) {
  return useResource<SpendingCategory[]>(spaceId ? `/spaces/${spaceId}/spending-categories` : null, true);
}

export const categoryName = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

