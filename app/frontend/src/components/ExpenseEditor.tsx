import { useState } from 'react';
import { DatePicker, Select, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { allCurrencies, currencyOptions } from '../choices';
import { categoryOptions, type Expense, type SpendingCategory } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, moneyAmount, notCardNumber, required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';


export function ExpenseEditor({
  currency,
  expense,
  onClose,
  onSaved,
  onTrashed,
  spaceId,
}: {
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
          })
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
      <TextField autoComplete="off" autoFocus defaultValue={expense?.title} label="What for" maxLength={200} placeholder="Groceries at the market" {...form.field('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField defaultValue={expense ? fromMinor(expense.amountMinor, expense.currency) : ''} inputMode="decimal" label="Amount" {...form.field('amount')} />
        <Select defaultValue={expense?.currency ?? currency} label="Currency" name="currency" options={currencyOptions(allCurrencies)} searchable />
        <DatePicker label="Date" onChange={setSpentOn} optional={false} value={spentOn} />
        <Select label="Category" onChange={setCategory} options={categoryOptions} value={category} />
      </div>
      <TextField defaultValue={expense?.paymentLabel ?? ''} hint="Such as “Visa ending 1234”. Never a card number." label="Paid with (optional)" maxLength={40} {...form.field('paymentLabel')} />
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
