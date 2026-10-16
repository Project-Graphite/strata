import { useState } from 'react';
import { ConfirmDialog, DatePicker, formatDay, ListSkeleton, Meter, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { MoneyRow } from '../components/MoneyRow';
import { Section } from '../components/Page';
import { SpendingFrame } from '../components/SpendingFrame';
import { assetKindOptions, type Asset, type MoneyAccount, type NetWorth, type SavingsGoal } from '../spending';
import { useChosenSpace } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, moneyAmount, required, useFormErrors } from '../validation';
import { CurrencyField } from '../components/CurrencyField';
import { MissingRates, Stat, Stats } from '../components/Stats';

export function NetWorthPage() {
  const auth = useAuth();
  const action = useAction();
  const { spaceId, editable } = useChosenSpace();
  const worth = useResource<NetWorth>(spaceId ? `/spaces/${spaceId}/net-worth` : null, true);
  const goals = useResource<SavingsGoal[]>(spaceId ? `/spaces/${spaceId}/savings-goals` : null, true);
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true);
  const [dialog, setDialog] = useState<
    { asset: Asset | null } | { goal: SavingsGoal | null } | { add: SavingsGoal } | { deleteGoal: SavingsGoal } | { deleteAsset: Asset }
  >();
  const failed = worth.error ?? goals.error;

  return (
    <SpendingFrame
      accounts={accounts.data}
      currency={worth.data?.currency}
      onChanged={() => {
        worth.reload();
        accounts.reload();
      }}
      tab="net-worth"
    >
      {failed ? (
        <LoadError error={failed} onRetry={worth.error ? worth.reload : goals.reload} />
      ) : !worth.data || !goals.data ? (
        <ListSkeleton label="Adding up what you own" rows={5} />
      ) : (
        <>
          <Stats>
            <Stat label="Net worth" value={<Amount currency={worth.data.currency} minor={worth.data.totalMinor} />} />
            <Stat label="Accounts" value={<Amount currency={worth.data.currency} minor={worth.data.accountsMinor} />} />
            <Stat label="Assets" value={<Amount currency={worth.data.currency} minor={worth.data.assetsMinor} />} />
            <Stat label="Installments owed" value={<Amount currency={worth.data.currency} minor={worth.data.installmentsMinor} />} />
          </Stats>
          <MissingRates currencies={worth.data.missing} />

          <Section action={editable && <Button icon="plus" label="New savings goal" onClick={() => setDialog({ goal: null })} />} title="Savings goals">
            {goals.data.length === 0 ? (
              <Hint>No savings goals yet.</Hint>
            ) : (
              <ul className="panel-rows">
                {goals.data.map((goal) => (
                  <MoneyRow
                    amount={
                      goal.savedMinor !== null && (
                        <Amount currency={goal.currency} minor={goal.savedMinor}>
                          {` of ${money(goal.targetMinor, goal.currency)}`}
                        </Amount>
                      )
                    }
                    detail={[
                      goal.savedMinor === null && 'No exchange rate yet',
                      goal.dueOn && `by ${formatDay(goal.dueOn, { day: 'numeric', month: 'short', year: 'numeric' })}`,
                      goal.accountId && accounts.data?.find((account) => account.id === goal.accountId)?.name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    key={goal.id}
                    meter={<Meter label={`${goal.name} saved`} value={goal.targetMinor ? Math.min(1, Math.max(0, goal.savedMinor ?? 0) / goal.targetMinor) : 1} />}
                    onOpen={editable ? () => setDialog({ goal }) : undefined}
                    title={goal.name}
                  >
                    {editable && (
                      <ActionsMenu
                        items={[
                          ...(goal.accountId ? [] : [{ label: 'Add or take out', onSelect: () => setDialog({ add: goal }) }]),
                          { label: 'Delete', separated: true, onSelect: () => setDialog({ deleteGoal: goal }) },
                        ]}
                        name={goal.name}
                      />
                    )}
                  </MoneyRow>
                ))}
              </ul>
            )}
          </Section>

          <Section action={editable && <Button icon="plus" label="New asset" onClick={() => setDialog({ asset: null })} />} title="Assets">
            {worth.data.assets.length === 0 ? (
              <Hint>No assets yet.</Hint>
            ) : (
              <ul className="panel-rows">
                {worth.data.assets.map((asset) => (
                  <MoneyRow
                    amount={<Amount currency={asset.currency} minor={asset.valueMinor} />}
                    detail={[
                      assetKindOptions.find((option) => option.value === asset.kind)?.label,
                      asset.ratePercent !== null && `${asset.ratePercent}% a year`,
                      asset.maturesOn && `matures ${formatDay(asset.maturesOn, { day: 'numeric', month: 'short', year: 'numeric' })}`,
                      `updated ${formatDay(asset.updatedAt.slice(0, 10), { day: 'numeric', month: 'short' })}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    key={asset.id}
                    onOpen={editable ? () => setDialog({ asset }) : undefined}
                    title={asset.name}
                  >
                    {editable && <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDialog({ deleteAsset: asset }) }]} name={asset.name} />}
                  </MoneyRow>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {spaceId && worth.data && dialog && 'asset' in dialog && (
        <AssetEditor asset={dialog.asset ?? undefined} currency={worth.data.currency} onClose={() => setDialog(undefined)} onSaved={worth.reload} spaceId={spaceId} />
      )}
      {spaceId && worth.data && dialog && 'goal' in dialog && (
        <SavingsGoalEditor
          accounts={accounts.data ?? []}
          currency={worth.data.currency}
          goal={dialog.goal ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={goals.reload}
          spaceId={spaceId}
        />
      )}
      {dialog && 'add' in dialog && <AddToGoal goal={dialog.add} onClose={() => setDialog(undefined)} onSaved={goals.reload} />}
      {dialog && 'deleteGoal' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete goal"
          errorFallback="Could not delete the goal"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/savings-goals/${dialog.deleteGoal.id}`, { method: 'DELETE' });
            goals.mutate((current) => current.filter((shown) => shown.id !== dialog.deleteGoal.id));
            action.report(`Deleted ${dialog.deleteGoal.name}.`);
          }}
          title={`Delete ${dialog.deleteGoal.name}?`}
          tone="danger"
        >
          Its progress is lost. Nothing in your accounts changes.
        </ConfirmDialog>
      )}
      {dialog && 'deleteAsset' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete asset"
          errorFallback="Could not delete the asset"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/assets/${dialog.deleteAsset.id}`, { method: 'DELETE' });
            worth.reload();
            action.report(`Deleted ${dialog.deleteAsset.name}.`);
          }}
          title={`Delete ${dialog.deleteAsset.name}?`}
          tone="danger"
        >
          It no longer counts towards your net worth.
        </ConfirmDialog>
      )}
    </SpendingFrame>
  );
}

function AssetEditor({ asset, currency, onClose, onSaved, spaceId }: { asset?: Asset; currency: string; onClose: () => void; onSaved: () => void; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [kind, setKind] = useState(asset?.kind ?? 'gold');
  const [chosenCurrency, setChosenCurrency] = useState(asset?.currency ?? currency);
  const [maturesOn, setMaturesOn] = useState(asset?.maturesOn ?? '');
  const rate = (value: string) => (!value.trim() || (/^\d+([.,]\d+)?$/.test(value.trim()) && Number(value.replace(',', '.')) <= 100) ? undefined : 'Enter a rate from 0 to 100.');

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={asset ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { name: [required('Name the asset.'), atMost(120, 'Use at most 120 characters.')], value: [required('Enter what it is worth.'), moneyAmount], rate: [rate] })) return;
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim();
        const certificate = kind === 'certificate';
        const body = {
          name: text('name'),
          kind,
          currency: chosenCurrency,
          valueMinor: toMinor(text('value'), chosenCurrency),
          ratePercent: certificate && text('rate') ? Number(text('rate').replace(',', '.')) : null,
          maturesOn: certificate && maturesOn ? maturesOn : null,
        };
        void saving
          .run(async () => {
            await auth.request(asset ? `/assets/${asset.id}` : `/spaces/${spaceId}/assets`, { method: asset ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            onSaved();
            return `${asset ? 'Saved' : 'Added'} ${body.name}.`;
          }, 'Could not save the asset')
          .then((saved) => saved && onClose());
      }}
      submitLabel={asset ? 'Save' : 'Add asset'}
      title={asset ? 'Edit asset' : 'New asset'}
    >
      <TextField autoComplete="off" autoFocus defaultValue={asset?.name} label="Name" maxLength={120} placeholder="21k gold, 20 g" {...form.field('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Kind" onChange={setKind} options={assetKindOptions} value={kind} />
        <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
        <TextField defaultValue={asset ? fromMinor(asset.valueMinor, asset.currency) : ''} inputMode="decimal" label="Worth today" {...form.field('value')} />
        {kind === 'certificate' && <TextField defaultValue={asset?.ratePercent ?? ''} inputMode="decimal" label="Yearly rate % (optional)" {...form.field('rate')} />}
        {kind === 'certificate' && <DatePicker label="Matures on (optional)" onChange={setMaturesOn} value={maturesOn} />}
      </div>
    </FormDialog>
  );
}

function SavingsGoalEditor({
  accounts,
  currency,
  goal,
  onClose,
  onSaved,
  spaceId,
}: {
  accounts: MoneyAccount[];
  currency: string;
  goal?: SavingsGoal;
  onClose: () => void;
  onSaved: () => void;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [chosenCurrency, setChosenCurrency] = useState(goal?.currency ?? currency);
  const [dueOn, setDueOn] = useState(goal?.dueOn ?? '');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={goal ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { name: [required('Name the goal.'), atMost(120, 'Use at most 120 characters.')], target: [required('Enter the amount to save.'), moneyAmount] })) return;
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim();
        const body = { name: text('name'), currency: chosenCurrency, targetMinor: toMinor(text('target'), chosenCurrency), dueOn: dueOn || null, accountId: accountId || null };
        void saving
          .run(async () => {
            await auth.request(goal ? `/savings-goals/${goal.id}` : `/spaces/${spaceId}/savings-goals`, { method: goal ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            onSaved();
            return `${goal ? 'Saved' : 'Added'} ${body.name}.`;
          }, 'Could not save the goal')
          .then((saved) => saved && onClose());
      }}
      submitLabel={goal ? 'Save' : 'Add goal'}
      title={goal ? 'Edit savings goal' : 'New savings goal'}
    >
      <TextField autoComplete="off" autoFocus defaultValue={goal?.name} label="Name" maxLength={120} placeholder="New car" {...form.field('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField defaultValue={goal ? fromMinor(goal.targetMinor, goal.currency) : ''} inputMode="decimal" label="Target" {...form.field('target')} />
        <CurrencyField onChange={setChosenCurrency} value={chosenCurrency} />
        <DatePicker label="By (optional)" onChange={setDueOn} value={dueOn} />
        {accounts.length > 0 && (
          <Select label="Follow an account" onChange={setAccountId} options={[{ value: '', label: 'No, I add to it' }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]} value={accountId} />
        )}
      </div>
    </FormDialog>
  );
}

function AddToGoal({ goal, onClose, onSaved }: { goal: SavingsGoal; onClose: () => void; onSaved: () => void }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [direction, setDirection] = useState<'add' | 'take'>('add');

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { amount: [required('Enter an amount.'), moneyAmount] })) return;
        const amountMinor = toMinor(String(new FormData(target).get('amount')).trim(), goal.currency) * (direction === 'take' ? -1 : 1);
        void saving
          .run(async () => {
            await auth.request(`/savings-goals/${goal.id}/add`, { method: 'POST', body: JSON.stringify({ amountMinor }) });
            onSaved();
            return direction === 'take' ? `Took ${money(-amountMinor, goal.currency)} out of ${goal.name}.` : `Added ${money(amountMinor, goal.currency)} to ${goal.name}.`;
          }, 'Could not update the goal')
          .then((saved) => saved && onClose());
      }}
      submitLabel="Save"
      title="Add or take out"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Action"
          onChange={setDirection}
          options={[
            { value: 'add', label: 'Add' },
            { value: 'take', label: 'Take out' },
          ]}
          value={direction}
        />
        <TextField autoFocus inputMode="decimal" label={`Amount (${goal.currency})`} {...form.field('amount')} />
      </div>
    </FormDialog>
  );
}
