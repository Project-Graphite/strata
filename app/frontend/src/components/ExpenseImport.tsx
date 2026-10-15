import { useState } from 'react';
import { Dialog } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useCategories } from '../spending';
import { money, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useStatementFile } from './StatementFile';
import { CategoryChips } from './CategoryChips';
import { CurrencyField } from './CurrencyField';
import { Hint } from './Hint';
import { Button } from './Button';
import { DialogActions } from './DialogActions';

const shownAtMost = 200;

export function ExpenseImport({ currency, onAdded, onClose, spaceId }: { currency: string; onAdded: () => void; onClose: () => void; spaceId: string }) {
  const auth = useAuth();
  const adding = useAction();
  const [chosenCurrency, setChosenCurrency] = useState(currency);
  const statement = useStatementFile(setChosenCurrency);
  const categories = useCategories(spaceId);
  const [category, setCategory] = useState('other');
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const charges = statement.charges.slice(0, shownAtMost);
  const chosen = charges.filter((_, index) => !skipped.has(index));

  return (
    <Dialog onClose={onClose} title="Import spending from a statement">
      <div className="mt-5 grid gap-4">
        <Hint>Choose a CSV export from your bank or card. It is read on this device, and only the charges you keep are saved.</Hint>
        {statement.picker}
        {statement.loaded && (
          <>
            {statement.columns}
            <div className="max-w-xs">
              <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
            </div>
            <CategoryChips categories={categories.data ?? []} onChange={setCategory} value={category} />
            <Hint>
              {statement.charges.length} charges read{statement.charges.length > shownAtMost ? `, the first ${shownAtMost} shown` : ''}. Untick any you do not want.
            </Hint>
            {charges.length > 0 && (
              <ul className="panel-rows max-h-72 overflow-y-auto">
                {charges.map((charge, index) => (
                  <li className="panel-row" key={index}>
                    <label className="flex items-center gap-3">
                      <input
                        checked={!skipped.has(index)}
                        onChange={(event) => {
                          const next = new Set(skipped);
                          if (event.currentTarget.checked) next.delete(index);
                          else next.add(index);
                          setSkipped(next);
                        }}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1 truncate text-ink">{charge.description}</span>
                      <span className="shrink-0 text-sm text-muted">
                        {charge.date} · {money(toMinor(charge.amount.toFixed(2), chosenCurrency), chosenCurrency)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <DialogActions>
          <Button label="Cancel" large onClick={onClose} />
          <Button
            disabled={chosen.length === 0 || adding.busy}
            label={adding.busy ? 'Adding…' : `Add ${chosen.length} expense${chosen.length === 1 ? '' : 's'}`}
            large
            onClick={() =>
              void adding
                .run(async () => {
                  const { added } = await auth.request<{ added: number }>(`/spaces/${spaceId}/expenses/import`, {
                    method: 'POST',
                    body: JSON.stringify({
                      expenses: chosen.map((charge) => ({
                        title: charge.description.slice(0, 200) || 'Card payment',
                        amountMinor: toMinor(charge.amount.toFixed(2), chosenCurrency),
                        currency: chosenCurrency,
                        spentOn: charge.date,
                        category,
                      })),
                    }),
                  });
                  onAdded();
                  return `Added ${added} expense${added === 1 ? '' : 's'}.`;
                }, 'Could not add the expenses')
                .then((done) => done && onClose())
            }
            primary
          />
        </DialogActions>
      </div>
    </Dialog>
  );
}
