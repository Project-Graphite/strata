import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { readBlob } from '../api';
import { formatDay, ListSkeleton, Meter, Tabs, TextField, Toggle } from '@project-graphite/ui';
import { shiftMonth } from '../agenda';
import { useAuth } from '../auth';
import { AccountEditor } from '../components/AccountEditor';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { CategoriesEditor } from '../components/CategoriesEditor';
import { Empty } from '../components/Empty';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { ExpenseImport } from '../components/ExpenseImport';
import { Hint } from '../components/Hint';
import { InstallmentEditor } from '../components/InstallmentEditor';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Page, Section, Toolbar } from '../components/Page';
import { PeriodNav } from '../components/PeriodNav';
import { PhoneSetup } from '../components/PhoneSetup';
import { saveBlob } from '../files';
import { RowText } from '../components/RowText';
import { SplitEditor } from '../components/SplitEditor';
import {
  accountKindOptions,
  categoryName,
  spendingTabs,
  useCategories,
  type CapturedMessage,
  type Expense,
  type InstallmentPlan,
  type MerchantRule,
  type MoneyAccount,
  type SpendingCategory,
  type SpendingMonth,
  type SpendingPlan,
} from '../spending';
import { SpaceChooser, useChosenSpace, type Member } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { moneyAmount, required, useFormErrors } from '../validation';
import { CategoryChips } from '../components/CategoryChips';
import { CurrencyField } from '../components/CurrencyField';
import { DayOfMonthField } from '../components/DayOfMonthField';
import { MissingRates, Stat, Stats } from '../components/Stats';

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const recentCount = 5;
const chartedCount = 7;
const byCategoryKey = 'strata-spending-by-category';

const byCategoryStored = (() => {
  try {
    return localStorage.getItem(byCategoryKey) !== 'hidden';
  } catch {
    return true;
  }
})();

