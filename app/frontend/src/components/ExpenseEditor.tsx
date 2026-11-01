import { useState } from 'react';
import { Checkbox, DatePicker, Fieldset, FilterChip, SegmentedControl, Select, Sheet, TextAreaField, TextField, Button as UiButton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { expenseCategories, mostUsedCategory, paymentMethods, useCategories, type CapturedMessage, type Expense, type ExpenseDirection, type KnownCard, type MoneyAccount } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, moneyAmount, required, useFormErrors } from '../validation';
import { Button, TextButton } from './Button';
import { CategoryChips } from './CategoryChips';
import { CurrencyField } from './CurrencyField';

const formId = 'expense-editor';

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
  reportParsing = false,
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
  reportParsing?: boolean;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const categories = expenseCategories(useCategories(spaceId).data);
  const suggested = capture?.suggestion;
  const [category, setCategory] = useState(expense?.category ?? suggested?.category ?? '');
  const chosenCategory = category || mostUsedCategory(categories);
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? suggested?.occurredOn ?? dayKey(capture ? new Date(capture.receivedAt) : new Date()));
  const startDirection = expense?.direction ?? (suggested?.transfer ? 'transfer' : suggested?.direction) ?? 'spent';
  const [direction, setDirection] = useState<Exclude<ExpenseDirection, 'refund'>>(startDirection === 'refund' ? 'spent' : startDirection);
  const [refund, setRefund] = useState(startDirection === 'refund');
  const [accountId, setAccountId] = useState(expense?.accountId ?? suggested?.transfer?.fromAccountId ?? suggested?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(expense?.toAccountId ?? suggested?.transfer?.toAccountId ?? '');
  const transfer = direction === 'transfer';
  const chosenDirection = direction === 'spent' && refund ? 'refund' : direction;
  const words = directionWords[chosenDirection];
  const accountChips = (value: string, onChange: (value: string) => void, exclude?: string) =>
    accounts
      .filter((account) => account.id !== exclude && (!account.archivedAt || account.id === expense?.accountId || account.id === expense?.toAccountId))
      .map((account) => <FilterChip active={account.id === value} key={account.id} label={account.name} onClick={() => onChange(account.id === value ? '' : account.id)} />);
  const cards = useResource<KnownCard[]>(`/spaces/${spaceId}/cards`, true);
  const startCard = expense?.cardDigits ?? suggested?.cardDigits ?? null;
  const startLabel = expense?.paymentLabel ?? suggested?.paymentLabel ?? null;
  const [paidWith, setPaidWith] = useState(startCard ? `card:${startCard}` : startLabel ? `method:${startLabel}` : '');
  const knownCards = [
    ...(cards.data ?? []),
    ...(startCard && !cards.data?.some((card) => card.digits === startCard) ? [{ digits: startCard, accountId: expense?.accountId ?? suggested?.accountId ?? null }] : []),
  ];
  const paidWithOptions = [
    { value: '', label: 'Not set' },
    ...knownCards.map((card) => ({ value: `card:${card.digits}`, label: `•••• ${card.digits}`, hint: accounts.find((account) => account.id === card.accountId)?.name ?? 'Card' })),
    ...paymentMethods.map(([method, hint]) => ({ value: `method:${method}`, label: method, hint })),
    ...(startLabel && !paymentMethods.some(([method]) => method === startLabel) ? [{ value: `method:${startLabel}`, label: startLabel }] : []),
    { value: 'new-card', label: 'Add a card…' },
  ];
  const choosePaidWith = (next: string) => {
    setPaidWith(next);
    const card = knownCards.find((known) => `card:${known.digits}` === next);
    if (card?.accountId && !accountId) setAccountId(card.accountId);
  };

  return (
    <Sheet
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {expense && onTrashed && (
            <span className="mr-auto">
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
            </span>
          )}
          <Button disabled={saving.busy} label="Cancel" large onClick={onClose} />
          <UiButton disabled={saving.busy} form={formId} type="submit" variant="primary">
            {saving.busy ? (expense ? 'Saving…' : 'Adding…') : expense ? 'Save changes' : `Add ${words.noun}`}
          </UiButton>
        </div>
      }
      onClose={onClose}
      title={expense ? `Edit ${words.noun}` : `New ${words.noun}`}
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
              title: [required('Say what it was for.'), atMost(200, 'Use at most 200 characters.')],
              amount: [required('Enter the amount.'), moneyAmount],
              ...(paidWith === 'new-card' ? { cardDigits: [(value) => (/^\d{4}$/.test(value.trim()) ? undefined : 'Enter the last 4 digits of the card.')] } : {}),
              ...(transfer ? { to: [() => (accountId && toAccountId && accountId !== toAccountId ? undefined : 'Choose two different accounts.')] } : {}),
            })
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
            paymentLabel: paidWith.startsWith('method:') ? paidWith.slice('method:'.length) : null,
            cardDigits: paidWith.startsWith('card:') ? paidWith.slice('card:'.length) : paidWith === 'new-card' ? text('cardDigits') : null,
            note: text('note'),
            direction: chosenDirection,
            accountId: accountId || null,
            toAccountId: transfer ? toAccountId : null,
            ...(capture ? { merchant: suggested?.merchant ?? null, remember: values.has('remember'), report: values.has('report') } : {}),
          };
          void saving
            .run(async () => {
              const saved = await auth.request<Expense>(expense ? `/expenses/${expense.id}` : capture ? `/captures/${capture.id}/record` : `/spaces/${spaceId}/expenses`, {
                method: expense ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
              });
              onSaved(saved);
              return `${expense ? 'Saved' : 'Added'} ${body.title}.`;
            }, `Could not save the ${words.noun}`)
            .then((saved) => saved && onClose());
        }}
      >
        {capture && (
          <blockquote className="quoted-text" dir="auto">
            {capture.text}
          </blockquote>
        )}
        <SegmentedControl
          label="Type"
          onChange={setDirection}
          options={[
            { value: 'spent', label: 'Spent' },
            { value: 'received', label: 'Received' },
            ...(accounts.length > 1 || transfer ? [{ value: 'transfer' as const, label: 'Transfer' }] : []),
          ]}
          value={direction}
        />
        <TextField autoComplete="off" autoFocus defaultValue={expense?.title ?? suggested?.title ?? suggested?.merchant ?? undefined} label={words.what} maxLength={200} placeholder={words.example} {...form.field('title')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            defaultValue={expense ? fromMinor(expense.amountMinor, expense.currency) : suggested?.amountMinor && suggested.currency ? fromMinor(suggested.amountMinor, suggested.currency) : ''}
            inputMode="decimal"
            label="Amount"
            {...form.field('amount')}
          />
          <CurrencyField defaultValue={expense?.currency ?? suggested?.currency ?? currency} name="currency" />
          <DatePicker label="Date" onChange={setSpentOn} optional={false} value={spentOn} />
        </div>
        {accounts.length > 0 && (
          <Fieldset legend={transfer ? 'From' : 'Account'}>
            <div className="flex flex-wrap gap-2">{accountChips(accountId, setAccountId)}</div>
          </Fieldset>
        )}
        {transfer && (
          <Fieldset legend="To">
            <div className="flex flex-wrap gap-2">{accountChips(toAccountId, setToAccountId, accountId)}</div>
            <input name="to" type="hidden" />
            {form.errors.to && (
              <p className="m-0 mt-2 text-small text-danger" role="alert">
                {form.errors.to}
              </p>
            )}
          </Fieldset>
        )}
        {direction === 'spent' && <CategoryChips categories={categories} onChange={setCategory} value={chosenCategory} />}
        {direction === 'spent' && <Checkbox checked={refund} label="This is a refund" onChange={(event) => setRefund(event.currentTarget.checked)} />}
        {capture && <Checkbox defaultChecked label={`Remember these choices for ${suggested?.merchant ?? capture.sender}`} name="remember" />}
        {!transfer && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={direction === 'received' ? 'Received on (optional)' : 'Paid with (optional)'} onChange={choosePaidWith} options={paidWithOptions} value={paidWith} />
            {paidWith === 'new-card' && <TextField autoComplete="off" inputMode="numeric" label="Card ending" maxLength={4} {...form.field('cardDigits')} />}
          </div>
        )}
        {capture && <Checkbox defaultChecked={reportParsing} label="Report parsing with an anonymised copy of this message" name="report" />}
        <TextAreaField defaultValue={expense?.note} label="Note (optional)" maxLength={1000} name="note" rows={2} />
      </form>
    </Sheet>
  );
}
