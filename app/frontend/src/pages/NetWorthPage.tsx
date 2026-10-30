import { useState } from 'react';
import { ConfirmDialog, DatePicker, ListRow, Meter, Placeholder, Select, Stat, StatGrid, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Section } from '../components/Page';
import { AmountRowsSkeleton, ButtonSkeleton, rowsOf, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { SpendingFirstRunSkeleton, SpendingFrame } from '../components/SpendingFrame';
import { assetKindOptions, spendingLive, type Asset, type MoneyAccount, type NetWorth, type SavingsGoal } from '../spending';
import { usePersonalSpace } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { capitalised, formatDate, formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, moneyAmount, required, useFormErrors } from '../validation';
import { CurrencyField } from '../components/CurrencyField';
import { MissingRates } from '../components/Stats';
import { Empty } from '../components/Empty';

const emptyWorth = { title: 'Nothing to add up yet', hint: 'Add your accounts under Accounts, and assets such as gold, certificates or property below, to see what you own minus what you owe.' };
const emptyGoals = { title: 'No savings goals yet', hint: 'Set an amount to save towards and follow how close you are.' };
const emptyAssets = { title: 'No assets yet', hint: 'Add gold, certificates or property to count them in your net worth.' };

export function NetWorthPage() {
  const auth = useAuth();
  const action = useAction();
  const { spaceId, space, editable } = usePersonalSpace();
  const worth = useResource<NetWorth>(spaceId ? `/spaces/${spaceId}/net-worth` : null, true, spendingLive);
  const goals = useResource<SavingsGoal[]>(spaceId ? `/spaces/${spaceId}/savings-goals` : null, true, spendingLive);
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true, spendingLive);
  const [dialog, setDialog] = useState<
    { asset: Asset | null } | { goal: SavingsGoal | null } | { add: SavingsGoal } | { deleteGoal: SavingsGoal } | { deleteAsset: Asset }
  >();
  const failed = worth.error ?? goals.error;
  const goalDetail = (goal: SavingsGoal) =>
    capitalised(
      [
        goal.savedMinor === null && 'No exchange rate yet',
        goal.dueOn && `by ${formatDate(goal.dueOn)}`,
        goal.accountId && accounts.data?.find((account) => account.id === goal.accountId)?.name,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  const firstRun = accounts.data?.length === 0 && worth.data?.assets.length === 0 && goals.data?.length === 0 && worth.data.installmentsMinor === 0;
  const [goalRows, detailedGoals, assetRows, empty] = useRememberedShape(
    'net-worth',
    worth.data &&
      goals.data &&
      accounts.data && [
        goals.data.length,
        goals.data.filter(goalDetail).length,
        worth.data.assets.length,
        firstRun ? 1 : 0,
      ],
    [1, 1, 2, 0],
  );

  return (
    <SpendingFrame
      accounts={accounts.data}
      currency={worth.data?.currency}
      empty={firstRun ? emptyWorth : undefined}
      onChanged={() => {
        worth.reload();
        accounts.reload();
      }}
      tab="net-worth"
    >
      {failed ? (
        <LoadError error={failed} onRetry={worth.error ? worth.reload : goals.reload} />
      ) : !worth.data || !goals.data ? (
        <Placeholder className="grid gap-8" label="Adding up what you own">
          {empty ? (
            <SpendingFirstRunSkeleton empty={emptyWorth} />
          ) : (
            <StatGrid>
              {rowsOf(4).map((stat) => (
                <Stat key={stat} label={<SkeletonLine width="w-24" />} value={<SkeletonLine width="w-32" />} />
              ))}
            </StatGrid>
          )}
          <Section action={(!space || editable) && <ButtonSkeleton width="w-44" />} title="Savings goals">
            {goalRows ? (
              <AmountRowsSkeleton detailed={detailedGoals} metered={goalRows} rows={goalRows} />
            ) : (
              <Empty loading title={emptyGoals.title}>
                {emptyGoals.hint}
              </Empty>
            )}
          </Section>
          <Section action={(!space || editable) && <ButtonSkeleton />} title="Assets">
            {assetRows ? (
              <AmountRowsSkeleton rows={assetRows} />
            ) : (
              <Empty loading title={emptyAssets.title}>
                {emptyAssets.hint}
              </Empty>
            )}
          </Section>
        </Placeholder>
      ) : (
        <>
          {!firstRun && (
            <StatGrid>
              <Stat label="Net worth" value={<Amount currency={worth.data.currency} minor={worth.data.totalMinor} />} />
              <Stat label="Accounts" value={<Amount currency={worth.data.currency} minor={worth.data.accountsMinor} />} />
              <Stat label="Assets" value={<Amount currency={worth.data.currency} minor={worth.data.assetsMinor} />} />
              <Stat label="Installments owed" value={<Amount currency={worth.data.currency} minor={worth.data.installmentsMinor} />} />
            </StatGrid>
          )}
          <MissingRates currencies={worth.data.missing} />

          <Section action={editable && <Button icon="plus" label="New savings goal" onClick={() => setDialog({ goal: null })} />} title="Savings goals">
            {goals.data.length === 0 ? (
              <Empty level={3} title={emptyGoals.title}>
                {emptyGoals.hint}
              </Empty>
            ) : (
              <ul className="panel-rows">
                {goals.data.map((goal) => (
                  <ListRow
                    key={goal.id}
                    meta={goalDetail(goal)}
                    onClick={editable ? () => setDialog({ goal }) : undefined}
                    title={goal.name}
                    trail={
                      <>
                        {goal.savedMinor !== null && (
                          <Amount currency={goal.currency} minor={goal.savedMinor}>
                            {` of ${money(goal.targetMinor, goal.currency)}`}
                          </Amount>
                        )}
                        {editable && (
                          <ActionsMenu
                            items={[
                              ...(goal.accountId ? [] : [{ label: 'Add or take out', onSelect: () => setDialog({ add: goal }) }]),
                              { label: 'Delete', separated: true, onSelect: () => setDialog({ deleteGoal: goal }) },
                            ]}
                            name={goal.name}
                          />
                        )}
                      </>
                    }
                  >
                    <Meter label={`${goal.name} saved`} value={goal.targetMinor ? Math.min(1, Math.max(0, goal.savedMinor ?? 0) / goal.targetMinor) : 1} />
                  </ListRow>
                ))}
              </ul>
            )}
          </Section>

          <Section action={editable && <Button icon="plus" label="New asset" onClick={() => setDialog({ asset: null })} />} title="Assets">
            {worth.data.assets.length === 0 ? (
              <Empty level={3} title={emptyAssets.title}>
                {emptyAssets.hint}
              </Empty>
            ) : (
              <ul className="panel-rows">
                {worth.data.assets.map((asset) => (
                  <ListRow
                    key={asset.id}
                    meta={[
                      assetKindOptions.find((option) => option.value === asset.kind)?.label,
                      asset.ratePercent !== null && `${asset.ratePercent}% a year`,
                      asset.maturesOn && `matures ${formatDate(asset.maturesOn)}`,
                      `updated ${formatMoment(asset.updatedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onClick={editable ? () => setDialog({ asset }) : undefined}
                    title={asset.name}
                    trail={
                      <>
                        <Amount currency={asset.currency} minor={asset.valueMinor} />
                        {editable && <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDialog({ deleteAsset: asset }) }]} name={asset.name} />}
                      </>
                    }
                  />
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
      submitLabel={asset ? 'Save changes' : 'Add asset'}
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
      submitLabel={goal ? 'Save changes' : 'Add goal'}
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
      submitLabel={direction === 'take' ? 'Take out' : 'Add to goal'}
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
