import { useState } from 'react';
import { Dialog } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useSpaces } from '../spaces';
import { merchantKey, suggestRecurring } from '../statement';
import { cycleLabel, money, toMinor, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { useStatementFile } from './StatementFile';
import { CurrencyField } from './CurrencyField';
import { Hint } from './Hint';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { Choice, toggled } from './Selection';

export function StatementImport({ defaultCurrency, onClose, onAdded }: { defaultCurrency: string; onClose: () => void; onAdded: () => void }) {
  const auth = useAuth();
  const spaces = useSpaces();
  const adding = useAction();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const [currency, setCurrency] = useState(defaultCurrency);
  const statement = useStatementFile(setCurrency);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const target = editable[0]?.id;
  const existing = useResource<Subscription[]>(target ? `/spaces/${target}/subscriptions` : null, true);
  const tracked = new Set((existing.data ?? []).map((subscription) => merchantKey(subscription.name)));
  const charges = statement.charges;
  const suggestions = suggestRecurring(charges);
  const chosen = suggestions.filter((suggestion) => !tracked.has(suggestion.key) && !skipped.has(suggestion.key));

  return (
    <Dialog onClose={onClose} title="Import subscriptions from a statement">
      <div className="mt-5 grid gap-4">
        <Hint>Choose a CSV export from your bank or card. It is read on this device and never uploaded.</Hint>
        {statement.picker}
        {statement.loaded && (
          <>
            {statement.columns}
            <p className="mono-sm m-0 text-faint">
              {charges.length} charge{charges.length === 1 ? '' : 's'} read · {suggestions.length} look{suggestions.length === 1 ? 's' : ''} recurring
            </p>
            {suggestions.length > 0 && (
              <ul className="panel-rows">
                {suggestions.map((suggestion) => {
                  const known = tracked.has(suggestion.key);
                  return (
                    <Choice
                      checked={!known && !skipped.has(suggestion.key)}
                      detail={[`${money(toMinor(String(suggestion.amount), currency), currency)} ${cycleLabel(suggestion.repeatRule)}`, `${suggestion.count} charges`, known && 'already tracked in this space']
                        .filter(Boolean)
                        .join(' · ')}
                      disabled={known}
                      key={suggestion.key}
                      label={suggestion.name}
                      onToggle={() => setSkipped((current) => toggled(current, suggestion.key))}
                    />
                  );
                })}
              </ul>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <CurrencyField onChange={setCurrency} value={currency} />
            </div>
          </>
        )}
        <DialogActions>
          <Button disabled={adding.busy} label="Cancel" large onClick={onClose} />
          <Button
            disabled={!target || chosen.length === 0 || adding.busy}
            label={adding.busy ? 'Adding…' : `Add ${chosen.length} subscription${chosen.length === 1 ? '' : 's'}`}
            large
            onClick={() =>
              void adding
                .run(async () => {
                  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currencies are three-letter codes such as EUR or USD.');
                  for (const suggestion of chosen) {
                    await auth.request(`/spaces/${target}/subscriptions`, {
                      method: 'POST',
                      body: JSON.stringify({
                        name: suggestion.name,
                        amountMinor: toMinor(String(suggestion.amount), currency),
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
            primary
          />
        </DialogActions>
      </div>
    </Dialog>
  );
}
