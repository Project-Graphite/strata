import { useState } from 'react';
import { DatePicker, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import type { InstallmentPlan, MoneyAccount } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, moneyAmount, required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';
import { CurrencyField } from './CurrencyField';

const wholeMonths = (value: string) => (/^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 120 ? undefined : 'Enter 1 to 120 months.');

export function InstallmentEditor({
  accounts,
  currency,
  onClose,
  onSaved,
  plan,
  spaceId,
}: {
  accounts: MoneyAccount[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  plan?: InstallmentPlan;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [chosenCurrency, setChosenCurrency] = useState(plan?.currency ?? currency);
  const [firstDueOn, setFirstDueOn] = useState(plan?.firstDueOn ?? dayKey(new Date()));
  const [accountId, setAccountId] = useState(plan?.accountId ?? '');

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={plan ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            name: [required('Name the plan.'), atMost(120, 'Use at most 120 characters.')],
            monthly: [required('Enter the monthly payment.'), moneyAmount],
            count: [wholeMonths],
          })
        ) {
          return;
        }
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim();
        const body = {
          name: text('name'),
          currency: chosenCurrency,
          monthlyMinor: toMinor(text('monthly'), chosenCurrency),
          count: Number(text('count')),
          firstDueOn,
          accountId: accountId || null,
        };
        void saving
          .run(async () => {
            await auth.request(plan ? `/installments/${plan.id}` : `/spaces/${spaceId}/installments`, { method: plan ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            onSaved();
            return `${plan ? 'Saved' : 'Added'} ${body.name}.`;
          }, 'Could not save the plan')
          .then((saved) => saved && onClose());
      }}
      submitLabel={plan ? 'Save' : 'Add plan'}
      title={plan ? 'Edit installment plan' : 'New installment plan'}
    >
      <TextField autoComplete="off" autoFocus defaultValue={plan?.name} label="Name" maxLength={120} placeholder="valU phone" {...form.field('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField defaultValue={plan ? fromMinor(plan.monthlyMinor, plan.currency) : ''} inputMode="decimal" label="Each month" {...form.field('monthly')} />
        <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
        <TextField defaultValue={plan ? String(plan.count) : '12'} inputMode="numeric" label="Months" {...form.field('count')} />
        <DatePicker label="First payment" onChange={setFirstDueOn} optional={false} value={firstDueOn} />
      </div>
      {accounts.length > 0 && (
        <Select label="Paid from" onChange={setAccountId} options={[{ value: '', label: 'None' }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]} value={accountId} />
      )}
    </FormDialog>
  );
}
