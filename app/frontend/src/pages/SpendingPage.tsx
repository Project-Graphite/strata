import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Card, ConfirmDialog, formatDay, ListRow, Meter, Placeholder, Skeleton, Stat, StatGrid, TextField, TextLink, Toggle } from '@project-graphite/ui';
import { dayKey, shiftMonth } from '../agenda';
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
import { AmountRowsSkeleton, ButtonSkeleton, HintSkeleton, rowsOf, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { SpendingFrame } from '../components/SpendingFrame';
import {
  accountKindOptions,
  categoryName,
  expenseCategories,
  spendingHref,
  spendingLive,
  useCategories,
  type CapturedMessage,
  type Expense,
  type InstallmentPlan,
  type MoneyAccount,
  type SpendingCategory,
  type SpendingMonth,
  type SpendingPlan,
} from '../spending';
import { usePersonalSpace } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { formatDate } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { moneyAmount, required, useFormErrors } from '../validation';
import { CategoryChips } from '../components/CategoryChips';
import { CurrencyField } from '../components/CurrencyField';
import { MissingRates } from '../components/Stats';

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const recentCount = 5;
const chartedCount = 7;
const emptyAccounts = { title: 'No accounts yet', hint: 'Add your bank accounts, cards, wallets and cash to follow their balances and move money between them.' };
const emptyBudgets = { title: 'No budgets yet', hint: 'Budgets are optional. Give a category or the whole month a limit to see what’s left and what you can spend each day.' };

export function SpendingPage({ tab }: { tab: 'overview' | 'accounts' | 'budgets' }) {
  const auth = useAuth();
  const action = useAction();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : null;
  const { spaceId, space, editable } = usePersonalSpace();
  const summary = useResource<SpendingMonth>(spaceId ? `/spaces/${spaceId}/spending${month ? `?month=${month}` : ''}` : null, true, spendingLive);
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true, spendingLive);
  const captures = useResource<CapturedMessage[]>(spaceId && tab === 'overview' ? `/spaces/${spaceId}/captures` : null, true, spendingLive);
  const categories = useCategories(spaceId);
  const installments = useResource<InstallmentPlan[]>(spaceId && tab === 'accounts' ? `/spaces/${spaceId}/installments` : null, true, spendingLive);
  const colourOf = (category: string) => categories.data?.find((known) => known.name === category)?.colour ?? 'gray';
  const [dialog, setDialog] = useState<
    | 'plan'
    | { budget: string | null }
    | { expense: Expense }
    | { account: MoneyAccount | null }
    | { capture: CapturedMessage; report?: boolean }
    | { installment: InstallmentPlan | null }
    | { ignoreAlways: CapturedMessage; by: 'sender' | 'merchant' }
    | { deleteAccount: MoneyAccount }
    | { deletePlan: InstallmentPlan }
    | { deleteBudget: string }
  >();
  const [opened, setOpened] = useState<string[]>([]);
  const toggleMessage = (id: string) => setOpened((current) => (current.includes(id) ? current.filter((shown) => shown !== id) : [...current, id]));
  const shown = summary.data;
  const currency = shown?.currency ?? 'EGP';
  const budgeted = Boolean(shown?.budgetsEnabled && shown.budgetMinor !== null);
  const openAccounts = accounts.data?.filter((account) => !account.archivedAt);
  const accountName = (id: string | null) => accounts.data?.find((account) => account.id === id)?.name;
  const shape = useRememberedShape(
    `spending-${tab}`,
    shown &&
      (tab === 'overview'
        ? openAccounts && [
            budgeted ? 1 : 0,
            captures.data?.length ?? 0,
            openAccounts.length,
            Math.min(shown.categories.filter((row) => row.spentMinor > 0).length, chartedCount + 1),
            Math.min(shown.expenses.length, recentCount + 1),
          ]
        : tab === 'budgets'
          ? [shown.budgets.length || shown.plan.budgetMinor !== null ? 1 : 0, shown.categories.filter((row) => row.budgetMinor !== null).length]
          : accounts.data && installments.data && [accounts.data.length, installments.data.length]),
    tab === 'overview' ? [0, 0, 1, 0, recentCount] : tab === 'budgets' ? [1, 3] : [2, 0],
  );
  const reload = () => {
    summary.reload();
    accounts.reload();
    captures.reload();
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
            expense.direction !== 'transfer' && [accountName(expense.accountId), expense.cardDigits && `•••• ${expense.cardDigits}`].filter(Boolean).join(' '),
            expense.paymentLabel,
          ]
            .filter(Boolean)
            .join(' · ')}
          onClick={editable ? () => setDialog({ expense }) : undefined}
          title={expense.title}
          trail={<Amount currency={expense.currency} direction={expense.direction} minor={expense.amountMinor} />}
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
        )
      }
    >
      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !shown || ((tab === 'accounts' ? [accounts, installments] : tab === 'overview' ? [accounts] : []).some((resource) => !resource.data && !resource.error)) ? (
        <Placeholder className="grid gap-8" label="Adding up the month">
          <SpendingSkeleton editable={!space || editable} shape={shape} tab={tab} />
        </Placeholder>
      ) : (
        <>
          {tab === 'overview' && (
            <StatGrid>
              <Stat
                detail={shown.receivedMinor > 0 && `${money(shown.receivedMinor, currency)} received`}
                label="Spent"
                value={<Amount currency={currency} minor={shown.spentMinor} tween />}
              />
              {budgeted && (
                <>
                  <Stat
                    label="Left to spend"
                    meter={<Meter label="Spent of the whole budget" value={shown.budgetMinor ? shown.spentMinor / shown.budgetMinor! : 1} />}
                    value={
                      shown.spentMinor > shown.budgetMinor! ? (
                        <Amount currency={currency} danger minor={shown.spentMinor - shown.budgetMinor!} tween>
                          {' over'}
                        </Amount>
                      ) : (
                        <Amount currency={currency} minor={shown.budgetMinor! - shown.spentMinor} tween />
                      )
                    }
                  />
                  <Stat label="Safe to spend a day" value={shown.safeDailyMinor === null ? '—' : <Amount currency={currency} minor={shown.safeDailyMinor} tween />} />
                </>
              )}
              <Stat detail="Subscriptions renewing this month" label="Committed" value={<Amount currency={currency} minor={shown.committedMinor} tween />} />
            </StatGrid>
          )}
          <MissingRates currencies={shown.missing} />

          {tab === 'overview' && Boolean(captures.data?.length) && (
            <Section title={`To review (${captures.data!.length})`}>
              <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
                {captures.data!.map((message) => (
                  <ReviewCard
                    accountName={accountName}
                    editable={editable}
                    key={message.id}
                    message={message}
                    onAdd={(ready) =>
                      void action.run(async () => {
                        await auth.request(`/captures/${message.id}/record`, { method: 'POST', body: JSON.stringify(ready) });
                        reload();
                        return `Added ${ready.title}.`;
                      }, 'Could not add the transaction')
                    }
                    onEdit={(report) => setDialog({ capture: message, report })}
                    onIgnore={(by) =>
                      by
                        ? setDialog({ ignoreAlways: message, by })
                        : void action.run(async () => {
                            await auth.request(`/captures/${message.id}/ignore`, { method: 'POST' });
                            captures.mutate((current) => current.filter((listed) => listed.id !== message.id));
                            return `Ignored the message from ${message.suggestion.title ?? message.suggestion.merchant ?? message.sender}.`;
                          }, 'Could not ignore the message')
                    }
                    opened={opened.includes(message.id)}
                    onToggleMessage={() => toggleMessage(message.id)}
                  />
                ))}
              </ul>
            </Section>
          )}

          {tab === 'overview' && (
            <Section action={Boolean(openAccounts?.length) && <ButtonLink label="All accounts" to={spendingHref('accounts', params)} />} title="By account">
              {accounts.error ? (
                <LoadError compact error={accounts.error} onRetry={accounts.reload} />
              ) : !openAccounts?.length ? (
                <Hint>No accounts yet. Add your bank accounts, cards and wallets under Accounts to follow their balances here.</Hint>
              ) : (
                <ul className="panel-rows">
                  {openAccounts.map((account) => (
                    <ListRow
                      href={`/spending/transactions?account=${account.id}`}
                      key={account.id}
                      meta={accountKindOptions.find((option) => option.value === account.kind)?.label}
                      title={account.name}
                      trail={<AccountBalance account={account} />}
                    />
                  ))}
                </ul>
              )}
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
                          <AccountBalance account={account} />
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

          {tab === 'overview' && (
            <Section title="By category">
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

          {tab === 'overview' && (
            <Section action={shown.expenses.length > recentCount && <ButtonLink label="All transactions" to={spendingHref('transactions', params)} />} title="Recent">
              {shown.expenses.length === 0 ? <Hint>No transactions this month yet.</Hint> : expenseRows(shown.expenses.slice(0, recentCount))}
            </Section>
          )}

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

      {spaceId && typeof dialog === 'object' && 'capture' in dialog && (
        <ExpenseEditor
          accounts={accounts.data ?? []}
          capture={dialog.capture}
          currency={currency}
          onClose={() => setDialog(undefined)}
          onSaved={reload}
          reportParsing={dialog.report}
          spaceId={spaceId}
        />
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
      {typeof dialog === 'object' && 'ignoreAlways' in dialog && (
        <ConfirmDialog
          busyLabel="Ignoring…"
          confirmLabel="Always ignore"
          errorFallback={`Could not ignore the ${dialog.by}`}
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/captures/${dialog.ignoreAlways.id}/ignore`, { method: 'POST', body: JSON.stringify({ always: dialog.by }) });
            reload();
            action.report(`Ignored ${ignoredName(dialog)} from now on.`);
          }}
          title={`Always ignore ${ignoredName(dialog)}?`}
          tone="danger"
        >
          This message and every later one {dialog.by === 'sender' ? 'from' : 'naming'} {ignoredName(dialog)} are skipped. You can delete the rule under Edit rules.
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
    </SpendingFrame>
  );
}

const ignoredName = ({ ignoreAlways, by }: { ignoreAlways: CapturedMessage; by: 'sender' | 'merchant' }) => (by === 'sender' ? ignoreAlways.sender : ignoreAlways.suggestion.merchant);

function quickAdd({ receivedAt, sender, suggestion }: CapturedMessage) {
  const { amountMinor, currency, direction, transfer } = suggestion;
  if (amountMinor === null || !currency || !direction) return null;
  const base = { title: suggestion.title ?? suggestion.merchant ?? sender, amountMinor, currency, spentOn: suggestion.occurredOn ?? dayKey(new Date(receivedAt)), merchant: suggestion.merchant };
  if (transfer) return { ...base, direction: 'transfer', accountId: transfer.fromAccountId, toAccountId: transfer.toAccountId, remember: true };
  if (direction !== 'received' && !suggestion.category) return null;
  return {
    ...base,
    direction,
    ...(direction === 'received' ? {} : { category: suggestion.category }),
    accountId: suggestion.accountId,
    cardDigits: suggestion.cardDigits,
    ...(suggestion.paymentLabel ? { paymentLabel: suggestion.paymentLabel } : {}),
  };
}

function AccountBalance({ account }: { account: MoneyAccount }) {
  return (
    <Amount currency={account.currency} minor={account.kind === 'credit_card' ? Math.max(0, -account.balanceMinor) : account.balanceMinor}>
      {account.kind === 'credit_card' && ' owed'}
    </Amount>
  );
}

function ReviewCard({
  accountName,
  editable,
  message,
  onAdd,
  onEdit,
  onIgnore,
  onToggleMessage,
  opened,
}: {
  accountName: (id: string | null) => string | undefined;
  editable: boolean;
  message: CapturedMessage;
  onAdd: (ready: NonNullable<ReturnType<typeof quickAdd>>) => void;
  onEdit: (report: boolean) => void;
  onIgnore: (by?: 'sender' | 'merchant') => void;
  onToggleMessage: () => void;
  opened: boolean;
}) {
  const suggested = message.suggestion;
  const name = suggested.title ?? suggested.merchant ?? message.sender;
  const ready = quickAdd(message);
  const fields = [
    ...(suggested.transfer
      ? [
          ['From', accountName(suggested.transfer.fromAccountId) ?? 'Removed account'],
          ['To', accountName(suggested.transfer.toAccountId) ?? 'Removed account'],
        ]
      : [
          ['Account', accountName(suggested.accountId) ?? 'Not matched'],
          ['Category', suggested.direction === 'received' ? 'Income' : suggested.category ? categoryName(suggested.category) : 'Not set'],
        ]),
    ...(suggested.cardDigits ? [['Card', `•••• ${suggested.cardDigits}`]] : []),
    ...(suggested.paymentLabel ? [['Paid with', suggested.paymentLabel]] : []),
    ['Sender', message.sender],
  ];

  return (
    <Card as="li" className="gap-3" padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <p className="m-0 truncate text-body text-ink" dir="auto">
            {name}
          </p>
          <p className="m-0 text-small text-muted">
            {[formatDate(suggested.occurredOn ?? dayKey(new Date(message.receivedAt))), suggested.transfer && 'Transfer between your accounts?'].filter(Boolean).join(' · ')}
          </p>
        </div>
        {suggested.amountMinor !== null && suggested.currency ? (
          <span className="text-h3">
            <Amount currency={suggested.currency} direction={suggested.direction} minor={suggested.amountMinor} />
          </span>
        ) : (
          <span className="shrink-0 text-small text-muted">No amount</span>
        )}
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-small">
        {fields.map(([label, value]) => (
          <div className="grid min-w-0" key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 truncate text-ink" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {opened && (
        <p className="m-0 rounded-field border border-line-soft p-3 text-small text-muted" dir="auto">
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {editable && <Button label={ready ? 'Add' : 'Review and add'} onClick={() => (ready ? onAdd(ready) : onEdit(false))} primary={Boolean(ready)} />}
        <TextButton label={opened ? 'Hide message' : 'Show message'} onClick={onToggleMessage} />
        {editable && (
          <span className="ms-auto">
            <ActionsMenu
              items={[
                { label: 'Edit and add', onSelect: () => onEdit(false) },
                { label: 'Report parsing', onSelect: () => onEdit(true) },
                { label: 'Ignore', separated: true, onSelect: () => onIgnore() },
                ...(suggested.merchant ? [{ label: `Always ignore ${suggested.merchant}`, onSelect: () => onIgnore('merchant') }] : []),
                { label: `Always ignore ${message.sender}`, onSelect: () => onIgnore('sender') },
              ]}
              name={name}
            />
          </span>
        )}
      </div>
    </Card>
  );
}

function SpendingSkeleton({ editable, shape, tab }: { editable: boolean; shape: number[]; tab: 'overview' | 'accounts' | 'budgets' }) {
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
    const [budgeted = 0, budgetRows = 0] = shape;
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
      </>
    );
  }
  const [budgeted = 0, reviewCards = 0, accountRows = 0, chartParts = 0, recentRows = 0] = shape;
  return (
    <>
      <StatGrid>
        {rowsOf(budgeted ? 4 : 2).map((stat) => (
          <Stat
            detail={stat === 0 || stat === (budgeted ? 3 : 1) ? <SkeletonLine width="w-40 max-w-full" /> : undefined}
            key={stat}
            label={<SkeletonLine width="w-24" />}
            meter={budgeted > 0 && stat === 1 && <Skeleton className="h-1.5 rounded-full" />}
            value={<SkeletonLine width="w-32" />}
          />
        ))}
      </StatGrid>
      {reviewCards > 0 && (
        <Section title={`To review (${reviewCards})`}>
          <ul aria-hidden="true" className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {rowsOf(reviewCards).map((row) => (
              <Card as="li" className="gap-3" key={row} padding="sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <SkeletonLine width="w-40" />
                    <SkeletonLine className="text-small" width="w-24" />
                  </div>
                  <SkeletonLine className="text-h3" width="w-20" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-small">
                  {rowsOf(4).map((field) => (
                    <div className="grid" key={field}>
                      <SkeletonLine width="w-14" />
                      <SkeletonLine width="w-24" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {editable && <ButtonSkeleton width="w-14" />}
                  <ButtonSkeleton width="w-28" />
                </div>
              </Card>
            ))}
          </ul>
        </Section>
      )}
      <Section action={accountRows > 0 && <ButtonSkeleton width="w-28" />} title="By account">
        {accountRows ? <AmountRowsSkeleton rows={accountRows} /> : <HintSkeleton />}
      </Section>
      <Section title="By category">
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
      <Hint>
        Months start on {plan.startDay === 1 ? 'the 1st' : `day ${plan.startDay}`}. Change it in <TextLink href="/settings">Settings › Profile</TextLink>.
      </Hint>
      <Toggle checked={rollover} label="Carry what’s left into next month" onChange={setRollover} />
    </FormDialog>
  );
}
