import { useState } from 'react';
import { DatePicker, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { spaceOptions, type Space } from '../spaces';
import { fromMinor, toMinor } from '../subscriptions';
import type { Trip } from '../trips';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, moneyAmount, required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';
import { CurrencyField } from './CurrencyField';

export function TripEditor({ onClose, onSaved, spaces, trip }: { onClose: () => void; onSaved: (trip: Trip) => void; spaces: Space[]; trip?: Trip }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [startsOn, setStartsOn] = useState(trip?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(trip?.endsOn ?? '');
  const [datesError, setDatesError] = useState<string>();
  const me = useResource<{ homeCurrency: string | null }>('/me', true);
  const [chosenCurrency, setBudgetCurrency] = useState<string>();
  const budgetCurrency = chosenCurrency ?? trip?.currency ?? me.data?.homeCurrency ?? 'EUR';

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={trip ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        const valid = form.check(target, {
          title: [required('Name the trip.'), atMost(200, 'Use at most 200 characters.')],
          budget: [(value) => (value.trim() ? moneyAmount(value) : undefined)],
        });
        const dates = !startsOn || !endsOn ? 'Choose when the trip starts and ends.' : endsOn < startsOn ? 'The trip cannot end before it starts.' : undefined;
        setDatesError(dates);
        if (!valid || dates) return;
        const values = new FormData(target);
        const budget = String(values.get('budget') ?? '').trim();
        const body = {
          title: String(values.get('title')).trim(),
          destination: String(values.get('destination') ?? '').trim(),
          startsOn,
          endsOn,
          budgetMinor: budget ? toMinor(budget, budgetCurrency) : null,
          currency: budget ? budgetCurrency : null,
        };
        void saving
          .run(async () => {
            onSaved(
              await auth.request<Trip>(trip ? `/trips/${trip.id}` : `/spaces/${String(values.get('spaceId'))}/trips`, {
                method: trip ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
              }),
            );
            return trip ? `Saved ${body.title}.` : `Added ${body.title}, with a packing list ready.`;
          }, 'Could not save the trip')
          .then((saved) => saved && onClose());
      }}
      submitLabel={trip ? 'Save' : 'Add trip'}
      title={trip ? 'Edit trip' : 'New trip'}
    >
      <TextField autoFocus defaultValue={trip?.title} label="Trip" maxLength={200} placeholder="Lisbon in May" {...form.field('title')} />
      {!trip && spaces.length > 1 && (
        <Select
          defaultValue={spaces.find((space) => space.kind === 'personal')?.id ?? spaces[0]!.id}
          label="Space"
          name="spaceId"
          options={spaceOptions(spaces)}
        />
      )}
      {!trip && spaces.length === 1 && <input name="spaceId" type="hidden" value={spaces[0]!.id} />}
      <TextField defaultValue={trip?.destination} label="Destination (optional)" maxLength={200} name="destination" placeholder="Lisbon, Portugal" />
      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker error={datesError} label="From" onChange={setStartsOn} optional={false} value={startsOn} />
        <DatePicker label="Until" min={startsOn || undefined} onChange={setEndsOn} optional={false} value={endsOn} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField defaultValue={trip?.budgetMinor != null && trip.currency ? fromMinor(trip.budgetMinor, trip.currency) : ''} inputMode="decimal" label="Budget (optional)" {...form.field('budget')} />
        <CurrencyField onChange={setBudgetCurrency} value={budgetCurrency} />
      </div>
    </FormDialog>
  );
}
