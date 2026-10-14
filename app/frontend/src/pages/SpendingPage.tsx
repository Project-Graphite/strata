import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, formatDay, Icon, ListSkeleton, Menu, Meter, Select, TextField, Toggle } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { allCurrencies, currencyOptions } from '../choices';
import { AccountEditor } from '../components/AccountEditor';
import { CategoriesEditor } from '../components/CategoriesEditor';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { ExpenseImport } from '../components/ExpenseImport';
import { InstallmentEditor } from '../components/InstallmentEditor';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section, Toolbar } from '../components/Page';
import { PhoneSetup } from '../components/PhoneSetup';
import { SplitEditor } from '../components/SplitEditor';
import {
  accountKindOptions,
  categoryName,
  categoryOptions,
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
import { spaceOptions, useSpaces, type Member } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { moneyAmount, required, useFormErrors } from '../validation';

const shiftMonth = (month: string, by: number) => {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return date.toISOString().slice(0, 7);
};
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function SpendingPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const action = useAction();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : null;
  const spaceId = params.get('space') ?? spaces.data?.find((space) => space.kind === 'personal')?.id;
  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
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
        editable && (
          <>
            <HeaderButton label="Connect your phone" onClick={() => setDialog('phone')} />
            <HeaderButton icon="upload" label="Import a statement" onClick={() => setDialog('import')} />
            <HeaderButton icon="plus" label="Add expense" onClick={() => setDialog('new')} primary />
          </>
        )
      }
      title="Spending"
    >
      <Toolbar
        actions={
          (spaces.data?.length ?? 0) > 1 && spaceId && <Select aria-label="Space" onChange={(chosen) => go({ space: chosen })} options={spaceOptions(spaces.data ?? [])} size="small" value={spaceId} />
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button aria-label="Previous month" className="icon-button" disabled={!shown} onClick={() => go({ month: shiftMonth(shown!.month, -1) })} type="button">
            <Icon name="chevron-left" size={18} />
          </button>
          <button aria-label="Next month" className="icon-button" disabled={!shown} onClick={() => go({ month: shiftMonth(shown!.month, 1) })} type="button">
            <Icon name="chevron-right" size={18} />
          </button>
          <button
            className="secondary-button px-3 py-2 text-sm"
            onClick={() =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.delete('month');
                return next;
              })
            }
            type="button"
          >
            This month
          </button>
          {shown && (
            <h2 className="m-0 ml-2 text-lg font-medium">
              {shown.plan.startDay === 1
                ? monthName.format(new Date(`${shown.month}-01T00:00:00Z`))
                : `${formatDay(shown.from, { day: 'numeric', month: 'short' })} – ${formatDay(shown.until, { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </h2>
          )}
        </div>
      </Toolbar>

      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !shown ? (
        <ListSkeleton label="Adding up the month" rows={5} />
      ) : (
        <>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
            {[
              ['Spent', money(shown.spentMinor, currency)],
              ['Received', money(shown.receivedMinor, currency)],
              ['Budget', shown.budgetMinor === null ? 'None set' : `${money(Math.max(0, shown.budgetMinor - shown.spentMinor), currency)} left of ${money(shown.budgetMinor, currency)}`],
              ...(shown.safeDailyMinor === null ? [] : [['Safe to spend a day', money(shown.safeDailyMinor, currency)]]),
              ['Renewals this month', money(shown.committedMinor, currency)],
            ].map(([label, value]) => (
              <div className="rounded-xl border border-line p-4" key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="m-0 mt-1 text-lg text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {shown.budgetMinor !== null && <Meter label="Spent of the whole budget" value={shown.budgetMinor ? shown.spentMinor / shown.budgetMinor : 1} />}
          {shown.missing.length > 0 && (
            <p className="notice m-0">There is no exchange rate for {shown.missing.join(', ')} yet, so those amounts are left out of the totals.</p>
          )}

          {Boolean(captures.data?.length) && (
            <Section title={`To review (${captures.data!.length})`}>
              <ul className="panel-rows">
                {captures.data!.map((message) => (
                  <li className="panel-row flex items-center gap-3" key={message.id}>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-ink">{message.suggestion.merchant ?? message.sender}</span>
                      <span className="truncate text-sm text-muted">{message.text}</span>
                    </span>
                    {message.suggestion.amountMinor !== null && message.suggestion.currency && (
                      <span className="shrink-0 text-ink">{money(message.suggestion.amountMinor, message.suggestion.currency)}</span>
                    )}
                    {editable && (
                      <>
                        <button className="secondary-button px-3 py-2 text-sm" onClick={() => setDialog({ capture: message })} type="button">
                          Add
                        </button>
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

          {(editable || Boolean(accounts.data?.length)) && (
            <Section action={editable && <HeaderButton label="Add account" onClick={() => setDialog({ account: null })} />} title="Accounts">
              {!accounts.data?.length ? (
                <p className="m-0 text-sm text-muted">No accounts yet.</p>
              ) : (
                <ul className="panel-rows">
                  {accounts.data.map((account) => (
                    <li className="panel-row flex items-center gap-3" key={account.id}>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-ink">{account.name}</span>
                        <span className="truncate text-sm text-muted">
                          {[accountKindOptions.find((option) => option.value === account.kind)?.label, ...account.cardDigits.map((digits) => `•••• ${digits}`)].join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-ink">
                        {account.kind === 'credit' ? `${money(Math.max(0, -account.balanceMinor), account.currency)} owed` : money(account.balanceMinor, account.currency)}
                      </span>
                      {editable && (
                        <Menu
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
                          label={`${account.name} actions`}
                          trigger={<Icon name="more" size={18} />}
                          triggerClassName="icon-button"
                          triggerLabel={`Actions for ${account.name}`}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {(editable || Boolean(installments.data?.length)) && (
            <Section action={editable && <HeaderButton label="Add plan" onClick={() => setDialog({ installment: null })} />} title="Installments">
              {!installments.data?.length ? (
                <p className="m-0 text-sm text-muted">No installment plans.</p>
              ) : (
                <ul className="panel-rows">
                  {installments.data.map((plan) => (
                    <li className="panel-row grid gap-2" key={plan.id}>
                      <span className="flex items-center gap-3">
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-ink">{plan.name}</span>
                          <span className={plan.status === 'missed' ? 'truncate text-sm text-danger' : 'truncate text-sm text-muted'}>
                            {plan.status === 'done'
                              ? 'Paid off'
                              : `${plan.status === 'missed' ? 'Missed' : 'Next'}: ${money(plan.monthlyMinor, plan.currency)} on ${formatDay(plan.nextDueOn!, { day: 'numeric', month: 'short' })} · ${money(plan.remainingMinor, plan.currency)} left`}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm text-muted">
                          {plan.paidCount} of {plan.count}
                        </span>
                        {editable && (
                          <Menu
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
                            label={`${plan.name} actions`}
                            trigger={<Icon name="more" size={18} />}
                            triggerClassName="icon-button"
                            triggerLabel={`Actions for ${plan.name}`}
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

          {Boolean(rules.data?.length) && (
            <Section title="Merchant rules">
              <ul className="panel-rows">
                {rules.data!.map((rule) => (
                  <li className="panel-row flex items-center gap-3" key={rule.id}>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-ink">{rule.match}</span>
                      <span className="truncate text-sm text-muted">
                        {rule.ignore ? 'Ignored' : [rule.rename, rule.category && categoryName(rule.category)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
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

          <Section
            action={
              editable && (
                <span className="flex gap-2">
                  <HeaderButton label="Budget settings" onClick={() => setDialog('plan')} />
                  <HeaderButton label="Edit categories" onClick={() => setDialog('categories')} />
                  <HeaderButton label="Set a budget" onClick={() => setDialog({ budget: null })} />
                </span>
              )
            }
            title="By category"
          >
            {shown.categories.length === 0 ? (
              <p className="m-0 text-sm text-muted">Nothing spent this month yet.</p>
            ) : (
              <ul className="panel-rows">
                {shown.categories.map((row) => (
                  <li className="panel-row grid gap-2" key={row.category}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-ink">
                        <span aria-hidden="true" className={`swatch-dot tag-${colourOf(row.category)}`} />
                        {categoryName(row.category)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-muted">
                          {row.budgetMinor === null ? money(row.spentMinor, currency) : `${money(row.spentMinor, currency)} of ${money(row.budgetMinor, currency)}`}
                          {row.carriedMinor !== 0 && `, ${money(row.carriedMinor, currency)} carried over`}
                        </span>
                        {editable && (
                          <Menu
                            items={[
                              { label: row.budgetMinor === null ? 'Set a budget' : 'Change the budget', onSelect: () => setDialog({ budget: row.category }) },
                              ...(row.budgetMinor === null
                                ? []
                                : [
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
                                  ]),
                            ]}
                            label={`${categoryName(row.category)} actions`}
                            trigger={<Icon name="more" size={18} />}
                            triggerClassName="icon-button"
                            triggerLabel={`Actions for ${categoryName(row.category)}`}
                          />
                        )}
                      </span>
                    </span>
                    {row.budgetMinor !== null && <Meter label={`${categoryName(row.category)} spent of budget`} value={row.budgetMinor ? row.spentMinor / row.budgetMinor : 1} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Transactions">
            {shown.expenses.length === 0 ? (
              <EmptyState title="Nothing this month">
              </EmptyState>
            ) : (
              <ul className="panel-rows">
                {shown.expenses.map((expense) => (
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
                      <Menu
                        items={[{ label: expense.split ? 'Change the split' : 'Split it', onSelect: () => setDialog({ split: expense }) }]}
                        label={`${expense.title} actions`}
                        trigger={<Icon name="more" size={18} />}
                        triggerClassName="icon-button"
                        triggerLabel={`Actions for ${expense.title}`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
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
      {!category && <Select label="Category" onChange={setChosen} options={categoryOptions(categories)} value={chosen} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField autoFocus defaultValue={existing ? fromMinor(existing.amountMinor, existing.currency) : ''} inputMode="decimal" key={chosen} label="Each month" {...form.field('amount')} />
        <Select label="Currency" onChange={setChosenCurrency} options={currencyOptions(allCurrencies)} searchable value={chosenCurrency} />
      </div>
    </FormDialog>
  );
}

function PlanDialog({ currency, onClose, onSaved, plan, spaceId }: { currency: string; onClose: () => void; onSaved: () => void; plan: SpendingPlan; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [chosenCurrency, setChosenCurrency] = useState(plan.currency ?? currency);
  const [startDay, setStartDay] = useState(String(plan.startDay));
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
          startDay: Number(startDay),
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
        <Select label="Currency" onChange={setChosenCurrency} options={currencyOptions(allCurrencies)} searchable value={chosenCurrency} />
      </div>
      <Select
        label="Months start on"
        onChange={setStartDay}
        options={Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1), label: index === 0 ? 'The 1st' : `Day ${index + 1}` }))}
        value={startDay}
      />
      <Toggle checked={rollover} label="Carry what is left into next month" onChange={setRollover} />
    </FormDialog>
  );
}
