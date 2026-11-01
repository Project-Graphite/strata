import { useState } from 'react';
import { DatePicker, Select, SuggestField, TextField } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { useAuth } from '../auth';
import { catalogue, knownService } from '../catalogue';
import { billingCycles, categories, categoryLabel, fromMinor, toMinor, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, type Check, moneyAmount, notCardNumber, required, useFormErrors } from '../validation';
import { CurrencyField } from './CurrencyField';
import { FormDialog } from './FormDialog';

const linkCheck: Check = (value) => (!value.trim() || /^https:\/\/\S+$/.test(value.trim()) ? undefined : 'Use an https:// link.');

export function SubscriptionEditor({
  onClose,
  onSaved,
  spaceId,
  subscription,
}: {
  onClose: () => void;
  onSaved: (subscription: Subscription) => void;
  spaceId: string;
  subscription?: Subscription;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [category, setCategory] = useState(subscription?.category ?? 'other');
  const [cancelUrl, setCancelUrl] = useState(subscription?.cancelUrl ?? '');
  const customCycle = subscription && !billingCycles.some(([value]) => value === subscription.repeatRule);
  const today = dayKey(new Date());

  function fillKnown(name: string) {
    const known = knownService(name);
    if (!known || subscription) return;
    if (category === 'other') setCategory(known.category);
    if (!cancelUrl) setCancelUrl(known.cancelUrl);
  }

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={subscription ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            name: [required('Name it.'), atMost(100, 'Use at most 100 characters.')],
            amount: [required('Enter the price.'), moneyAmount],
            currency: [required('Enter a currency.'), (value) => (/^[a-z]{3}$/i.test(value.trim()) ? undefined : 'Use a three-letter code such as EUR.')],
            paymentLabel: [atMost(40, 'Use at most 40 characters.'), notCardNumber],
            cancelUrl: [linkCheck],
          })
        ) {
          return;
        }
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim();
        const currency = text('currency').toUpperCase();
        const reminder = text('reminderDays');
        void saving
          .run(async () => {
            const saved = await auth.request<Subscription>(
              subscription ? `/subscriptions/${subscription.id}` : `/spaces/${text('spaceId') || spaceId}/subscriptions`,
              {
                method: subscription ? 'PATCH' : 'POST',
                body: JSON.stringify({
                  name: text('name'),
                  amountMinor: toMinor(text('amount'), currency),
                  currency,
                  repeatRule: text('repeatRule'),
                  startDate: text('startDate'),
                  trialEndsOn: text('trialEndsOn') || null,
                  category: text('category'),
                  paymentLabel: text('paymentLabel') || null,
                  cancelUrl: text('cancelUrl') || null,
                  usedBy: text('usedBy') || null,
                  reminderDays: reminder ? Number(reminder) : null,
                }),
              },
            );
            onSaved(saved);
            return `${subscription ? 'Saved' : 'Added'} ${saved.name}.`;
          }, 'Could not save the subscription')
          .then((saved) => saved && onClose());
      }}
      submitLabel={subscription ? 'Save changes' : 'Add subscription'}
      title={subscription ? 'Edit subscription' : 'New subscription'}
    >
      <SuggestField
        defaultValue={subscription?.name}
        label="Name"
        maxLength={100}
        suggestions={catalogue.map((service) => service.name)}
        {...form.field('name')}
        onInput={(event) => {
          form.field('name').onInput();
          fillKnown(event.currentTarget.value);
        }}
        onPick={fillKnown}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          defaultValue={subscription ? fromMinor(subscription.amountMinor, subscription.currency) : ''}
          inputMode="decimal"
          label="Price"
          {...form.field('amount')}
        />
        <CurrencyField defaultValue={subscription?.currency ?? 'EGP'} name="currency" />
        <Select
          defaultValue={subscription?.repeatRule ?? 'FREQ=MONTHLY'}
          label="Billed"
          name="repeatRule"
          options={[
            ...billingCycles.map(([value, label]) => ({ value: value as string, label: label as string })),
            ...(customCycle ? [{ value: subscription.repeatRule, label: 'Custom cycle' }] : []),
          ]}
        />
        <DatePicker defaultValue={subscription?.startDate ?? today} label="First payment" name="startDate" optional={false} />
        <DatePicker defaultValue={subscription?.trialEndsOn ?? ''} label="Free trial ends" name="trialEndsOn" placeholder="No trial" />
        <Select
          defaultValue={subscription?.reminderDays == null ? '' : String(subscription.reminderDays)}
          label="Remind me"
          name="reminderDays"
          options={[
            { value: '', label: 'Never' },
            { value: '0', label: 'On the day' },
            { value: '1', label: '1 day before' },
            { value: '3', label: '3 days before' },
            { value: '7', label: 'A week before' },
          ]}
        />
      </div>
      <Select
        label="Category"
        name="category"
        onChange={setCategory}
        options={categories.map((value) => ({ value, label: categoryLabel(value) }))}
        value={category}
      />
      <TextField
        defaultValue={subscription?.paymentLabel ?? ''}
        label="Paid with"
        maxLength={40}
        {...form.field('paymentLabel')}
      />
      <TextField
        inputMode="url"
        label="Cancel link"
        {...form.field('cancelUrl')}
        onChange={(event) => setCancelUrl(event.currentTarget.value)}
        value={cancelUrl}
      />
      <TextField defaultValue={subscription?.usedBy ?? ''} label="Who uses it" maxLength={200} name="usedBy" />
    </FormDialog>
  );
}
