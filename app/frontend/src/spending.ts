import type { TagColor } from '@project-graphite/ui';
import type { CostSplit } from './subscriptions';
import { useResource } from './useResource';

export interface SpendingCategory {
  name: string;
  colour: TagColor;
  uses?: number;
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

const spendingTabList: [SpendingTab, string, string][] = [
  ['overview', 'Overview', '/spending'],
  ['transactions', 'Transactions', '/spending?tab=transactions'],
  ['accounts', 'Accounts', '/spending?tab=accounts'],
  ['budgets', 'Budgets', '/spending?tab=budgets'],
  ['recurring', 'Recurring', '/recurring'],
  ['insights', 'Insights', '/spending/insights'],
  ['net-worth', 'Net worth', '/spending/net-worth'],
];

export type SpendingPageTab = 'overview' | 'transactions' | 'accounts' | 'budgets';

const pageTabs: SpendingTab[] = ['overview', 'transactions', 'accounts', 'budgets'];

export const spendingTabs = (active: SpendingTab, space?: string | null, pageLink?: (tab: SpendingPageTab) => string) =>
  spendingTabList.map(([key, label, href]) => ({
    active: key === active,
    href:
      pageLink && pageTabs.includes(key)
        ? pageLink(key as SpendingPageTab)
        : space && key !== 'recurring'
          ? `${href}${href.includes('?') ? '&' : '?'}space=${space}`
          : href,
    label,
  }));

export function useCategories(spaceId: string | null | undefined) {
  return useResource<SpendingCategory[]>(spaceId ? `/spaces/${spaceId}/spending-categories` : null, true);
}

export const categoryName = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

