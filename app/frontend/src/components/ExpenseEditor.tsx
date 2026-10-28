import { useState } from 'react';
import { Checkbox, DatePicker, Select, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { directionOptions, paymentMethods, useCategories, type CapturedMessage, type Expense, type ExpenseDirection, type KnownCard, type MoneyAccount } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, moneyAmount, notCardNumber, required, useFormErrors } from '../validation';
import { TextButton } from './Button';
import { FormDialog } from './FormDialog';
import { CategoryChips } from './CategoryChips';
import { CurrencyField } from './CurrencyField';

const directionWords: Record<ExpenseDirection, { noun: string; what: string; example: string }> = {
  spent: { noun: 'expense', what: 'What for', example: 'Groceries at the market' },
  received: { noun: 'income', what: 'Where from', example: 'Salary' },
  refund: { noun: 'refund', what: 'What for', example: 'Returned shoes' },
  transfer: { noun: 'transfer', what: 'What for', example: 'Paying off the card' },
};

export function ExpenseEditor({
  accounts,
  capture,
  currency,
  expense,
  onClose,
  onSaved,
  onRestored,
  onTrashed,
  spaceId,
}: {
  accounts: MoneyAccount[];
  capture?: CapturedMessage;
  currency: string;
  expense?: Expense;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
  onRestored?: () => void;
  onTrashed?: () => void;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const categories = useCategories(spaceId);
  const [category, setCategory] = useState(expense?.category ?? '');
  const chosenCategory = category || categories.data?.[0]?.name || 'other';
  const suggested = capture?.suggestion;
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? dayKey(capture ? new Date(capture.receivedAt) : new Date()));
  const [direction, setDirection] = useState<ExpenseDirection>(expense?.direction ?? suggested?.direction ?? 'spent');
  const [accountId, setAccountId] = useState(expense?.accountId ?? suggested?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(expense?.toAccountId ?? '');
  const transfer = direction === 'transfer';
  const words = directionWords[direction];
  const accountOptions = [{ value: '', label: 'None' }, ...accounts.map((account) => ({ value: account.id, label: account.name }))];
  const cards = useResource<KnownCard[]>(`/spaces/${spaceId}/cards`, true);
  const startCard = expense?.cardDigits ?? suggested?.cardDigits ?? null;
  const startLabel = expense?.paymentLabel ?? suggested?.paymentLabel ?? null;
  const [paidWith, setPaidWith] = useState(
    startCard ? `card:${startCard}` : !startLabel ? '' : paymentMethods.some(([method]) => method === startLabel) ? `method:${startLabel}` : 'other',
  );
  const knownCards = [
    ...(cards.data ?? []),
    ...(startCard && !cards.data?.some((card) => card.digits === startCard) ? [{ digits: startCard, accountId: expense?.accountId ?? suggested?.accountId ?? null }] : []),
  ];
  const paidWithOptions = [
    { value: '', label: 'Not set' },
    ...knownCards.map((card) => ({ value: `card:${card.digits}`, label: `•••• ${card.digits}`, hint: accounts.find((account) => account.id === card.accountId)?.name ?? 'Card' })),
    ...paymentMethods.map(([method, hint]) => ({ value: `method:${method}`, label: method, hint })),
    { value: 'new-card', label: 'Add a card…' },
    { value: 'other', label: 'Other…' },
  ];
  const choosePaidWith = (next: string) => {
    setPaidWith(next);
    const card = knownCards.find((known) => `card:${known.digits}` === next);
    if (card?.accountId && !accountId) setAccountId(card.accountId);
  };

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={expense ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            title: [required('Say what it was for.'), atMost(200, 'Use at most 200 characters.')],
            amount: [required('Enter the amount.'), moneyAmount],
            paymentLabel: [atMost(40, 'Use at most 40 characters.'), notCardNumber],
            ...(paidWith === 'new-card' ? { cardDigits: [(value) => (/^\d{4}$/.test(value.trim()) ? undefined : 'Enter the last 4 digits of the card.')] } : {}),
          }) ||
          (transfer && !form.check(target, { from: [() => (accountId && toAccountId && accountId !== toAccountId ? undefined : 'Choose two different accounts.')] }))
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
          category: chosenCategory,
          paymentLabel: paidWith.startsWith('method:') ? paidWith.slice('method:'.length) : paidWith === 'other' ? text('paymentLabel') || null : null,
          cardDigits: paidWith.startsWith('card:') ? paidWith.slice('card:'.length) : paidWith === 'new-card' ? text('cardDigits') : null,
          note: text('note'),
          direction,
          accountId: accountId || null,
          toAccountId: transfer ? toAccountId : null,
          ...(capture ? { merchant: suggested?.merchant ?? null } : {}),
        };
        void saving
          .run(async () => {
            const saved = await auth.request<Expense>(expense ? `/expenses/${expense.id}` : capture ? `/captures/${capture.id}/record` : `/spaces/${spaceId}/expenses`, {
              method: expense ? 'PATCH' : 'POST',
              body: JSON.stringify(body),
            });
            if (suggested?.merchant && values.get('remember')) {
              await auth.request(`/spaces/${spaceId}/merchant-rules`, {
                method: 'POST',
                body: JSON.stringify({ match: suggested.merchant.toLowerCase(), rename: body.title, category: direction === 'received' || transfer ? null : chosenCategory }),
              });
            }
            onSaved(saved);
            return `${expense ? 'Saved' : 'Added'} ${body.title}.`;
          }, `Could not save the ${words.noun}`)
          .then((saved) => saved && onClose());
      }}
      start={
        expense &&
        onTrashed && (
          <TextButton
            danger
            disabled={saving.busy}
            label="Move to trash"
            onClick={() =>
              void saving
                .run(async () => {
                  await auth.request(`/items/${expense.id}/trash`, { method: 'POST' });
                  onTrashed();
                  return {
                    message: `Moved ${expense.title} to the trash.`,
                    undo: async () => {
                      await auth.request(`/items/${expense.id}/restore`, { method: 'POST' });
                      onRestored?.();
                      return '';
                    },
                  };
                }, `Could not move the ${words.noun} to the trash`)
                .then((done) => done && onClose())
            }
          />
        )
      }
      submitLabel={expense ? 'Save' : `Add ${words.noun}`}
      title={expense ? `Edit ${words.noun}` : `New ${words.noun}`}
    >
      {capture && <blockquote className="m-0 rounded-field border border-line p-3 text-small text-muted">{capture.text}</blockquote>}
      <Select label="Type" onChange={setDirection} options={directionOptions.filter((option) => option.value !== 'transfer' || accounts.length > 1 || transfer)} value={direction} />
      <TextField autoComplete="off" autoFocus defaultValue={expense?.title ?? suggested?.merchant ?? undefined} label={words.what} maxLength={200} placeholder={words.example} {...form.field('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          defaultValue={expense ? fromMinor(expense.amountMinor, expense.currency) : suggested?.amountMinor && suggested.currency ? fromMinor(suggested.amountMinor, suggested.currency) : ''}
          inputMode="decimal"
          label="Amount"
          {...form.field('amount')}
        />
        <CurrencyField defaultValue={expense?.currency ?? suggested?.currency ?? currency} name="currency" />
        <DatePicker label="Date" onChange={setSpentOn} optional={false} value={spentOn} />
        {accounts.length > 0 && (
          <Select error={form.errors.from} label={transfer ? 'From' : 'Account'} name="from" onChange={setAccountId} options={accountOptions} value={accountId} />
        )}
        {accounts.length > 0 && transfer && <Select label="To" onChange={setToAccountId} options={accountOptions} value={toAccountId} />}
      </div>
      {direction !== 'received' && !transfer && <CategoryChips categories={categories.data ?? []} onChange={setCategory} value={chosenCategory} />}
      {suggested?.merchant && (
        <Checkbox defaultChecked label={`Always do this for ${suggested.merchant}`} name="remember" />
      )}
      {!transfer && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={direction === 'received' ? 'Received on (optional)' : 'Paid with (optional)'} onChange={choosePaidWith} options={paidWithOptions} value={paidWith} />
          {paidWith === 'new-card' && <TextField autoComplete="off" hint="Only the last 4 digits." inputMode="numeric" label="Card ending" maxLength={4} {...form.field('cardDigits')} />}
          {paidWith === 'other' && (
            <TextField defaultValue={startLabel ?? ''} hint="Such as a gift card. Never a card number." label="What you paid with" maxLength={40} {...form.field('paymentLabel')} />
          )}
        </div>
      )}
      <TextAreaField defaultValue={expense?.note} label="Note (optional)" maxLength={1000} name="note" rows={2} />
    </FormDialog>
  );
}
