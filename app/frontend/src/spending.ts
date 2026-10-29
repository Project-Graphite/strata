import type { TagColor } from '@project-graphite/ui';
import { useResource, type LiveOptions } from './useResource';

export interface SpendingCategory {
  name: string;
  colour: TagColor;
  icon: string | null;
  kind: 'expense' | 'income';
  uses?: number;
}

export const expenseCategories = (categories: SpendingCategory[] | undefined) => (categories ?? []).filter((category) => category.kind !== 'income');

export const mostUsedCategory = (categories: SpendingCategory[]) => [...categories].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))[0]?.name ?? 'other';

export interface MerchantRule {
  id: string;
  match: string;
  rename: string | null;
  category: string | null;
  ignore: boolean;
}

export interface SenderRule {
  id: string;
  sender: string;
  accountId: string | null;
  cardDigits: string | null;
  toAccountId: string | null;
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
  institution: string | null;
  cardDigits: string[];
  senders: string[];
  creditLimitMinor: number | null;
  dueDay: number | null;
  balanceMinor: number;
  missing: string[];
  archivedAt: string | null;
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

export type ExpenseKind = 'purchase' | 'atm' | 'fee' | 'bill' | 'transfer' | 'card_payment' | 'installment' | 'salary' | 'refund' | 'income';

export const expenseKindOptions: { value: ExpenseKind; label: string }[] = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'bill', label: 'Bill' },
  { value: 'atm', label: 'Cash withdrawal' },
  { value: 'fee', label: 'Fee' },
  { value: 'installment', label: 'Installment' },
  { value: 'card_payment', label: 'Card payment' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'refund', label: 'Refund' },
  { value: 'salary', label: 'Salary' },
  { value: 'income', label: 'Other income' },
];

export interface Expense {
  id: string;
  spaceId: string;
  title: string;
  amountMinor: number;
  currency: string;
  spentOn: string;
  occurredAt: string | null;
  category: string;
  paymentLabel: string | null;
  note: string;
  direction: ExpenseDirection;
  kind: ExpenseKind;
  status: 'pending' | 'posted';
  merchant: string | null;
  source: 'manual' | 'import' | 'sms';
  reference: string | null;
  accountId: string | null;
  toAccountId: string | null;
  cardId: string | null;
  cardDigits: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionsPage {
  currency: string;
  missing: string[];
  count: number | null;
  next: string | null;
  days: { day: string; spentMinor: number; receivedMinor: number }[];
  expenses: (Expense & { balanceMinor: number | null })[];
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
    occurredOn?: string | null;
    title?: string;
    category?: string | null;
    transfer?: { expenseId: string; fromAccountId: string; toAccountId: string } | null;
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
  budgetsEnabled: boolean;
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

export const spendingLive: LiveOptions = { live: ['spending', 'items'] };

export function useCategories(spaceId: string | null | undefined) {
  return useResource<SpendingCategory[]>(spaceId ? `/spaces/${spaceId}/spending-categories` : null, true, spendingLive);
}

export const categoryName = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

