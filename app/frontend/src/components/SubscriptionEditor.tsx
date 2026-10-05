import { Dialog, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { catalogue, knownService } from '../catalogue';
import { billingCycles, categories, fromMinor, toMinor, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors, type Check } from '../validation';

const amountCheck: Check = (value) =>
  /^\d+([.,]\d{1,3})?$/.test(value.trim()) ? undefined : 'Enter an amount such as 9.99.';
const labelCheck: Check = (value) => (/\d(?:[ -]?\d){4}/.test(value) ? 'Use a label such as "Visa ending 1234", never a card number.' : undefined);
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
  const customCycle = subscription && !billingCycles.some(([value]) => value === subscription.repeatRule);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog onClose={onClose} title={subscription ? `Edit ${subscription.name}` : 'New subscription'}>
      <form
        className="mt-5 grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (
            !form.check(target, {
              name: [required('Name it.'), atMost(100, 'Use at most 100 characters.')],
              amount: [required('Enter the price.'), amountCheck],
              currency: [required('Enter a currency.'), (value) => (/^[a-z]{3}$/i.test(value.trim()) ? undefined : 'Use a three-letter code such as EUR.')],
              paymentLabel: [atMost(40, 'Use at most 40 characters.'), labelCheck],
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
                subscription ? `/subscriptions/${subscription.id}` : `/spaces/${spaceId}/subscriptions`,
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
              return '';
            }, 'Could not save the subscription')
            .then((saved) => saved && onClose());
        }}
      >
        <TextField
          autoComplete="off"
          defaultValue={subscription?.name}
          label="Name"
          list="known-services"
          maxLength={100}
          {...form.field('name')}
          onInput={(event) => {
            form.field('name').onInput();
            const known = knownService(event.currentTarget.value);
            const fields = event.currentTarget.form?.elements;
            if (!known || subscription || !fields) return;
            const category = fields.namedItem('category');
            const cancelUrl = fields.namedItem('cancelUrl');
            if (category instanceof HTMLSelectElement && category.value === 'other') category.value = known.category;
            if (cancelUrl instanceof HTMLInputElement && !cancelUrl.value) cancelUrl.value = known.cancelUrl;
          }}
        />
        <datalist id="known-services">
          {catalogue.map((service) => (
            <option key={service.name} value={service.name} />
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            defaultValue={subscription ? fromMinor(subscription.amountMinor, subscription.currency) : ''}
            inputMode="decimal"
            label="Price"
            {...form.field('amount')}
          />
          <TextField
            autoCapitalize="characters"
            defaultValue={subscription?.currency ?? 'EUR'}
            label="Currency"
            maxLength={3}
            {...form.field('currency')}
          />
          <label className="field-label">
            Billed
            <select defaultValue={subscription?.repeatRule ?? 'FREQ=MONTHLY'} name="repeatRule">
              {billingCycles.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {customCycle && <option value={subscription.repeatRule}>Custom ({subscription.repeatRule})</option>}
            </select>
          </label>
          <label className="field-label">
            First payment
            <input defaultValue={subscription?.startDate ?? today} name="startDate" type="date" />
          </label>
          <label className="field-label">
            Free trial ends
            <input defaultValue={subscription?.trialEndsOn ?? ''} name="trialEndsOn" type="date" />
          </label>
          <label className="field-label">
            Remind me
            <select defaultValue={subscription?.reminderDays === null || !subscription ? '' : String(subscription.reminderDays)} name="reminderDays">
              <option value="">Never</option>
              <option value="0">On the day</option>
              <option value="1">1 day before</option>
              <option value="3">3 days before</option>
              <option value="7">A week before</option>
            </select>
          </label>
        </div>
        <label className="field-label">
          Category
          <select defaultValue={subscription?.category ?? 'other'} name="category">
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <TextField
          defaultValue={subscription?.paymentLabel ?? ''}
          hint="A label only, for example “Visa ending 1234”. Card details are never stored."
          label="Paid with"
          maxLength={40}
          {...form.field('paymentLabel')}
        />
        <TextField defaultValue={subscription?.cancelUrl ?? ''} inputMode="url" label="Cancel link" {...form.field('cancelUrl')} />
        <TextField defaultValue={subscription?.usedBy ?? ''} label="Who uses it" maxLength={200} name="usedBy" />
        <div className="flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={saving.busy} type="submit">
            {saving.busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
