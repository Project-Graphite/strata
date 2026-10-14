import { useState } from 'react';
import { Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { allCurrencies, currencyOptions } from '../choices';
import { accountKindOptions, type AccountKind, type MoneyAccount } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, moneyAmount, required, useFormErrors, type Check } from '../validation';
import { FormDialog } from './FormDialog';

const listOf = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const cardEndings: Check = (value) => (listOf(value).every((part) => /^\d{4}$/.test(part)) ? undefined : 'Enter the last 4 digits of each card, separated by commas.');
const optionalAmount: Check = (value) => (value.trim() ? moneyAmount(value) : undefined);

export function AccountEditor({
  account,
  currency,
  onClose,
  onSaved,
  spaceId,
}: {
  account?: MoneyAccount;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank');
  const [chosenCurrency, setChosenCurrency] = useState(account?.currency ?? currency);
  const owed = kind === 'credit';
  const shownBalance = account ? fromMinor(Math.abs(account.balanceMinor), account.currency) : '';

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            name: [required('Name the account.'), atMost(60, 'Use at most 60 characters.')],
            balance: [optionalAmount],
            creditLimit: [optionalAmount],
            cardDigits: [cardEndings],
          })
        ) {
          return;
        }
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim();
        const balance = text('balance');
        const body = {
          name: text('name'),
          kind,
          currency: chosenCurrency,
          cardDigits: listOf(text('cardDigits')),
          senders: listOf(text('senders')),
          creditLimitMinor: owed && text('creditLimit') ? toMinor(text('creditLimit'), chosenCurrency) : null,
          ...(balance === shownBalance && account?.currency === chosenCurrency ? {} : { balanceMinor: (owed ? -1 : 1) * toMinor(balance || '0', chosenCurrency) }),
        };
        void saving
          .run(async () => {
            await auth.request(account ? `/accounts/${account.id}` : `/spaces/${spaceId}/accounts`, { method: account ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            onSaved();
            return account ? '' : `Added ${body.name}.`;
          }, 'Could not save the account')
          .then((saved) => saved && onClose());
      }}
      submitLabel={account ? 'Save' : 'Add account'}
      title={account ? 'Edit account' : 'New account'}
    >
      <TextField autoComplete="off" autoFocus defaultValue={account?.name} label="Name" maxLength={60} placeholder="CIB current account" {...form.field('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Type" onChange={setKind} options={accountKindOptions} value={kind} />
        <Select label="Currency" onChange={setChosenCurrency} options={currencyOptions(allCurrencies)} searchable value={chosenCurrency} />
        <TextField defaultValue={shownBalance} inputMode="decimal" label={owed ? 'Owed today' : 'Balance today'} {...form.field('balance')} />
        {owed && (
          <TextField defaultValue={account?.creditLimitMinor ? fromMinor(account.creditLimitMinor, account.currency) : ''} inputMode="decimal" label="Credit limit (optional)" {...form.field('creditLimit')} />
        )}
      </div>
      {kind !== 'cash' && (
        <>
          <TextField defaultValue={account?.cardDigits.join(', ')} inputMode="numeric" label="Card endings (optional)" placeholder="1234, 5678" {...form.field('cardDigits')} />
          <TextField defaultValue={account?.senders.join(', ')} label="SMS senders (optional)" placeholder="CIB" {...form.field('senders')} />
        </>
      )}
    </FormDialog>
  );
}
