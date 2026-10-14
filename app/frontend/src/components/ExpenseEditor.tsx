import { useState } from 'react';
import { DatePicker, Select, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { allCurrencies, currencyOptions } from '../choices';
import { categoryOptions, directionOptions, type Expense, type ExpenseDirection, type MoneyAccount, type SpendingCategory } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, moneyAmount, notCardNumber, required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';


export function ExpenseEditor({
  accounts,
  currency,
  expense,
  onClose,
  onSaved,
  onTrashed,
  spaceId,
}: {
  accounts: MoneyAccount[];
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
  const [category, setCategory] = useState<SpendingCategory>(expense?.category ?? 'groceries');
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? dayKey(new Date()));
  const [direction, setDirection] = useState<ExpenseDirection>(expense?.direction ?? 'spent');
  const [accountId, setAccountId] = useState(expense?.accountId ?? '');
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
          category,
          paymentLabel: text('paymentLabel') || null,
          note: text('note'),
          direction,
          accountId: accountId || null,
          toAccountId: transfer ? toAccountId : null,
        };
        void saving
          .run(async () => {
            onSaved(
              await auth.request<Expense>(expense ? `/expenses/${expense.id}` : `/spaces/${spaceId}/expenses`, {
                method: expense ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
              }),
            );
            return expense ? '' : 'Expense added.';
          }, 'Could not save the expense')
          .then((saved) => saved && onClose());
      }}
      submitLabel={expense ? 'Save' : 'Add expense'}
      title={expense ? 'Edit expense' : 'New expense'}
    >
      <Select label="Type" onChange={setDirection} options={directionOptions.filter((option) => option.value !== 'transfer' || accounts.length > 1 || transfer)} value={direction} />
      <TextField autoComplete="off" autoFocus defaultValue={expense?.title} label="What for" maxLength={200} placeholder="Groceries at the market" {...form.field('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField defaultValue={expense ? fromMinor(expense.amountMinor, expense.currency) : ''} inputMode="decimal" label="Amount" {...form.field('amount')} />
        <Select defaultValue={expense?.currency ?? currency} label="Currency" name="currency" options={currencyOptions(allCurrencies)} searchable />
        <DatePicker label="Date" onChange={setSpentOn} optional={false} value={spentOn} />
        {direction !== 'received' && !transfer && <Select label="Category" onChange={setCategory} options={categoryOptions} value={category} />}
        {accounts.length > 0 && (
          <Select error={form.errors.from} label={transfer ? 'From' : 'Account'} name="from" onChange={setAccountId} options={accountOptions} value={accountId} />
        )}
        {accounts.length > 0 && transfer && <Select label="To" onChange={setToAccountId} options={accountOptions} value={toAccountId} />}
      </div>
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
