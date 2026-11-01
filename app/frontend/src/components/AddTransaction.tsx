import { useState } from 'react';
import { Checkbox, DatePicker, Fieldset, FilterChip, SegmentedControl, Select, Sheet, SuggestField, TextAreaField, TextField, Button as UiButton } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { useAuth } from '../auth';
import { categoryName, expenseCategories, mostUsedCategory, paymentMethods, useCategories, type Expense, type ExpenseDirection, type KnownCard, type MoneyAccount, type TransactionsPage } from '../spending';
import { toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { moneyAmount, required, useFormErrors } from '../validation';
import { Button, TextButton } from './Button';
import { CategoryChips } from './CategoryChips';
import { CurrencyField } from './CurrencyField';

const shownRecents = 6;
const formId = 'add-transaction';

export function AddTransaction({ accounts, currency, onClose, onSaved, spaceId }: { accounts: MoneyAccount[]; currency: string; onClose: () => void; onSaved: (expense: Expense) => void; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const categories = expenseCategories(useCategories(spaceId).data);
  const recent = useResource<TransactionsPage>(`/spaces/${spaceId}/expenses?limit=60`, true);
  const open = accounts.filter((account) => !account.archivedAt);
  const [direction, setDirection] = useState<Exclude<ExpenseDirection, 'refund'>>('spent');
  const [refund, setRefund] = useState(false);
  const [title, setTitle] = useState({ value: '', version: 0 });
  const [category, setCategory] = useState<string>();
  const [accountId, setAccountId] = useState<string | null>();
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [spentOn, setSpentOn] = useState(dayKey(new Date()));
  const [chosenCurrency, setChosenCurrency] = useState<string>();
  const [paidWith, setPaidWith] = useState('');
  const [more, setMore] = useState(false);
  const cards = useResource<KnownCard[]>(more ? `/spaces/${spaceId}/cards` : null, true);
  const transfer = direction === 'transfer';
  const recents = [...new Map((recent.data?.expenses ?? []).filter((row) => row.direction !== 'transfer').map((row) => [row.title.toLowerCase(), row] as const)).values()];
  const chosenAccount = accountId === undefined ? (recents.find((row) => open.some((account) => account.id === row.accountId))?.accountId ?? null) : accountId;
  const chosenCategory = category ?? mostUsedCategory(categories);
  const amountCurrency = chosenCurrency ?? open.find((account) => account.id === chosenAccount)?.currency ?? currency;
  const pick = (picked: string) => {
    const known = recents.find((row) => row.title.toLowerCase() === picked.toLowerCase());
    setTitle((current) => ({ value: picked, version: current.version + 1 }));
    if (!known) return;
    if (known.direction === 'spent' || known.direction === 'refund') setCategory(known.category);
    if (known.accountId && open.some((account) => account.id === known.accountId)) setAccountId(known.accountId);
  };
  const accountChips = (value: string | null, onChange: (value: string | null) => void, exclude?: string | null) =>
    open
      .filter((account) => account.id !== exclude)
      .map((account) => <FilterChip active={account.id === value} key={account.id} label={account.name} onClick={() => onChange(account.id === value ? null : account.id)} />);

  return (
    <Sheet
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={saving.busy} label="Cancel" large onClick={onClose} />
          <UiButton disabled={saving.busy} form={formId} type="submit" variant="primary">
            {saving.busy ? 'Adding…' : transfer ? 'Add transfer' : direction === 'received' ? 'Add income' : 'Add expense'}
          </UiButton>
        </div>
      }
      onClose={onClose}
      title="New transaction"
    >
      <form
        className="grid min-w-0 gap-5"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (
            !form.check(target, {
              amount: [required('Enter the amount.'), moneyAmount],
              ...(paidWith === 'new-card' ? { cardDigits: [(value) => (/^\d{4}$/.test(value.trim()) ? undefined : 'Enter the last 4 digits of the card.')] } : {}),
              ...(transfer ? { to: [() => (chosenAccount && toAccountId && chosenAccount !== toAccountId ? undefined : 'Choose the account the money left and the one it went to.')] } : {}),
            })
          ) {
            return;
          }
          const values = new FormData(target);
          const text = (name: string) => String(values.get(name) ?? '').trim();
          const named = text('title');
          const body = {
            title: named || (transfer ? 'Transfer' : direction === 'received' ? 'Income' : categoryName(chosenCategory)),
            amountMinor: toMinor(text('amount'), amountCurrency),
            currency: amountCurrency,
            spentOn,
            ...(direction === 'spent' ? { category: chosenCategory } : {}),
            direction: direction === 'spent' && refund ? 'refund' : direction,
            accountId: chosenAccount,
            toAccountId: transfer ? toAccountId : null,
            paymentLabel: !transfer && paidWith.startsWith('method:') ? paidWith.slice('method:'.length) : null,
            cardDigits: transfer ? null : paidWith.startsWith('card:') ? paidWith.slice('card:'.length) : paidWith === 'new-card' ? text('cardDigits') : null,
            note: text('note'),
          };
          void saving
            .run(async () => {
              const saved = await auth.request<Expense>(`/spaces/${spaceId}/expenses`, { method: 'POST', body: JSON.stringify(body) });
              onSaved(saved);
              return `Added ${body.title}.`;
            }, 'Could not add the transaction')
            .then((done) => done && onClose());
        }}
      >
        <SegmentedControl
          label="Type"
          onChange={setDirection}
          options={[
            { value: 'spent', label: 'Spent' },
            { value: 'received', label: 'Received' },
            ...(open.length > 1 ? [{ value: 'transfer' as const, label: 'Transfer' }] : []),
          ]}
          value={direction}
        />
        <TextField autoComplete="off" autoFocus className="amount-field" inputMode="decimal" label={`Amount (${amountCurrency})`} {...form.field('amount')} />
        {!transfer && (
          <div className="grid gap-2">
            <SuggestField
              autoComplete="off"
              defaultValue={title.value}
              key={title.version}
              label={direction === 'received' ? 'From (optional)' : 'Where (optional)'}
              maxLength={200}
              name="title"
              onPick={pick}
              suggestions={recents.map((row) => row.title)}
            />
            {recents.length > 0 && (
              <div aria-label="Recent" className="flex flex-wrap gap-2" role="group">
                {recents
                  .filter((row) => (direction === 'received' ? row.direction === 'received' : row.direction !== 'received'))
                  .slice(0, shownRecents)
                  .map((row) => (
                    <FilterChip active={title.value === row.title} key={row.id} label={row.title} onClick={() => pick(row.title)} />
                  ))}
              </div>
            )}
          </div>
        )}
        {open.length > 0 && (
          <Fieldset legend={transfer ? 'From' : 'Account'}>
            <div className="flex flex-wrap gap-2">{accountChips(chosenAccount, setAccountId)}</div>
          </Fieldset>
        )}
        {transfer && (
          <Fieldset legend="To">
            <div className="flex flex-wrap gap-2">{accountChips(toAccountId, setToAccountId, chosenAccount)}</div>
            <input name="to" type="hidden" />
            {form.errors.to && (
              <p className="m-0 mt-2 text-small text-danger" role="alert">
                {form.errors.to}
              </p>
            )}
          </Fieldset>
        )}
        {direction === 'spent' && <CategoryChips categories={categories} onChange={setCategory} value={chosenCategory} />}
        <DatePicker label="Date" onChange={setSpentOn} optional={false} value={spentOn} />
        {more ? (
          <div className="grid gap-4">
            <CurrencyField onChange={setChosenCurrency} value={amountCurrency} />
            {!transfer && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label={direction === 'received' ? 'Received on' : 'Paid with'}
                  onChange={setPaidWith}
                  options={[
                    { value: '', label: 'Not set' },
                    ...(cards.data ?? []).map((card) => ({ value: `card:${card.digits}`, label: `•••• ${card.digits}`, hint: accounts.find((account) => account.id === card.accountId)?.name ?? 'Card' })),
                    ...paymentMethods.map(([method, hint]) => ({ value: `method:${method}`, label: method, hint })),
                    { value: 'new-card', label: 'Add a card…' },
                  ]}
                  value={paidWith}
                />
                {paidWith === 'new-card' && <TextField autoComplete="off" inputMode="numeric" label="Card ending" maxLength={4} {...form.field('cardDigits')} />}
              </div>
            )}
            {direction === 'spent' && <Checkbox checked={refund} label="This is a refund" onChange={(event) => setRefund(event.currentTarget.checked)} />}
            <TextAreaField label="Note (optional)" maxLength={1000} name="note" rows={2} />
          </div>
        ) : (
          <TextButton label="More details" onClick={() => setMore(true)} />
        )}
      </form>
    </Sheet>
  );
}
