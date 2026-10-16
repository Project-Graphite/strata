import { useState } from 'react';
import { DatePicker, Select, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { directionOptions, useCategories, type CapturedMessage, type Expense, type ExpenseDirection, type MoneyAccount } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, moneyAmount, notCardNumber, required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';
import { CategoryChips } from './CategoryChips';
import { CurrencyField } from './CurrencyField';


export function ExpenseEditor({
  accounts,
  capture,
  currency,
  expense,
  onClose,
  onSaved,
  onTrashed,
  spaceId,
}: {
  accounts: MoneyAccount[];
  capture?: CapturedMessage;
  currency: string;
  expense?: Expense;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
  onTrashed?: () => void;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const categories = useCategories(spaceId);
  const [category, setCategory] = useState(expense?.category ?? '');
  const chosenCategory = category || categories.data?.[0]?.name || 'other';
  const suggested = capture?.suggestion;
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? dayKey(capture ? new Date(capture.receivedAt) : new Date()));
  const [direction, setDirection] = useState<ExpenseDirection>(expense?.direction ?? suggested?.direction ?? 'spent');
  const [accountId, setAccountId] = useState(expense?.accountId ?? suggested?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(expense?.toAccountId ?? '');
  const transfer = direction === 'transfer';
  const accountOptions = [{ value: '', label: 'None' }, ...accounts.map((account) => ({ value: account.id, label: account.name }))];

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            title: [required('Say what it was for.'), atMost(200, 'Use at most 200 characters.')],
            amount: [required('Enter the amount.'), moneyAmount],
            paymentLabel: [atMost(40, 'Use at most 40 characters.'), notCardNumber],
          }) ||
          (transfer && !form.check(target, { from: [() => (accountId && toAccountId && accountId !== toAccountId ? undefined : 'Choose two different accounts.')] }))
        ) {
          return;
        }
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim();
        const chosen = text('currency');
        const body = {
          title: text('title'),
          amountMinor: toMinor(text('amount'), chosen),
          currency: chosen,
          spentOn,
          category: chosenCategory,
          paymentLabel: text('paymentLabel') || null,
          note: text('note'),
          direction,
          accountId: accountId || null,
          toAccountId: transfer ? toAccountId : null,
          ...(capture ? { merchant: suggested?.merchant ?? null, cardDigits: suggested?.cardDigits ?? null } : {}),
        };
        void saving
          .run(async () => {
            const saved = await auth.request<Expense>(expense ? `/expenses/${expense.id}` : capture ? `/captures/${capture.id}/record` : `/spaces/${spaceId}/expenses`, {
              method: expense ? 'PATCH' : 'POST',
              body: JSON.stringify(body),
            });
            if (suggested?.merchant && values.get('remember')) {
              await auth.request(`/spaces/${spaceId}/merchant-rules`, {
                method: 'POST',
                body: JSON.stringify({ match: suggested.merchant.toLowerCase(), rename: body.title, category: direction === 'received' || transfer ? null : chosenCategory }),
              });
            }
            onSaved(saved);
            return expense ? '' : 'Expense added.';
          }, 'Could not save the expense')
          .then((saved) => saved && onClose());
      }}
      submitLabel={expense ? 'Save' : 'Add expense'}
      title={expense ? 'Edit expense' : capture ? 'Add from message' : 'New expense'}
    >
      {capture && <blockquote className="m-0 rounded-lg border border-line p-3 text-sm text-muted">{capture.text}</blockquote>}
      <Select label="Type" onChange={setDirection} options={directionOptions.filter((option) => option.value !== 'transfer' || accounts.length > 1 || transfer)} value={direction} />
      <TextField autoComplete="off" autoFocus defaultValue={expense?.title ?? suggested?.merchant ?? undefined} label="What for" maxLength={200} placeholder="Groceries at the market" {...form.field('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          defaultValue={expense ? fromMinor(expense.amountMinor, expense.currency) : suggested?.amountMinor && suggested.currency ? fromMinor(suggested.amountMinor, suggested.currency) : ''}
          inputMode="decimal"
          label="Amount"
          {...form.field('amount')}
        />
        <CurrencyField defaultValue={expense?.currency ?? suggested?.currency ?? currency} name="currency" />
        <DatePicker label="Date" onChange={setSpentOn} optional={false} value={spentOn} />
        {accounts.length > 0 && (
          <Select error={form.errors.from} label={transfer ? 'From' : 'Account'} name="from" onChange={setAccountId} options={accountOptions} value={accountId} />
        )}
        {accounts.length > 0 && transfer && <Select label="To" onChange={setToAccountId} options={accountOptions} value={toAccountId} />}
      </div>
      {direction !== 'received' && !transfer && <CategoryChips categories={categories.data ?? []} onChange={setCategory} value={chosenCategory} />}
      {suggested?.merchant && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input defaultChecked name="remember" type="checkbox" />
          Always do this for {suggested.merchant}
        </label>
      )}
      {(accounts.length === 0 || expense?.paymentLabel) && (
        <TextField defaultValue={expense?.paymentLabel ?? ''} hint="Such as “Visa ending 1234”. Never a card number." label="Paid with (optional)" maxLength={40} {...form.field('paymentLabel')} />
      )}
      <TextAreaField defaultValue={expense?.note} label="Note (optional)" maxLength={1000} name="note" rows={2} />
      {expense && onTrashed && (
        <button
          className="text-button w-fit text-sm"
          disabled={saving.busy}
          onClick={() =>
            void saving
              .run(async () => {
                await auth.request(`/items/${expense.id}/trash`, { method: 'POST' });
                onTrashed();
                return `Moved ${expense.title} to the trash.`;
              }, 'Could not move the expense to the trash')
              .then((done) => done && onClose())
          }
          type="button"
        >
          Move to trash
        </button>
      )}
    </FormDialog>
  );
}
