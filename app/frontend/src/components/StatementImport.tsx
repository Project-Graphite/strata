import { useState } from 'react';
import { Dialog, Select } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { allCurrencies, currencyOptions } from '../choices';
import { spaceOptions, useSpaces } from '../spaces';
import { dateOrder, guessColumns, merchantKey, parseCsv, readCharges, suggestRecurring, type DateOrder, type StatementColumns } from '../statement';
import { cycleLabel, toMinor, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const orders: { value: DateOrder; label: string; hint: string }[] = [
  { value: 'dmy', label: 'Day first', hint: '31/01/2026' },
  { value: 'mdy', label: 'Month first', hint: '01/31/2026' },
  { value: 'ymd', label: 'Year first', hint: '2026-01-31' },
];

export function StatementImport({ defaultCurrency, onClose, onAdded }: { defaultCurrency: string; onClose: () => void; onAdded: () => void }) {
  const auth = useAuth();
  const spaces = useSpaces();
  const adding = useAction();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const [rows, setRows] = useState<string[][]>();
  const [columns, setColumns] = useState<StatementColumns>({ date: 0, description: 0, amount: 0 });
  const [order, setOrder] = useState<DateOrder>('dmy');
  const [spaceId, setSpaceId] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const target = spaceId || (editable.find((space) => space.kind === 'personal') ?? editable[0])?.id;
  const existing = useResource<Subscription[]>(target ? `/spaces/${target}/subscriptions` : null, true);
  const tracked = new Set((existing.data ?? []).map((subscription) => merchantKey(subscription.name)));
  const charges = rows ? readCharges(rows, columns, order) : [];
  const suggestions = suggestRecurring(charges);
  const chosen = suggestions.filter((suggestion) => !tracked.has(suggestion.key) && !skipped.has(suggestion.key));

  async function read(file: File) {
    const parsed = parseCsv(await file.text());
    const guessed = guessColumns(parsed);
    setRows(parsed);
    setColumns(guessed);
    setOrder(dateOrder(parsed.slice(1, 50).map((row) => row[guessed.date] ?? '')));
  }

  const columnSelect = (label: string, key: keyof StatementColumns) => (
    <Select
      label={label}
      onChange={(index) => setColumns({ ...columns, [key]: Number(index) })}
      options={(rows?.[0] ?? []).map((title, index) => ({ value: String(index), label: title || `Column ${index + 1}` }))}
      value={String(columns[key])}
    />
  );

  return (
    <Dialog onClose={onClose} title="Import a statement">
      <div className="mt-5 grid gap-4">
        <p className="m-0 text-sm text-muted">Choose a CSV export from your bank or card. It is read on this device and never uploaded.</p>
        <input accept=".csv,text/csv" aria-label="Statement file" onChange={(event) => event.currentTarget.files?.[0] && void read(event.currentTarget.files[0])} type="file" />
        {rows && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {columnSelect('Date column', 'date')}
              {columnSelect('Description column', 'description')}
              {columnSelect('Amount column', 'amount')}
              <Select label="Dates are written" onChange={setOrder} options={orders} value={order} />
            </div>
            <p className="mono-sm m-0 text-faint">
              {charges.length} charges read · {suggestions.length} look recurring
            </p>
            {suggestions.length > 0 && (
              <ul className="m-0 grid list-none gap-0 p-0">
                {suggestions.map((suggestion) => {
                  const known = tracked.has(suggestion.key);
                  return (
                    <li className="border-b border-line-soft py-2" key={suggestion.key}>
                      <label className="flex items-center gap-3">
                        <input
                          checked={!known && !skipped.has(suggestion.key)}
                          disabled={known}
                          onChange={(event) => {
                            const next = new Set(skipped);
                            if (event.currentTarget.checked) next.delete(suggestion.key);
                            else next.add(suggestion.key);
                            setSkipped(next);
                          }}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink">{suggestion.name}</span>
                          <span className="mono-sm block text-faint">
                            {[
                              `${suggestion.amount.toFixed(2)} ${cycleLabel(suggestion.repeatRule)}`,
                              `${suggestion.count} charges`,
                              known && 'already tracked in this space',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Add to" onChange={setSpaceId} options={spaceOptions(editable)} value={target ?? ''} />
              <Select label="Currency" onChange={setCurrency} options={currencyOptions(allCurrencies)} searchable value={currency} />
            </div>
          </>
        )}
        <div className="mt-1 flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!target || chosen.length === 0 || adding.busy}
            onClick={() =>
              void adding
                .run(async () => {
                  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currencies are three-letter codes such as EUR or USD.');
                  for (const suggestion of chosen) {
                    await auth.request(`/spaces/${target}/subscriptions`, {
                      method: 'POST',
                      body: JSON.stringify({
                        name: suggestion.name,
                        amountMinor: toMinor(suggestion.amount.toFixed(2), currency),
                        currency,
                        repeatRule: suggestion.repeatRule,
                        startDate: suggestion.lastDate,
                        category: suggestion.category,
                        ...(suggestion.cancelUrl ? { cancelUrl: suggestion.cancelUrl } : {}),
                      }),
                    });
                  }
                  onAdded();
                  return `Added ${chosen.length} subscription${chosen.length === 1 ? '' : 's'}.`;
                }, 'Could not add the subscriptions')
                .then((done) => done && onClose())
            }
            type="button"
          >
            {adding.busy ? 'Adding…' : `Add ${chosen.length} subscription${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
