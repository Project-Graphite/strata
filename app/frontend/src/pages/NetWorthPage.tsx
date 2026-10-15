import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { DatePicker, formatDay, ListSkeleton, Meter, Select, Tabs, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section, Toolbar } from '../components/Page';
import { assetKindOptions, spendingTabs, type Asset, type MoneyAccount, type NetWorth, type SavingsGoal } from '../spending';
import { SpaceChooser, useChosenSpace } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, moneyAmount, required, useFormErrors } from '../validation';
import { CurrencyField } from '../components/CurrencyField';
import { MissingRates, Stat, Stats } from '../components/Stats';

export function NetWorthPage() {
  const auth = useAuth();
  const action = useAction();
  const [params] = useSearchParams();
  const { spaceId, editable } = useChosenSpace();
  const worth = useResource<NetWorth>(spaceId ? `/spaces/${spaceId}/net-worth` : null, true);
  const goals = useResource<SavingsGoal[]>(spaceId ? `/spaces/${spaceId}/savings-goals` : null, true);
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true);
  const [dialog, setDialog] = useState<{ asset: Asset | null } | { goal: SavingsGoal | null } | { add: SavingsGoal }>();
  const failed = worth.error ?? goals.error;

  return (
    <Page
      actions={
        editable && (
          <>
            <HeaderButton label="Add a goal" onClick={() => setDialog({ goal: null })} />
            <HeaderButton icon="plus" label="Add an asset" onClick={() => setDialog({ asset: null })} primary />
          </>
        )
      }
      title="Spending"
    >
      <Tabs items={spendingTabs('net-worth', params.get('space'))} label="Spending" />
      <Toolbar actions={<SpaceChooser />} />
      {failed ? (
        <LoadError error={failed} onRetry={worth.error ? worth.reload : goals.reload} />
      ) : !worth.data || !goals.data ? (
        <ListSkeleton label="Adding up what you own" rows={5} />
      ) : (
        <>
          <Stats>
            <Stat label="Net worth" value={money(worth.data.totalMinor, worth.data.currency)} />
            <Stat label="Accounts" value={money(worth.data.accountsMinor, worth.data.currency)} />
            <Stat label="Assets" value={money(worth.data.assetsMinor, worth.data.currency)} />
            <Stat label="Installments owed" value={money(worth.data.installmentsMinor, worth.data.currency)} />
          </Stats>
          <MissingRates currencies={worth.data.missing} />

          <Section title="Savings goals">
            {goals.data.length === 0 ? (
              <Hint>No savings goals.</Hint>
            ) : (
              <ul className="panel-rows">
                {goals.data.map((goal) => (
                  <li className="panel-row grid gap-2" key={goal.id}>
                    <span className="flex items-center gap-3">
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-ink">{goal.name}</span>
                        <span className="truncate text-sm text-muted">
                          {[
                            goal.savedMinor === null ? 'No exchange rate yet' : `${money(goal.savedMinor, goal.currency)} of ${money(goal.targetMinor, goal.currency)}`,
                            goal.dueOn && `by ${formatDay(goal.dueOn, { day: 'numeric', month: 'short', year: 'numeric' })}`,
                            goal.accountId && accounts.data?.find((account) => account.id === goal.accountId)?.name,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {editable && (
                        <ActionsMenu
                          items={[
                            ...(goal.accountId ? [] : [{ label: 'Add or take out', onSelect: () => setDialog({ add: goal }) }]),
                            { label: 'Edit', onSelect: () => setDialog({ goal }) },
                            {
                              label: 'Remove',
                              separated: true,
                              onSelect: () =>
                                void action.run(async () => {
                                  await auth.request(`/savings-goals/${goal.id}`, { method: 'DELETE' });
                                  goals.mutate((current) => current.filter((shown) => shown.id !== goal.id));
                                  return `Removed ${goal.name}.`;
                                }, 'Could not remove the goal'),
                            },
                          ]}
                          name={goal.name}
                        />
                      )}
                    </span>
                    <Meter label={`${goal.name} saved`} value={goal.targetMinor ? Math.max(0, goal.savedMinor ?? 0) / goal.targetMinor : 1} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Assets">
            {worth.data.assets.length === 0 ? (
              <Hint>No assets.</Hint>
            ) : (
              <ul className="panel-rows">
                {worth.data.assets.map((asset) => (
                  <li className="panel-row flex items-center gap-3" key={asset.id}>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-ink">{asset.name}</span>
                      <span className="truncate text-sm text-muted">
                        {[
                          assetKindOptions.find((option) => option.value === asset.kind)?.label,
                          asset.ratePercent !== null && `${asset.ratePercent}% a year`,
                          asset.maturesOn && `matures ${formatDay(asset.maturesOn, { day: 'numeric', month: 'short', year: 'numeric' })}`,
                          `updated ${formatDay(asset.updatedAt.slice(0, 10), { day: 'numeric', month: 'short' })}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-ink">{money(asset.valueMinor, asset.currency)}</span>
                    {editable && (
                      <ActionsMenu
                        items={[
                          { label: 'Edit', onSelect: () => setDialog({ asset }) },
                          {
                            label: 'Remove',
                            separated: true,
                            onSelect: () =>
                              void action.run(async () => {
                                await auth.request(`/assets/${asset.id}`, { method: 'DELETE' });
                                worth.reload();
                                return `Removed ${asset.name}.`;
                              }, 'Could not remove the asset'),
                          },
                        ]}
                        name={asset.name}
                      />
                    )}
                  </li>
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
        <GoalEditor
          accounts={accounts.data ?? []}
          currency={worth.data.currency}
          goal={dialog.goal ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={goals.reload}
          spaceId={spaceId}
        />
      )}
      {dialog && 'add' in dialog && <AddToGoal goal={dialog.add} onClose={() => setDialog(undefined)} onSaved={goals.reload} />}
    </Page>
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
      busyLabel="Saving…"
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
            return asset ? '' : `Added ${body.name}.`;
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

function GoalEditor({
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
      busyLabel="Saving…"
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
            return goal ? '' : `Added ${body.name}.`;
          }, 'Could not save the goal')
          .then((saved) => saved && onClose());
      }}
      submitLabel={goal ? 'Save' : 'Add goal'}
      title={goal ? 'Edit goal' : 'New savings goal'}
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
            return '';
          }, 'Could not update the goal')
          .then((saved) => saved && onClose());
      }}
      submitLabel="Save"
      title={goal.name}
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
