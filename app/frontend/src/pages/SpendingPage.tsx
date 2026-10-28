import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog, formatDay, ListRow, Meter, Placeholder, Select, Skeleton, TextField, Toggle } from '@project-graphite/ui';
import { shiftMonth } from '../agenda';
import { useAuth } from '../auth';
import { AccountEditor } from '../components/AccountEditor';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button, ButtonLink, TextButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { Hint } from '../components/Hint';
import { InstallmentEditor } from '../components/InstallmentEditor';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Section } from '../components/Page';
import { PeriodNav } from '../components/PeriodNav';
import { AmountRowsSkeleton, ButtonSkeleton, HintSkeleton, rowsOf, SkeletonLine, StatsSkeleton, useRememberedShape } from '../components/Skeletons';
import { SpendingFrame } from '../components/SpendingFrame';
import { SplitEditor } from '../components/SplitEditor';
import {
  accountKindOptions,
  categoryName,
  expenseCategories,
  spendingHref,
  useByCategory,
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
import { useChosenSpace, type Member } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { formatDate } from '../time';
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
const emptyAccounts = { title: 'No accounts yet', hint: 'Add your bank accounts, cards, wallets and cash to follow their balances and move money between them.' };
const emptyBudgets = { title: 'No budgets yet', hint: 'Budgets are optional. Give a category or the whole month a limit to see what’s left and what you can spend each day.' };
const emptyTransactions = { title: 'No transactions this month', hint: 'Add an expense, import a statement or connect your phone to see this month’s spending here.' };

export function SpendingPage({ tab }: { tab: 'overview' | 'transactions' | 'accounts' | 'budgets' }) {
  const auth = useAuth();
  const action = useAction();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : null;
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
    | 'plan'
    | { budget: string | null }
    | { expense: Expense }
    | { split: Expense }
    | { account: MoneyAccount | null }
    | { capture: CapturedMessage }
    | { installment: InstallmentPlan | null }
    | { ignoreMerchant: CapturedMessage }
    | { deleteAccount: MoneyAccount }
    | { deletePlan: InstallmentPlan }
    | { deleteBudget: string }
    | { deleteRule: MerchantRule }
  >();
  const [byCategory, showByCategory] = useByCategory();
  const shown = summary.data;
  const currency = shown?.currency ?? 'EUR';
  const accountName = (id: string | null) => accounts.data?.find((account) => account.id === id)?.name;
  const cardName = (digits: string, accountId: string | null) => [accountName(accountId), `•••• ${digits}`].filter(Boolean).join(' ');
  const card = params.get('card');
  const listed = (shown?.expenses ?? []).filter((expense) => tab !== 'transactions' || !card || expense.cardDigits === card);
  const cards = [...new Map((shown?.expenses ?? []).filter((expense) => expense.cardDigits).map((expense) => [expense.cardDigits!, cardName(expense.cardDigits!, expense.accountId)])).entries()];
  const cardTotals = [
    ...(shown?.expenses ?? [])
      .filter((expense) => expense.cardDigits && expense.direction === 'spent')
      .reduce((totals, expense) => {
        const key = `${expense.cardDigits}-${expense.currency}`;
        const total = totals.get(key) ?? { key, label: cardName(expense.cardDigits!, expense.accountId), currency: expense.currency, spentMinor: 0 };
        return totals.set(key, { ...total, spentMinor: total.spentMinor + expense.amountMinor });
      }, new Map<string, { key: string; label: string; currency: string; spentMinor: number }>())
      .values(),
  ];
  const shape = useRememberedShape(
    `spending-${tab}${tab === 'transactions' && card ? '-card' : ''}`,
    shown &&
      (tab === 'overview'
        ? [
            shown.budgetMinor === null ? 0 : 1,
            cardTotals.length,
            captures.data?.length ?? 0,
            Math.min(shown.categories.filter((row) => row.spentMinor > 0).length, chartedCount + 1),
            Math.min(shown.expenses.length, recentCount + 1),
          ]
        : tab === 'transactions'
          ? [listed.length, cards.length]
          : tab === 'budgets'
            ? [
                shown.budgets.length || shown.plan.budgetMinor !== null ? 1 : 0,
                shown.categories.filter((row) => row.budgetMinor !== null).length,
                rules.data?.length ?? 0,
                rules.data?.filter((rule) => rule.ignore || rule.rename || rule.category).length ?? 0,
              ]
            : accounts.data && installments.data && [accounts.data.length, installments.data.length]),
    tab === 'overview' ? [0, 0, 0, 0, recentCount] : tab === 'transactions' ? [recentCount, 0] : tab === 'budgets' ? [1, 3, 0, 0] : [2, 0],
  );
  const reload = () => {
    summary.reload();
    accounts.reload();
    captures.reload();
    rules.reload();
  };
  const expenseRows = (expenses: Expense[]) => (
    <ul className="panel-rows">
      {expenses.map((expense) => (
        <ListRow
          key={expense.id}
          meta={[
            formatDate(expense.spentOn),
            expense.direction === 'transfer'
              ? `${accountName(expense.accountId) ?? 'Removed account'} → ${accountName(expense.toAccountId) ?? 'Removed account'}`
              : expense.direction === 'received'
                ? 'Received'
                : `${categoryName(expense.category)}${expense.direction === 'refund' ? ' refund' : ''}`,
            expense.direction !== 'transfer' && (expense.cardDigits ? cardName(expense.cardDigits, expense.accountId) : accountName(expense.accountId)),
            expense.split && 'split',
            expense.paymentLabel,
          ]
            .filter(Boolean)
            .join(' · ')}
          onClick={editable ? () => setDialog({ expense }) : undefined}
          title={expense.title}
          trail={
            <>
              <Amount currency={expense.currency} direction={expense.direction} minor={expense.amountMinor} />
              {editable && space?.kind === 'shared' && members.data && (
                <ActionsMenu items={[{ label: expense.split ? 'Change the split' : 'Split it', onSelect: () => setDialog({ split: expense }) }]} name={expense.title} />
              )}
            </>
          }
        />
      ))}
    </ul>
  );

  return (
    <SpendingFrame
      accounts={accounts.data}
      categories={categories.data}
      currency={currency}
      onChanged={() => {
        categories.reload();
        reload();
      }}
      tab={tab}
      toolbar={
        tab !== 'accounts' && (
          <>
            <PeriodNav
              current={tab === 'overview' ? undefined : {
                label: 'This month',
                onSelect: () =>
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    next.delete('month');
                    return next;
                  }),
              }}
              disabled={!shown}
              onShift={(step) => setParams((current) => ({ ...Object.fromEntries(current), month: shiftMonth(shown!.month, step) }))}
              title={
                !shown ? (
                  <SkeletonLine width="w-28" />
                ) : shown.plan.startDay === 1 ? (
                  monthName.format(new Date(`${shown.month}-01T00:00:00Z`))
                ) : (
                  `${formatDay(shown.from, { day: 'numeric', month: 'short' })} – ${formatDay(shown.until, { day: 'numeric', month: 'short', year: 'numeric' })}`
                )
              }
              unit="month"
            />
            {tab === 'transactions' && !shown && (card || shape[1]! > 0) && <Skeleton className="h-10 w-36 rounded-field" />}
            {tab === 'transactions' && shown && (cards.length > 0 || card) && (
              <Select
                aria-label="Card"
                onChange={(next: string) =>
                  setParams((current) => {
                    const query = new URLSearchParams(current);
                    if (next) query.set('card', next);
                    else query.delete('card');
                    return query;
                  })
                }
                options={[
                  { value: '', label: 'All cards' },
                  ...cards.map(([digits, label]) => ({ value: digits, label })),
                  ...(card && !cards.some(([digits]) => digits === card) ? [{ value: card, label: `•••• ${card}` }] : []),
                ]}
                size="small"
                value={card ?? ''}
              />
            )}
          </>
        )
      }
    >
      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !shown || (tab === 'accounts' && [accounts, installments].some((resource) => !resource.data && !resource.error)) ? (
        <Placeholder className="grid gap-8" label="Adding up the month">
          <SpendingSkeleton byCategory={byCategory} editable={!space || editable} shape={shape} tab={tab} />
        </Placeholder>
      ) : (
        <>
          {tab === 'overview' && (
            <Stats>
              <Stat label="Spent" value={<Amount currency={currency} minor={shown.spentMinor} tween />} />
              {shown.budgetMinor !== null && (
                <>
                  <Stat
                    label="Left to spend"
                    value={
                      shown.spentMinor > shown.budgetMinor ? (
                        <Amount currency={currency} danger minor={shown.spentMinor - shown.budgetMinor} tween>
                          {' over'}
                        </Amount>
                      ) : (
                        <Amount currency={currency} minor={shown.budgetMinor - shown.spentMinor} tween />
                      )
                    }
                  >
                    <Meter label="Spent of the whole budget" value={shown.budgetMinor ? shown.spentMinor / shown.budgetMinor : 1} />
                  </Stat>
                  <Stat label="Safe to spend a day" value={shown.safeDailyMinor === null ? '—' : <Amount currency={currency} minor={shown.safeDailyMinor} tween />} />
                </>
              )}
              <Stat label="Received" value={<Amount currency={currency} minor={shown.receivedMinor} tween />} />
            </Stats>
          )}
          <MissingRates currencies={shown.missing} />

          {tab === 'overview' && cardTotals.length > 0 && (
            <Section title="By card">
              <Stats>
                {cardTotals.map((total) => (
                  <Stat key={total.key} label={total.label} value={<Amount currency={total.currency} minor={total.spentMinor} tween />} />
                ))}
              </Stats>
            </Section>
          )}

          {tab === 'overview' && Boolean(captures.data?.length) && (
            <Section title={`To review (${captures.data!.length})`}>
              <ul className="panel-rows">
                {captures.data!.map((message) => (
                  <ListRow
                    key={message.id}
                    meta={
                      <>
                        {message.suggestion.paymentLabel && `${message.suggestion.paymentLabel} · `}
                        {message.suggestion.cardDigits && `•••• ${message.suggestion.cardDigits} · `}
                        <span dir="auto">{message.text}</span>
                      </>
                    }
                    title={message.suggestion.merchant ?? message.sender}
                    trail={
                      <>
                        {message.suggestion.amountMinor !== null &&
                          message.suggestion.currency && <Amount currency={message.suggestion.currency} direction={message.suggestion.direction} minor={message.suggestion.amountMinor} />}
                        {editable && (
                          <>
                            <Button label="Add" onClick={() => setDialog({ capture: message })} />
                            <ActionsMenu
                              items={[
                                {
                                  label: 'Ignore',
                                  onSelect: () =>
                                    void action.run(async () => {
                                      await auth.request(`/captures/${message.id}/ignore`, { method: 'POST' });
                                      captures.mutate((current) => current.filter((shown) => shown.id !== message.id));
                                      return `Ignored the message from ${message.suggestion.merchant ?? message.sender}.`;
                                    }, 'Could not ignore the message'),
                                },
                                ...(message.suggestion.merchant ? [{ label: 'Always ignore', onSelect: () => setDialog({ ignoreMerchant: message }) }] : []),
                              ]}
                              name={message.suggestion.merchant ?? message.sender}
                            />
                          </>
                        )}
                      </>
                    }
                  />
                ))}
              </ul>
            </Section>
          )}

          {tab === 'accounts' && (
            <Section action={editable && <Button icon="plus" label="New account" large onClick={() => setDialog({ account: null })} />} title="Accounts">
              {!accounts.data ? (
                <LoadError compact error={accounts.error} onRetry={accounts.reload} />
              ) : accounts.data.length === 0 ? (
                <Empty level={3} title={emptyAccounts.title}>
                  {emptyAccounts.hint}
                </Empty>
              ) : (
                <ul className="panel-rows">
                  {accounts.data.map((account) => (
                    <ListRow
                      key={account.id}
                      meta={[accountKindOptions.find((option) => option.value === account.kind)?.label, ...account.cardDigits.map((digits) => `•••• ${digits}`)].join(' · ')}
                      onClick={editable ? () => setDialog({ account }) : undefined}
                      title={account.name}
                      trail={
                        <>
                          <Amount currency={account.currency} minor={account.kind === 'credit_card' ? Math.max(0, -account.balanceMinor) : account.balanceMinor}>
                            {account.kind === 'credit_card' && ' owed'}
                          </Amount>
                          {editable && <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDialog({ deleteAccount: account }) }]} name={account.name} />}
                        </>
                      }
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}

          {tab === 'accounts' && (
            <Section action={editable && <Button icon="plus" label="New plan" large onClick={() => setDialog({ installment: null })} />} title="Installments">
              {installments.error ? (
                <LoadError compact error={installments.error} onRetry={installments.reload} />
              ) : !installments.data?.length ? (
                <Hint>No installment plans yet.</Hint>
              ) : (
                <ul className="panel-rows">
                  {installments.data.map((plan) => (
                    <ListRow
                      key={plan.id}
                      meta={
                        <span className={plan.status === 'missed' ? 'text-danger' : undefined}>
                          {plan.status === 'done'
                            ? 'Paid off'
                            : `${plan.status === 'missed' ? 'Missed' : 'Next'}: ${money(plan.monthlyMinor, plan.currency)} on ${formatDay(plan.nextDueOn!, { day: 'numeric', month: 'short' })} · ${money(plan.remainingMinor, plan.currency)} left`}
                        </span>
                      }
                      onClick={editable ? () => setDialog({ installment: plan }) : undefined}
                      title={plan.name}
                      trail={
                        <>
                          <span className="mono-sm shrink-0 text-faint">
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
                                            return `Marked a ${plan.name} payment paid.`;
                                          }, 'Could not mark the payment'),
                                      },
                                    ]),
                                { label: 'Delete', separated: true, onSelect: () => setDialog({ deletePlan: plan }) },
                              ]}
                              name={plan.name}
                            />
                          )}
                        </>
                      }
                    >
                      <Meter label={`${plan.name} paid`} value={plan.paidCount / plan.count} />
                    </ListRow>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {tab === 'overview' && byCategory && (
            <Section action={<TextButton label="Hide" onClick={() => showByCategory(false)} />} title="By category">
              {shown.categories.some((row) => row.spentMinor > 0) ? (
                <CategoryChart colourOf={colourOf} currency={currency} rows={shown.categories} />
              ) : (
                <Hint>Nothing spent this month yet.</Hint>
              )}
            </Section>
          )}

          {tab === 'budgets' && (
            <Section
              action={
                editable && (
                  <span className="flex flex-wrap gap-2">
                    <Button label="Budget settings" large onClick={() => setDialog('plan')} />
                    <Button icon="plus" label="New budget" large onClick={() => setDialog({ budget: null })} />
                  </span>
                )
              }
              title="Budgets"
            >
              {!shown.budgets.length && shown.plan.budgetMinor === null ? (
                <Empty level={3} title={emptyBudgets.title}>
                  {emptyBudgets.hint}
                </Empty>
              ) : !shown.categories.some((row) => row.budgetMinor !== null) ? (
                <Hint>No category has its own budget.</Hint>
              ) : (
                <ul className="panel-rows">
                  {shown.categories
                    .filter((row) => row.budgetMinor !== null)
                    .map((row) => (
                      <ListRow
                        key={row.category}
                        onClick={editable ? () => setDialog({ budget: row.category }) : undefined}
                        title={
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className={`swatch-dot tag-${colourOf(row.category)}`} />
                            {categoryName(row.category)}
                          </span>
                        }
                        trail={
                          <>
                            <Amount currency={currency} danger={row.spentMinor > row.budgetMinor!} minor={row.spentMinor}>
                              {` of ${money(row.budgetMinor!, currency)}`}
                              {row.carriedMinor !== 0 && `, ${money(row.carriedMinor, currency)} carried over`}
                            </Amount>
                            {editable && <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDialog({ deleteBudget: row.category }) }]} name={categoryName(row.category)} />}
                          </>
                        }
                      >
                        <Meter label={`${categoryName(row.category)} spent of budget`} value={row.budgetMinor ? row.spentMinor / row.budgetMinor : 1} />
                      </ListRow>
                    ))}
                </ul>
              )}
            </Section>
          )}

          {tab === 'budgets' && Boolean(rules.data?.length) && (
            <Section title="Merchant rules">
              <ul className="panel-rows">
                {rules.data!.map((rule) => (
                  <ListRow
                    key={rule.id}
                    meta={rule.ignore ? 'Ignored' : [rule.rename, rule.category && categoryName(rule.category)].filter(Boolean).join(' · ')}
                    title={rule.match}
                    trail={editable && <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDialog({ deleteRule: rule }) }]} name={rule.match} />}
                  />
                ))}
              </ul>
            </Section>
          )}

          {tab === 'overview' && (
            <Section action={shown.expenses.length > recentCount && <ButtonLink label="All transactions" to={spendingHref('transactions', params)} />} title="Recent">
              {shown.expenses.length === 0 ? <Hint>No transactions this month yet.</Hint> : expenseRows(shown.expenses.slice(0, recentCount))}
            </Section>
          )}

          {tab === 'transactions' &&
            (listed.length === 0 ? (
              <Empty title={emptyTransactions.title}>{emptyTransactions.hint}</Empty>
            ) : (
              expenseRows(listed)
            ))}
        </>
      )}

      {spaceId && typeof dialog === 'object' && 'expense' in dialog && (
        <ExpenseEditor
          accounts={accounts.data ?? []}
          currency={currency}
          expense={dialog.expense}
          onClose={() => setDialog(undefined)}
          onRestored={reload}
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
      {spaceId && typeof dialog === 'object' && 'account' in dialog && (
        <AccountEditor account={dialog.account ?? undefined} currency={currency} onClose={() => setDialog(undefined)} onSaved={reload} spaceId={spaceId} />
      )}
      {spaceId && shown && typeof dialog === 'object' && 'budget' in dialog && (
        <BudgetDialog
          categories={expenseCategories(categories.data)}
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
      {typeof dialog === 'object' && 'ignoreMerchant' in dialog && (
        <ConfirmDialog
          busyLabel="Ignoring…"
          confirmLabel="Always ignore"
          errorFallback="Could not ignore the merchant"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${spaceId}/merchant-rules`, {
              method: 'POST',
              body: JSON.stringify({ match: dialog.ignoreMerchant.suggestion.merchant!.toLowerCase(), ignore: true }),
            });
            await auth.request(`/captures/${dialog.ignoreMerchant.id}/ignore`, { method: 'POST' });
            reload();
            action.report(`Ignored ${dialog.ignoreMerchant.suggestion.merchant} from now on.`);
          }}
          title={`Always ignore ${dialog.ignoreMerchant.suggestion.merchant}?`}
          tone="danger"
        >
          This message and every later one from {dialog.ignoreMerchant.suggestion.merchant} are skipped. You can delete the rule under Budgets.
        </ConfirmDialog>
      )}
      {typeof dialog === 'object' && 'deleteAccount' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete account"
          errorFallback="Could not delete the account"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/accounts/${dialog.deleteAccount.id}`, { method: 'DELETE' });
            reload();
            action.report(`Deleted ${dialog.deleteAccount.name}.`);
          }}
          title={`Delete ${dialog.deleteAccount.name}?`}
          tone="danger"
        >
          Its transactions stay, but no longer belong to an account. Transfers show “Removed account” instead.
        </ConfirmDialog>
      )}
      {typeof dialog === 'object' && 'deletePlan' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete plan"
          errorFallback="Could not delete the plan"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/installments/${dialog.deletePlan.id}`, { method: 'DELETE' });
            installments.mutate((current) => current.filter((shown) => shown.id !== dialog.deletePlan.id));
            action.report(`Deleted ${dialog.deletePlan.name}.`);
          }}
          title={`Delete ${dialog.deletePlan.name}?`}
          tone="danger"
        >
          Its reminders stop and the payments marked so far are forgotten.
        </ConfirmDialog>
      )}
      {typeof dialog === 'object' && 'deleteBudget' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete budget"
          errorFallback="Could not delete the budget"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${spaceId}/budgets/${encodeURIComponent(dialog.deleteBudget)}`, { method: 'DELETE' });
            summary.reload();
            action.report(`Deleted the ${categoryName(dialog.deleteBudget).toLowerCase()} budget.`);
          }}
          title={`Delete the ${categoryName(dialog.deleteBudget).toLowerCase()} budget?`}
          tone="danger"
        >
          Spending in this category is still tracked, without a limit.
        </ConfirmDialog>
      )}
      {typeof dialog === 'object' && 'deleteRule' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete rule"
          errorFallback="Could not delete the rule"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/merchant-rules/${dialog.deleteRule.id}`, { method: 'DELETE' });
            rules.mutate((current) => current.filter((shown) => shown.id !== dialog.deleteRule.id));
            action.report(`Deleted the rule for ${dialog.deleteRule.match}.`);
          }}
          title={`Delete the rule for ${dialog.deleteRule.match}?`}
          tone="danger"
        >
          Transactions it has already changed stay as they are.
        </ConfirmDialog>
      )}
    </SpendingFrame>
  );
}

function SpendingSkeleton({ byCategory, editable, shape, tab }: { byCategory: boolean; editable: boolean; shape: number[]; tab: 'overview' | 'transactions' | 'accounts' | 'budgets' }) {
  if (tab === 'transactions') {
    const [rows = 0] = shape;
    return rows ? (
      <AmountRowsSkeleton rows={rows} />
    ) : (
      <Empty loading title={emptyTransactions.title}>
        {emptyTransactions.hint}
      </Empty>
    );
  }
  if (tab === 'accounts') {
    const [accountRows = 0, planRows = 0] = shape;
    return (
      <>
        <Section action={editable && <ButtonSkeleton large width="w-36" />} title="Accounts">
          {accountRows ? (
            <AmountRowsSkeleton rows={accountRows} />
          ) : (
            <Empty loading title={emptyAccounts.title}>
              {emptyAccounts.hint}
            </Empty>
          )}
        </Section>
        <Section action={editable && <ButtonSkeleton large />} title="Installments">
          {planRows ? <AmountRowsSkeleton metered={planRows} rows={planRows} /> : <HintSkeleton />}
        </Section>
      </>
    );
  }
  if (tab === 'budgets') {
    const [budgeted = 0, budgetRows = 0, ruleRows = 0, detailedRules = 0] = shape;
    return (
      <>
        <Section
          action={
            editable && (
              <span className="flex flex-wrap gap-2">
                <ButtonSkeleton large width="w-36" />
                <ButtonSkeleton large width="w-32" />
              </span>
            )
          }
          title="Budgets"
        >
          {!budgeted ? (
            <Empty loading title={emptyBudgets.title}>
              {emptyBudgets.hint}
            </Empty>
          ) : budgetRows ? (
            <AmountRowsSkeleton detailed={0} metered={budgetRows} rows={budgetRows} />
          ) : (
            <HintSkeleton />
          )}
        </Section>
        {ruleRows > 0 && (
          <Section title="Merchant rules">
            <AmountRowsSkeleton detailed={detailedRules} rows={ruleRows} />
          </Section>
        )}
      </>
    );
  }
  const [budgeted = 0, cardStats = 0, reviewRows = 0, chartParts = 0, recentRows = 0] = shape;
  return (
    <>
      <Stats>
        {rowsOf(budgeted ? 4 : 2).map((stat) => (
          <Stat key={stat} label={<SkeletonLine width="w-24" />} value={<SkeletonLine width="w-32" />}>
            {budgeted > 0 && stat === 1 && <Skeleton className="h-1.5 rounded-full" />}
          </Stat>
        ))}
      </Stats>
      {cardStats > 0 && (
        <Section title="By card">
          <StatsSkeleton count={cardStats} detail={false} />
        </Section>
      )}
      {reviewRows > 0 && (
        <Section title={`To review (${reviewRows})`}>
          <AmountRowsSkeleton rows={reviewRows} trail={editable && <ButtonSkeleton width="w-14" />} />
        </Section>
      )}
      {byCategory && (
        <Section action={<ButtonSkeleton width="w-12" />} title="By category">
          {chartParts ? (
            <div className="grid gap-4">
              <Skeleton className="h-4 rounded-field" />
              <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {rowsOf(chartParts).map((part) => (
                  <li className="flex items-center gap-2 text-sm" key={part}>
                    <SkeletonLine className="flex-1" width={part % 2 ? 'w-1/2' : 'w-2/3'} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <HintSkeleton />
          )}
        </Section>
      )}
      <Section action={recentRows > recentCount && <ButtonSkeleton width="w-32" />} title="Recent">
        {recentRows ? <AmountRowsSkeleton rows={Math.min(recentRows, recentCount)} /> : <HintSkeleton />}
      </Section>
    </>
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
      <div aria-hidden="true" className="flex h-4 gap-0.5 overflow-hidden rounded-field">
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
            <Amount currency={currency} minor={part.spentMinor}>
              {` · ${share(part.spentMinor)}`}
            </Amount>
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
      busyLabel={category ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { amount: [required('Enter the monthly amount.'), moneyAmount] })) return;
        const amountMinor = toMinor(String(new FormData(target).get('amount')).trim(), chosenCurrency);
        void saving
          .run(async () => {
            await auth.request(`/spaces/${spaceId}/budgets/${encodeURIComponent(chosen)}`, { method: 'PUT', body: JSON.stringify({ amountMinor, currency: chosenCurrency }) });
            onSaved();
            return `${category ? 'Saved' : 'Added'} the ${categoryName(chosen).toLowerCase()} budget.`;
          }, 'Could not save the budget')
          .then((done) => done && onClose());
      }}
      submitLabel={category ? 'Save' : 'Add budget'}
      title={category ? 'Edit budget' : 'New budget'}
    >
      {!category && <CategoryChips categories={categories} onChange={setChosen} value={chosen} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          autoFocus
          defaultValue={existing ? fromMinor(existing.amountMinor, existing.currency) : ''}
          inputMode="decimal"
          key={chosen}
          label={category ? `${categoryName(category)} each month` : 'Each month'}
          {...form.field('amount')}
        />
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
            return 'Saved the budget settings.';
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
      <Toggle checked={rollover} label="Carry what’s left into next month" onChange={setRollover} />
    </FormDialog>
  );
}
