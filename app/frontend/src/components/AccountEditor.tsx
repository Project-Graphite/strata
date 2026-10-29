import { useState } from 'react';
import { Icon, Select, tagColors, TextField, type IconName, type TagColor } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { accountKindOptions, categoryName, type AccountKind, type MoneyAccount } from '../spending';
import { fromMinor, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { atMost, moneyAmount, required, useFormErrors, type Check } from '../validation';
import { FormDialog } from './FormDialog';
import { CurrencyField } from './CurrencyField';
import { DayOfMonthField } from './DayOfMonthField';

const listOf = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const cardEndings: Check = (value) => (listOf(value).every((part) => /^\d{4}$/.test(part)) ? undefined : 'Enter the last 4 digits of each card, separated by commas.');
const optionalAmount: Check = (value) => (value.trim() ? moneyAmount(value) : undefined);
const colourOptions = [
  { value: '' as const, label: 'No colour' },
  ...tagColors.map((colour) => ({ value: colour, label: categoryName(colour), leading: <span aria-hidden="true" className={`swatch-dot tag-${colour}`} /> })),
];
const accountIcons: IconName[] = ['wallet', 'home', 'lock', 'shield', 'monitor', 'target', 'key', 'clock', 'gift', 'plane', 'user', 'tag'];
const iconOptions = [{ value: '' as const, label: 'By type' }, ...accountIcons.map((icon) => ({ value: icon, label: categoryName(icon), leading: <Icon name={icon} size={16} /> }))];

export function AccountEditor({
  account,
  accounts,
  currency,
  onClose,
  onSaved,
  spaceId,
}: {
  account?: MoneyAccount;
  accounts: MoneyAccount[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank_current');
  const [chosenCurrency, setChosenCurrency] = useState(account?.currency ?? currency);
  const [fundedBy, setFundedBy] = useState(account?.fundedByAccountId ?? '');
  const [colour, setColour] = useState<TagColor | ''>(account?.colour ?? '');
  const [icon, setIcon] = useState<IconName | ''>(account?.icon ?? '');
  const owed = kind === 'credit_card';
  const shownBalance = account ? fromMinor(Math.abs(account.balanceMinor), account.currency) : '';
  const funders = accounts.filter((other) => other.id !== account?.id && (!other.archivedAt || other.id === fundedBy));

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={account ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            name: [required('Name the account.'), atMost(60, 'Use at most 60 characters.')],
            institution: [atMost(60, 'Use at most 60 characters.')],
            handle: [atMost(120, 'Use at most 120 characters.')],
            balance: [optionalAmount],
            creditLimit: [optionalAmount],
            ...(account ? {} : { cardDigits: [cardEndings] }),
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
          institution: text('institution') || null,
          handle: text('handle') || null,
          fundedByAccountId: fundedBy || null,
          colour: colour || null,
          icon: icon || null,
          ...(account ? {} : { cardDigits: listOf(text('cardDigits')) }),
          senders: listOf(text('senders')),
          creditLimitMinor: owed && text('creditLimit') ? toMinor(text('creditLimit'), chosenCurrency) : null,
          dueDay: owed && text('dueDay') ? Number(text('dueDay')) : null,
          ...(balance === shownBalance && account?.currency === chosenCurrency ? {} : { balanceMinor: (owed ? -1 : 1) * toMinor(balance || '0', chosenCurrency) }),
        };
        void saving
          .run(async () => {
            await auth.request(account ? `/accounts/${account.id}` : `/spaces/${spaceId}/accounts`, { method: account ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            onSaved();
            return `${account ? 'Saved' : 'Added'} ${body.name}.`;
          }, 'Could not save the account')
          .then((saved) => saved && onClose());
      }}
      submitLabel={account ? 'Save' : 'Add account'}
      title={account ? 'Edit account' : 'New account'}
    >
      <TextField autoComplete="off" autoFocus defaultValue={account?.name} label="Name" maxLength={60} placeholder="CIB current account" {...form.field('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Type" onChange={setKind} options={accountKindOptions} value={kind} />
        <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
        <TextField defaultValue={shownBalance} inputMode="decimal" label={owed ? 'Owed today' : 'Balance today'} {...form.field('balance')} />
        {owed && (
          <TextField defaultValue={account?.creditLimitMinor ? fromMinor(account.creditLimitMinor, account.currency) : ''} inputMode="decimal" label="Credit limit (optional)" {...form.field('creditLimit')} />
        )}
        {owed && (
          <DayOfMonthField
            defaultValue={account?.dueDay ? String(account.dueDay) : ''}
            emptyLabel="Not set"
            label="Payment due on"
            last={31}
            name="dueDay"
            presets={[{ label: 'Last day', value: '31' }]}
          />
        )}
        <TextField autoComplete="off" defaultValue={account?.institution ?? ''} label="Bank or provider (optional)" maxLength={60} placeholder="CIB, Vodafone, valU" {...form.field('institution')} />
        {kind !== 'cash' && (
          <TextField
            autoComplete="off"
            defaultValue={account?.handle ?? ''}
            dir="auto"
            label="InstaPay address or wallet number (optional)"
            maxLength={120}
            placeholder="name@instapay or 010…"
            {...form.field('handle')}
          />
        )}
        {funders.length > 0 && (
          <Select
            label="Funded by"
            onChange={setFundedBy}
            options={[{ value: '', label: 'Nothing' }, ...funders.map((other) => ({ value: other.id, label: other.name }))]}
            value={fundedBy}
          />
        )}
        <Select label="Colour" onChange={setColour} options={colourOptions} value={colour} />
        <Select label="Icon" onChange={setIcon} options={iconOptions} value={icon} />
      </div>
      {kind !== 'cash' && (
        <>
          {!account && <TextField inputMode="numeric" label="Card endings (optional)" placeholder="1234, 5678" {...form.field('cardDigits')} />}
          <TextField defaultValue={account?.senders.join(', ')} label="SMS chats or apps (optional)" placeholder="CIB, InstaPay, nSave, PayPal" {...form.field('senders')} />
        </>
      )}
    </FormDialog>
  );
}
