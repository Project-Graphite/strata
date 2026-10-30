import { useEffect, useState } from 'react';
import { Banner, Dialog, Select } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { categoryName, expenseCategories, useCategories, type MerchantRule, type MoneyAccount } from '../spending';
import type { Entry } from '../statement';
import { money, toMinor } from '../subscriptions';
import { formatDate } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { useStatementFile } from './StatementFile';
import { CategoryChips } from './CategoryChips';
import { CurrencyField } from './CurrencyField';
import { Hint } from './Hint';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { Choice } from './Selection';

const shownAtMost = 200;
const batchSize = 500;

const ruleFor = (rules: MerchantRule[], description: string) =>
  rules.filter((rule) => description.toLowerCase().includes(rule.match.toLowerCase())).sort((a, b) => b.match.length - a.match.length)[0];

const inBatches = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / batchSize) }, (_, index) => list.slice(index * batchSize, (index + 1) * batchSize));

export function ExpenseImport({ accounts, currency, onAdded, onClose, spaceId }: { accounts: MoneyAccount[]; currency: string; onAdded: () => void; onClose: () => void; spaceId: string }) {
  const auth = useAuth();
  const adding = useAction();
  const [chosenCurrency, setChosenCurrency] = useState(currency);
  const [accountId, setAccountId] = useState('');
  const statement = useStatementFile(setChosenCurrency);
  const categories = useCategories(spaceId);
  const rules = useResource<MerchantRule[]>(`/spaces/${spaceId}/merchant-rules`, true);
  const [category, setCategory] = useState('other');
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
  const [ticked, setTicked] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [duplicates, setDuplicates] = useState<ReadonlySet<number>>(new Set());
  const [unchecked, setUnchecked] = useState(false);
  const incomeCategories = (categories.data ?? []).filter((known) => known.kind === 'income');
  const incomeDefault = incomeCategories.find((known) => known.name === 'other income')?.name ?? incomeCategories[0]?.name ?? 'other';
  const optionsOf = (income: boolean) => (income ? incomeCategories : expenseCategories(categories.data)).map((known) => ({ value: known.name, label: categoryName(known.name) }));
  const rows = statement.entries.map((entry: Entry, index) => {
    const income = entry.amount > 0;
    const rule = ruleFor(rules.data ?? [], entry.description);
    const key = String(index);
    return {
      key,
      entry,
      income,
      title: rule?.rename ?? entry.description,
      ignored: Boolean(rule?.ignore),
      duplicate: duplicates.has(index),
      category: picked.get(key) ?? (income ? incomeDefault : (rule?.category ?? category)),
    };
  });
  const checked = (row: (typeof rows)[number]) => ticked.get(row.key) ?? !(row.ignored || row.duplicate);
  const payloadOf = (row: (typeof rows)[number]) => ({
    title: row.title.slice(0, 200),
    amountMinor: toMinor(String(Math.abs(row.entry.amount)), chosenCurrency),
    currency: chosenCurrency,
    spentOn: row.entry.date,
    direction: row.income ? 'received' : 'spent',
    category: row.category,
    merchant: row.entry.description.slice(0, 120),
    accountId: accountId || null,
    ...(row.entry.reference ? { reference: row.entry.reference.slice(0, 80) } : {}),
  });
  const chosen = rows.filter(checked);
  const candidates = rows.map(payloadOf);
  const checkKey = JSON.stringify(candidates.map((candidate) => [candidate.spentOn, candidate.amountMinor, candidate.direction, candidate.currency, candidate.accountId, candidate.reference]));
  const incoming = chosen.filter((row) => row.income).length;

  useEffect(() => {
    if (candidates.length === 0) return;
    let current = true;
    void Promise.all(
      inBatches(candidates).map((batch) => auth.request<{ duplicates: number[] }>(`/spaces/${spaceId}/expenses/import/check`, { method: 'POST', body: JSON.stringify({ expenses: batch }) })),
    ).then(
      (found) => {
        if (!current) return;
        setUnchecked(false);
        setDuplicates(new Set(found.flatMap(({ duplicates: indexes }, batch) => indexes.map((index) => batch * batchSize + index))));
      },
      () => current && setUnchecked(true),
    );
    return () => {
      current = false;
    };
  }, [checkKey]);

  return (
    <Dialog onClose={onClose} title="Import a statement">
      <div className="mt-5 grid gap-4">
        <Hint>Choose a CSV export or a PDF statement from your bank, card or wallet. It is read on this device, and only the transactions you keep are saved.</Hint>
        {statement.picker}
        {statement.loaded && (
          <>
            {statement.columns}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Account"
                onChange={(value) => {
                  setAccountId(value);
                  const account = accounts.find((known) => known.id === value);
                  if (account) setChosenCurrency(account.currency);
                }}
                options={[{ value: '', label: 'No account' }, ...accounts.filter((account) => !account.archivedAt).map((account) => ({ value: account.id, label: account.name }))]}
                value={accountId}
              />
              <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
            </div>
            <CategoryChips categories={expenseCategories(categories.data)} label="Category for spending without a rule" onChange={setCategory} value={category} />
            <Hint>
              {rows.length} transaction{rows.length === 1 ? '' : 's'} read{rows.length > shownAtMost ? `, the first ${shownAtMost} shown` : ''}. Already recorded and ignored ones start unticked.
            </Hint>
            {unchecked && <Banner tone="warning">Could not check which of these are already recorded. Look through them before adding.</Banner>}
            {rows.length > 0 && (
              <ul className="panel-rows max-h-96 overflow-y-auto">
                {rows.slice(0, shownAtMost).map((row) => (
                  <Choice
                    checked={checked(row)}
                    detail={[
                      formatDate(row.entry.date),
                      `${row.income ? '+' : ''}${money(toMinor(String(Math.abs(row.entry.amount)), chosenCurrency), chosenCurrency)}`,
                      row.income && 'Income',
                      row.duplicate && 'Already recorded',
                      row.ignored && 'Ignored by a rule',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    key={row.key}
                    label={row.title}
                    onToggle={() => setTicked((current) => new Map(current).set(row.key, !checked(row)))}
                    trail={
                      <Select
                        aria-label={`Category of ${row.title}`}
                        onChange={(value) => setPicked((current) => new Map(current).set(row.key, value))}
                        options={optionsOf(row.income)}
                        quiet
                        size="small"
                        value={row.category}
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
        <DialogActions>
          <Button disabled={adding.busy} label="Cancel" large onClick={onClose} />
          <Button
            disabled={chosen.length === 0 || adding.busy}
            label={adding.busy ? 'Adding…' : `Add ${chosen.length} transaction${chosen.length === 1 ? '' : 's'}`}
            large
            onClick={() =>
              void adding
                .run(async () => {
                  let added = 0;
                  for (const batch of inBatches(chosen.map(payloadOf))) {
                    added += (await auth.request<{ added: number }>(`/spaces/${spaceId}/expenses/import`, { method: 'POST', body: JSON.stringify({ expenses: batch }) })).added;
                  }
                  onAdded();
                  return `Added ${added} transaction${added === 1 ? '' : 's'}${incoming ? `, ${incoming} of them income` : ''}.`;
                }, 'Could not add the transactions')
                .then((done) => done && onClose())
            }
            primary
          />
        </DialogActions>
      </div>
    </Dialog>
  );
}