export function SpendingPage() {
  const auth = useAuth();
  const action = useAction();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : null;
  const tab = (['transactions', 'accounts', 'budgets'] as const).find((option) => option === params.get('tab')) ?? 'overview';
  const managing = tab === 'budgets';
  const { spaceId, space, editable } = useChosenSpace();
  const summary = useResource<SpendingMonth>(spaceId ? `/spaces/${spaceId}/spending${month ? `?month=${month}` : ''}` : null, true);
  const members = useResource<Member[]>(space?.kind === 'shared' ? `/spaces/${spaceId}/members` : null, true);
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true);
  const captures = useResource<CapturedMessage[]>(spaceId ? `/spaces/${spaceId}/captures` : null, true);
  const categories = useCategories(spaceId);
  const rules = useResource<MerchantRule[]>(spaceId ? `/spaces/${spaceId}/merchant-rules` : null, true);
  const installments = useResource<InstallmentPlan[]>(spaceId ? `/spaces/${spaceId}/installments` : null, true);
  const colourOf = (category: string) => categories.data?.find((known) => known.name === category)?.colour ?? 'gray';
  const [dialog, setDialog] = useState<
    | 'new'
    | 'import'
    | 'phone'
    | 'categories'
    | 'plan'
    | { budget: string | null }
    | { expense: Expense }
    | { split: Expense }
    | { account: MoneyAccount | null }
    | { capture: CapturedMessage }
    | { installment: InstallmentPlan | null }
  >();
  const [byCategory, setByCategory] = useState(byCategoryStored);
  const showByCategory = (shown: boolean) => {
    setByCategory(shown);
    try {
      localStorage.setItem(byCategoryKey, shown ? 'shown' : 'hidden');
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
  };
  const go = (next: Record<string, string>) => setParams((current) => ({ ...Object.fromEntries(current), ...next }));
  const shown = summary.data;
  const currency = shown?.currency ?? 'EUR';
  const accountName = (id: string | null) => accounts.data?.find((account) => account.id === id)?.name;
  const reload = () => {
    summary.reload();
    accounts.reload();
    captures.reload();
    rules.reload();
  };

  return (
    <Page
      actions={
        <>
          {spaceId && (
            <ActionsMenu
              items={[
                ...(editable
                  ? [
                      { label: 'Import a statement', onSelect: () => setDialog('import') },
                      { label: 'Connect your phone', onSelect: () => setDialog('phone') },
                      { label: 'Edit categories', onSelect: () => setDialog('categories') },
                    ]
                  : []),
                { label: byCategory ? 'Hide spending by category' : 'Show spending by category', onSelect: () => showByCategory(!byCategory) },
                {
                  label: 'Export CSV',
                  onSelect: () =>
                    void action.run(async () => {
                      saveBlob(await auth.request<Blob>(`/spaces/${spaceId}/expenses/export`, {}, readBlob), 'transactions.csv');
                      return '';
                    }, 'Could not export the transactions'),
                },
              ]}
              name="spending"
            />
          )}
          {editable && <Button icon="plus" label="Add expense" onClick={() => setDialog('new')} primary />}
        </>
      }
      beside={
        tab !== 'accounts' && (
          <PeriodNav
            current={{
              label: 'This month',
              onSelect: () =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.delete('month');
                  return next;
                }),
            }}
            disabled={!shown}
            onShift={(step) => go({ month: shiftMonth(shown!.month, step) })}
            title={
              shown &&
              (shown.plan.startDay === 1
                ? monthName.format(new Date(`${shown.month}-01T00:00:00Z`))
                : `${formatDay(shown.from, { day: 'numeric', month: 'short' })} – ${formatDay(shown.until, { day: 'numeric', month: 'short', year: 'numeric' })}`)
            }
            unit="month"
          />
        )
      }
      title="Spending"
    >
      <Tabs
        items={spendingTabs(tab, params.get('space'), (next) => {
          const query = new URLSearchParams(params);
          if (next === 'overview') query.delete('tab');
          else query.set('tab', next);
          return `/spending${query.size ? `?${query}` : ''}`;
        })}
        label="Spending"
      />
      <Toolbar actions={<SpaceChooser />} />

      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !shown ? (
        <ListSkeleton label="Adding up the month" rows={5} />
      ) : (
        <>
          {tab === 'overview' && (
            <Stats>
              <Stat label="Spent" value={money(shown.spentMinor, currency)} />
              {shown.budgetMinor !== null && (
                <>
                  <Stat
                    label="Left to spend"
                    value={
                      shown.spentMinor > shown.budgetMinor ? (
                        <span className="text-danger">{money(shown.spentMinor - shown.budgetMinor, currency)} over</span>
                      ) : (
                        money(shown.budgetMinor - shown.spentMinor, currency)
                      )
                    }
                  >
                    <Meter label="Spent of the whole budget" value={shown.budgetMinor ? shown.spentMinor / shown.budgetMinor : 1} />
                  </Stat>
                  <Stat label="Safe to spend a day" value={shown.safeDailyMinor === null ? '—' : money(shown.safeDailyMinor, currency)} />
                </>
              )}
              <Stat label="Received" value={money(shown.receivedMinor, currency)} />
            </Stats>
          )}
          <MissingRates currencies={shown.missing} />

          {tab === 'overview' && Boolean(captures.data?.length) && (
            <Section title={`To review (${captures.data!.length})`}>
              <ul className="panel-rows">
                {captures.data!.map((message) => (
                  <li className="panel-row flex flex-wrap items-center gap-x-3 gap-y-2" key={message.id}>
                    <span className="grid min-w-0 flex-1 basis-56">
                      <span className="truncate text-ink">{message.suggestion.merchant ?? message.sender}</span>
                      <span className="truncate text-sm text-muted" dir="auto">{message.text}</span>
                    </span>
                    {message.suggestion.amountMinor !== null && message.suggestion.currency && (
                      <span className="shrink-0 text-ink">{money(message.suggestion.amountMinor, message.suggestion.currency)}</span>
                    )}
                    {editable && (
                      <>
                        <Button label="Add" onClick={() => setDialog({ capture: message })} />
                        <button
                          className="text-button text-sm"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              await auth.request(`/captures/${message.id}/ignore`, { method: 'POST' });
                              captures.mutate((current) => current.filter((shown) => shown.id !== message.id));
                              return '';
                            }, 'Could not ignore the message')
                          }
                          type="button"
                        >
                          Ignore
                        </button>
                        {message.suggestion.merchant && (
                          <button
                            className="text-button text-sm"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await auth.request(`/spaces/${spaceId}/merchant-rules`, {
                                  method: 'POST',
                                  body: JSON.stringify({ match: message.suggestion.merchant!.toLowerCase(), ignore: true }),
                                });
                                await auth.request(`/captures/${message.id}/ignore`, { method: 'POST' });
                                reload();
                                return `Messages from ${message.suggestion.merchant} will be ignored.`;
                              }, 'Could not ignore the merchant')
                            }
                            type="button"
                          >
                            Always ignore
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tab === 'accounts' && (
            <Section action={editable && <Button label="Add account" onClick={() => setDialog({ account: null })} />} title="Accounts">
              {accounts.error ? (
                <LoadError compact error={accounts.error} onRetry={accounts.reload} />
              ) : !accounts.data?.length ? (
                <Hint>No accounts yet.</Hint>
              ) : (
                <ul className="panel-rows">
                  {accounts.data.map((account) => (
                    <li className="panel-row flex items-center gap-3" key={account.id}>
                      <RowText
                        detail={[accountKindOptions.find((option) => option.value === account.kind)?.label, ...account.cardDigits.map((digits) => `•••• ${digits}`)].join(' · ')}
                        title={account.name}
                      />
                      <span className="shrink-0 text-ink">
                        {account.kind === 'credit' ? `${money(Math.max(0, -account.balanceMinor), account.currency)} owed` : money(account.balanceMinor, account.currency)}
                      </span>
                      {editable && (
                        <ActionsMenu
                          items={[
                            { label: 'Edit', onSelect: () => setDialog({ account }) },
                            {
                              label: 'Remove',
                              separated: true,
                              onSelect: () =>
                                void action.run(async () => {
                                  await auth.request(`/accounts/${account.id}`, { method: 'DELETE' });
                                  reload();
                                  return `Removed ${account.name}.`;
                                }, 'Could not remove the account'),
                            },
                          ]}
                          name={account.name}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {tab === 'accounts' && (
            <Section action={editable && <Button label="Add plan" onClick={() => setDialog({ installment: null })} />} title="Installments">
              {installments.error ? (
                <LoadError compact error={installments.error} onRetry={installments.reload} />
              ) : !installments.data?.length ? (
                <Hint>No installment plans.</Hint>
              ) : (
                <ul className="panel-rows">
                  {installments.data.map((plan) => (
                    <li className="panel-row grid gap-2" key={plan.id}>
                      <span className="flex items-center gap-3">
                        <RowText title={plan.name}>
                          <span className={plan.status === 'missed' ? 'text-sm text-danger' : 'text-sm text-muted'}>
                            {plan.status === 'done'
                              ? 'Paid off'
                              : `${plan.status === 'missed' ? 'Missed' : 'Next'}: ${money(plan.monthlyMinor, plan.currency)} on ${formatDay(plan.nextDueOn!, { day: 'numeric', month: 'short' })} · ${money(plan.remainingMinor, plan.currency)} left`}
                          </span>
                        </RowText>
                        <span className="shrink-0 text-sm text-muted">
                          {plan.paidCount} of {plan.count}
                        </span>
                        {editable && (
                          <ActionsMenu
                            items={[
                              ...(plan.status === 'done'
                                ? []
                                : [
                                    {
                                      label: 'Mark next payment paid',
                                      onSelect: () =>
                                        void action.run(async () => {
                                          const updated = await auth.request<InstallmentPlan>(`/installments/${plan.id}/paid`, { method: 'POST' });
                                          installments.mutate((current) => current.map((shown) => (shown.id === plan.id ? updated : shown)));
                                          return '';
                                        }, 'Could not mark the payment'),
                                    },
                                  ]),
                              { label: 'Edit', onSelect: () => setDialog({ installment: plan }) },
                              {
                                label: 'Remove',
                                separated: true,
                                onSelect: () =>
                                  void action.run(async () => {
                                    await auth.request(`/installments/${plan.id}`, { method: 'DELETE' });
                                    installments.mutate((current) => current.filter((shown) => shown.id !== plan.id));
                                    return `Removed ${plan.name}.`;
                                  }, 'Could not remove the plan'),
                              },
                            ]}
                            name={plan.name}
                          />
                        )}
                      </span>
                      <Meter label={`${plan.name} paid`} value={plan.paidCount / plan.count} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {tab === 'overview' && byCategory && (
            <Section
              action={
                <button className="text-button text-sm" onClick={() => showByCategory(false)} type="button">
                  Hide
                </button>
              }
              title="By category"
            >
              {shown.categories.some((row) => row.spentMinor > 0) ? (
                <CategoryChart colourOf={colourOf} currency={currency} rows={shown.categories} />
              ) : (
                <Hint>Nothing spent this month yet.</Hint>
              )}
            </Section>
          )}

          {managing && (
            <Section
              action={
                editable && (
                  <span className="flex flex-wrap gap-2">
                    <Button label="Budget settings" onClick={() => setDialog('plan')} />
                    <Button label="Set a budget" onClick={() => setDialog({ budget: null })} primary />
                  </span>
                )
              }
              title="Budgets"
            >
              {!shown.budgets.length && shown.plan.budgetMinor === null ? (
                <Empty title="No budgets yet">
                  Budgets are optional. Give a category or the whole month a limit to see what is left and what you can spend each day.
                </Empty>
              ) : !shown.categories.some((row) => row.budgetMinor !== null) ? (
                <Hint>No category has its own budget.</Hint>
              ) : (
                <ul className="panel-rows">
                  {shown.categories.filter((row) => row.budgetMinor !== null).map((row) => (
                    <li className="panel-row grid gap-2" key={row.category}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-ink">
                          <span aria-hidden="true" className={`swatch-dot tag-${colourOf(row.category)}`} />
                          {categoryName(row.category)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm text-muted">
                            {`${money(row.spentMinor, currency)} of ${money(row.budgetMinor!, currency)}`}
                            {row.carriedMinor !== 0 && `, ${money(row.carriedMinor, currency)} carried over`}
                          </span>
                          {editable && (
                            <ActionsMenu
                              items={[
                                { label: 'Change the budget', onSelect: () => setDialog({ budget: row.category }) },
                                {
                                  label: 'Remove the budget',
                                  separated: true,
                                  onSelect: () =>
                                    void action.run(async () => {
                                      await auth.request(`/spaces/${spaceId}/budgets/${encodeURIComponent(row.category)}`, { method: 'DELETE' });
                                      summary.reload();
                                      return `Removed the ${categoryName(row.category).toLowerCase()} budget.`;
                                    }, 'Could not remove the budget'),
                                },
                              ]}
                              name={categoryName(row.category)}
                            />
                          )}
                        </span>
                      </span>
                      <Meter label={`${categoryName(row.category)} spent of budget`} value={row.budgetMinor ? row.spentMinor / row.budgetMinor : 1} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {managing && Boolean(rules.data?.length) && (
            <Section title="Merchant rules">
              <ul className="panel-rows">
                {rules.data!.map((rule) => (
                  <li className="panel-row flex items-center gap-3" key={rule.id}>
                    <RowText
                      detail={rule.ignore ? 'Ignored' : [rule.rename, rule.category && categoryName(rule.category)].filter(Boolean).join(' · ')}
                      title={rule.match}
                    />
                    {editable && (
                      <button
                        className="text-button text-sm"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            await auth.request(`/merchant-rules/${rule.id}`, { method: 'DELETE' });
                            rules.mutate((current) => current.filter((shown) => shown.id !== rule.id));
                            return '';
                          }, 'Could not remove the rule')
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(tab === 'overview' || tab === 'transactions') && (
            <Section
              action={tab === 'overview' && shown.expenses.length > recentCount && <Button label="All transactions" onClick={() => go({ tab: 'transactions' })} />}
              title={tab === 'overview' ? 'Recent' : 'Transactions'}
            >
              {shown.expenses.length === 0 ? (
                <Empty title="Nothing this month" />
              ) : (
                <ul className="panel-rows">
                  {(tab === 'overview' ? shown.expenses.slice(0, recentCount) : shown.expenses).map((expense) => (
                    <li className="panel-row flex items-center gap-3" key={expense.id}>
                      <button
                        className="grid min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                        disabled={!editable}
                        onClick={() => setDialog({ expense })}
                        type="button"
                      >
                        <span className="truncate text-ink">{expense.title}</span>
                        <span className="truncate text-sm text-muted">
                          {[
                            formatDay(expense.spentOn, { weekday: 'short', day: 'numeric', month: 'short' }),
                            expense.direction === 'transfer'
                              ? `${accountName(expense.accountId) ?? 'Removed account'} → ${accountName(expense.toAccountId) ?? 'Removed account'}`
                              : expense.direction === 'received'
                                ? 'Received'
                                : `${categoryName(expense.category)}${expense.direction === 'refund' ? ' refund' : ''}`,
                            expense.direction !== 'transfer' && accountName(expense.accountId),
                            expense.split && 'split',
                            expense.paymentLabel,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                      <span className={expense.direction === 'transfer' ? 'shrink-0 text-muted' : 'shrink-0 text-ink'}>
                        {expense.direction === 'received' || expense.direction === 'refund' ? '+' : ''}
                        {money(expense.amountMinor, expense.currency)}
                      </span>
                      {editable && space?.kind === 'shared' && members.data && (
                        <ActionsMenu items={[{ label: expense.split ? 'Change the split' : 'Split it', onSelect: () => setDialog({ split: expense }) }]} name={expense.title} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </>
      )}

      {spaceId && dialog === 'new' && <ExpenseEditor accounts={accounts.data ?? []} currency={currency} onClose={() => setDialog(undefined)} onSaved={reload} spaceId={spaceId} />}
      {spaceId && dialog === 'import' && <ExpenseImport currency={currency} onAdded={() => summary.reload()} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
      {spaceId && typeof dialog === 'object' && 'expense' in dialog && (
        <ExpenseEditor
          accounts={accounts.data ?? []}
          currency={currency}
          expense={dialog.expense}
          onClose={() => setDialog(undefined)}
          onSaved={reload}
          onTrashed={reload}
          spaceId={spaceId}
        />
      )}
      {typeof dialog === 'object' && 'split' in dialog && members.data && (
        <SplitEditor
          item={{ id: dialog.split.id, name: dialog.split.title, split: dialog.split.split }}
          kind="expenses"
          members={members.data}
          onClose={() => setDialog(undefined)}
          onSaved={() => summary.reload()}
        />
      )}
      {spaceId && typeof dialog === 'object' && 'capture' in dialog && (
        <ExpenseEditor accounts={accounts.data ?? []} capture={dialog.capture} currency={currency} onClose={() => setDialog(undefined)} onSaved={reload} spaceId={spaceId} />
      )}
      {spaceId && space && dialog === 'phone' && <PhoneSetup onClose={() => setDialog(undefined)} spaceId={spaceId} spaceName={space.name} />}
      {spaceId && typeof dialog === 'object' && 'account' in dialog && (
        <AccountEditor account={dialog.account ?? undefined} currency={currency} onClose={() => setDialog(undefined)} onSaved={reload} spaceId={spaceId} />
      )}
      {spaceId && shown && typeof dialog === 'object' && 'budget' in dialog && (
        <BudgetDialog
          categories={categories.data ?? []}
          category={dialog.budget}
          currency={currency}
          onClose={() => setDialog(undefined)}
          onSaved={() => summary.reload()}
          spaceId={spaceId}
          summary={shown}
        />
      )}
      {spaceId && typeof dialog === 'object' && 'installment' in dialog && (
        <InstallmentEditor
          accounts={accounts.data ?? []}
          currency={currency}
          onClose={() => setDialog(undefined)}
          onSaved={installments.reload}
          plan={dialog.installment ?? undefined}
          spaceId={spaceId}
        />
      )}
      {spaceId && shown && dialog === 'plan' && <PlanDialog currency={currency} onClose={() => setDialog(undefined)} onSaved={() => summary.reload()} plan={shown.plan} spaceId={spaceId} />}
      {spaceId && categories.data && dialog === 'categories' && (
        <CategoriesEditor categories={categories.data} onClose={() => setDialog(undefined)} onSaved={() => (categories.reload(), reload())} spaceId={spaceId} />
      )}
    </Page>
  );
}

function CategoryChart({ colourOf, currency, rows }: { colourOf: (category: string) => string; currency: string; rows: SpendingMonth['categories'] }) {
  const spent = rows.filter((row) => row.spentMinor > 0).sort((a, b) => b.spentMinor - a.spentMinor);
  const total = spent.reduce((sum, row) => sum + row.spentMinor, 0);
  const rest = spent.slice(chartedCount);
  const parts = [
    ...spent.slice(0, chartedCount).map((row) => ({ key: row.category, label: categoryName(row.category), colour: colourOf(row.category), spentMinor: row.spentMinor })),
    ...(rest.length ? [{ key: 'rest', label: `${rest.length} more`, colour: 'gray', spentMinor: rest.reduce((sum, row) => sum + row.spentMinor, 0) }] : []),
  ];
  const share = (minor: number) => `${Math.round((minor / total) * 100)}%`;

  return (
    <div className="grid gap-4">
      <div aria-hidden="true" className="flex h-4 gap-0.5 overflow-hidden rounded">
        {parts.map((part) => (
          <span
            className={`tag-${part.colour} min-w-1`}
            key={part.key}
            style={{ flex: `${part.spentMinor} 1 0%`, background: 'var(--tag-color)' }}
            title={`${part.label}: ${money(part.spentMinor, currency)} (${share(part.spentMinor)})`}
          />
        ))}
      </div>
      <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {parts.map((part) => (
          <li className="flex items-center gap-2 text-sm" key={part.key}>
            <span aria-hidden="true" className={`swatch-dot tag-${part.colour}`} />
            <span className="min-w-0 flex-1 truncate text-ink">{part.label}</span>
            <span className="shrink-0 text-muted">
              {money(part.spentMinor, currency)} · {share(part.spentMinor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BudgetDialog({
  categories,
  category,
  currency,
  onClose,
  onSaved,
  spaceId,
  summary,
}: {
  categories: SpendingCategory[];
  category: string | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  spaceId: string;
  summary: SpendingMonth;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [chosen, setChosen] = useState(category ?? categories[0]?.name ?? 'other');
  const existing = summary.budgets.find((budget) => budget.category === chosen);
  const [chosenCurrency, setChosenCurrency] = useState(existing?.currency ?? currency);

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { amount: [required('Enter the monthly amount.'), moneyAmount] })) return;
        const amountMinor = toMinor(String(new FormData(target).get('amount')).trim(), chosenCurrency);
        void saving
          .run(async () => {
            await auth.request(`/spaces/${spaceId}/budgets/${encodeURIComponent(chosen)}`, { method: 'PUT', body: JSON.stringify({ amountMinor, currency: chosenCurrency }) });
            onSaved();
            return `The ${categoryName(chosen).toLowerCase()} budget is ${money(amountMinor, chosenCurrency)} a month.`;
          }, 'Could not save the budget')
          .then((done) => done && onClose());
      }}
      submitLabel="Save budget"
      title={category ? `${categoryName(category)} budget` : 'Set a budget'}
    >
      {!category && <CategoryChips categories={categories} onChange={setChosen} value={chosen} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField autoFocus defaultValue={existing ? fromMinor(existing.amountMinor, existing.currency) : ''} inputMode="decimal" key={chosen} label="Each month" {...form.field('amount')} />
        <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
      </div>
    </FormDialog>
  );
}

function PlanDialog({ currency, onClose, onSaved, plan, spaceId }: { currency: string; onClose: () => void; onSaved: () => void; plan: SpendingPlan; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [chosenCurrency, setChosenCurrency] = useState(plan.currency ?? currency);
  const [rollover, setRollover] = useState(plan.rollover);

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { budget: [(value) => (value.trim() ? moneyAmount(value) : undefined)] })) return;
        const budget = String(new FormData(target).get('budget')).trim();
        const body = {
          budgetMinor: budget ? toMinor(budget, chosenCurrency) : null,
          currency: budget ? chosenCurrency : null,
          startDay: Number(new FormData(target).get('startDay')) || 1,
          rollover,
        };
        void saving
          .run(async () => {
            await auth.request(`/spaces/${spaceId}/spending-plan`, { method: 'PUT', body: JSON.stringify(body) });
            onSaved();
            return 'Budget settings saved.';
          }, 'Could not save the budget settings')
          .then((done) => done && onClose());
      }}
      submitLabel="Save"
      title="Budget settings"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          autoFocus
          defaultValue={plan.budgetMinor === null || !plan.currency ? '' : fromMinor(plan.budgetMinor, plan.currency)}
          hint="Leave empty to add up the category budgets."
          inputMode="decimal"
          label="Monthly budget (optional)"
          {...form.field('budget')}
        />
        <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
      </div>
      <DayOfMonthField defaultValue={plan.startDay === 1 ? '' : String(plan.startDay)} emptyLabel="The 1st (calendar month)" label="Months start on" last={28} name="startDay" />
      <Toggle checked={rollover} label="Carry what is left into next month" onChange={setRollover} />
    </FormDialog>
  );
}
