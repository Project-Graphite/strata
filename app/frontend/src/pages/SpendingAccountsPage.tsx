import { useState } from 'react';
import { Badge, ConfirmDialog, Icon, ListRow, Meter, Placeholder, SectionHeading, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { AccountEditor } from '../components/AccountEditor';
import { ActionsMenu } from '../components/ActionsMenu';
import { AccountBalance } from '../components/Amount';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { InstallmentEditor } from '../components/InstallmentEditor';
import { LoadError } from '../components/LoadError';
import { Section } from '../components/Page';
import { AmountRowsSkeleton, ButtonSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { SpendingFrame } from '../components/SpendingFrame';
import {
  accountKindOptions,
  cardKindOptions,
  cardNetworkOptions,
  spendingHref,
  spendingLive,
  type AccountCard,
  type CardKind,
  type CardNetwork,
  type InstallmentPlan,
  type MoneyAccount,
} from '../spending';
import { usePersonalSpace } from '../spaces';
import { money, toMinor } from '../subscriptions';
import { formatDate, formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { amountText, atMost, moneyAmount, required, useFormErrors } from '../validation';

const emptyAccounts = { title: 'No accounts yet', hint: 'Add your bank accounts, cards, wallets and cash to follow their balances and move money between them.' };
const emptyPlans = { title: 'No installment plans yet', hint: 'Add a plan to track what is left to pay and get reminded before each payment.' };
const kindOf = (account: MoneyAccount) => accountKindOptions.find((option) => option.value === account.kind)!;
const cardName = (card: AccountCard) => {
  const kind = cardKindOptions.find((option) => option.value === card.kind)!.label;
  const network = card.network && cardNetworkOptions.find((option) => option.value === card.network)!.label;
  return `${network ? `${network} ${kind.toLowerCase()}` : kind} •••• ${card.last4}`;
};
const owedSign = (account: MoneyAccount) => (account.kind === 'credit_card' ? -1 : 1);
const signed = (minor: number, currency: string) => `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${money(Math.abs(minor), currency)}`;

type Dialog =
  | { account: MoneyAccount | null }
  | { card: AccountCard | null; owner: MoneyAccount }
  | { reconcile: MoneyAccount }
  | { installment: InstallmentPlan | null }
  | { deleteAccount: MoneyAccount }
  | { deleteCard: AccountCard; owner: MoneyAccount }
  | { deletePlan: InstallmentPlan };

export function SpendingAccountsPage() {
  const auth = useAuth();
  const action = useAction();
  const { spaceId, space, editable } = usePersonalSpace();
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true, spendingLive);
  const installments = useResource<InstallmentPlan[]>(spaceId ? `/spaces/${spaceId}/installments` : null, true, spendingLive);
  const [dialog, setDialog] = useState<Dialog>();
  const currency = accounts.data?.[0]?.currency ?? 'EGP';
  const [accountRows, planRows] = useRememberedShape('spending-accounts', accounts.data && installments.data && [accounts.data.length, installments.data.length], [2, 0]);
  const open = accounts.data?.filter((account) => !account.archivedAt) ?? [];
  const archived = accounts.data?.filter((account) => account.archivedAt) ?? [];
  const groups = accountKindOptions.map((kind) => ({ ...kind, accounts: open.filter((account) => account.kind === kind.value) })).filter((group) => group.accounts.length > 0);
  const newAccount = editable && <Button icon="plus" label="New account" onClick={() => setDialog({ account: null })} />;
  const archive = (account: MoneyAccount, archived: boolean) =>
    void action.run(async () => {
      await auth.request(`/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
      accounts.reload();
      return `${archived ? 'Archived' : 'Restored'} ${account.name}.`;
    }, `Could not ${archived ? 'archive' : 'restore'} the account`);
  const accountRowsOf = (shown: MoneyAccount[]) => (
    <ul className="panel-rows">
      {shown.map((account) => (
        <AccountRows
          account={account}
          editable={editable}
          funder={accounts.data?.find((other) => other.id === account.fundedByAccountId)?.name}
          key={account.id}
          onArchive={(archived) => archive(account, archived)}
          onDialog={setDialog}
        />
      ))}
    </ul>
  );

  return (
    <SpendingFrame accounts={accounts.data} currency={currency} onChanged={accounts.reload} tab="accounts">
      {accounts.error ? (
        <LoadError error={accounts.error} onRetry={accounts.reload} />
      ) : !accounts.data || (!installments.data && !installments.error) ? (
        <Placeholder className="grid gap-8" label="Adding up your accounts">
          <section className="grid min-w-0 grid-cols-1 gap-3">
            <SectionHeading action={(!space || editable) && <ButtonSkeleton width="w-36" />} title={<SkeletonLine width="w-32" />} />
            {accountRows ? (
              <AmountRowsSkeleton rows={accountRows} />
            ) : (
              <Empty loading title={emptyAccounts.title}>
                {emptyAccounts.hint}
              </Empty>
            )}
          </section>
          <Section action={(!space || editable) && <ButtonSkeleton />} title="Installments">
            {planRows ? (
              <AmountRowsSkeleton metered={planRows} rows={planRows} />
            ) : (
              <Empty loading title={emptyPlans.title}>
                {emptyPlans.hint}
              </Empty>
            )}
          </Section>
        </Placeholder>
      ) : (
        <>
          {groups.length === 0 ? (
            <Section action={newAccount} title="Accounts">
              <Empty level={3} title={emptyAccounts.title}>
                {emptyAccounts.hint}
              </Empty>
            </Section>
          ) : (
            groups.map((group, index) => (
              <Section action={index === 0 && newAccount} key={group.value} title={group.plural}>
                {accountRowsOf(group.accounts)}
              </Section>
            ))
          )}
          {archived.length > 0 && <Section title="Archived">{accountRowsOf(archived)}</Section>}

          <Section action={editable && <Button icon="plus" label="New plan" onClick={() => setDialog({ installment: null })} />} title="Installments">
            {installments.error ? (
              <LoadError compact error={installments.error} onRetry={installments.reload} />
            ) : !installments.data?.length ? (
              <Empty level={3} title={emptyPlans.title}>
                {emptyPlans.hint}
              </Empty>
            ) : (
              <ul className="panel-rows">
                {installments.data.map((plan) => (
                  <ListRow
                    key={plan.id}
                    meta={
                      plan.status === 'done'
                        ? 'Paid off'
                        : `Next: ${money(plan.monthlyMinor, plan.currency)}, due ${formatDate(plan.nextDueOn!)} · ${money(plan.remainingMinor, plan.currency)} left`
                    }
                    onClick={editable ? () => setDialog({ installment: plan }) : undefined}
                    title={plan.name}
                    trail={
                      <>
                        <span className="shrink-0 text-small text-muted tabular-nums">
                          {plan.paidCount} of {plan.count}
                        </span>
                        {plan.status === 'missed' && <Badge tone="danger">Missed</Badge>}
                        {editable && (
                          <ActionsMenu
                            items={[
                              ...(plan.status === 'done'
                                ? []
                                : [
                                    {
                                      label: 'Mark next payment paid',
                                      onSelect: () =>
                                        void action.run(async () => {
                                          const updated = await auth.request<InstallmentPlan>(`/installments/${plan.id}/paid`, { method: 'POST' });
                                          installments.mutate((current) => current.map((shown) => (shown.id === plan.id ? updated : shown)));
                                          return `Marked a ${plan.name} payment paid.`;
                                        }, 'Could not mark the payment'),
                                    },
                                  ]),
                              { label: 'Delete', separated: true, onSelect: () => setDialog({ deletePlan: plan }) },
                            ]}
                            name={plan.name}
                          />
                        )}
                      </>
                    }
                  >
                    <Meter label={`${plan.name} paid`} value={plan.paidCount / plan.count} />
                  </ListRow>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {spaceId && typeof dialog === 'object' && 'account' in dialog && (
        <AccountEditor account={dialog.account ?? undefined} accounts={accounts.data ?? []} currency={currency} onClose={() => setDialog(undefined)} onSaved={accounts.reload} spaceId={spaceId} />
      )}
      {typeof dialog === 'object' && 'card' in dialog && <CardDialog account={dialog.owner} card={dialog.card} onClose={() => setDialog(undefined)} onSaved={accounts.reload} />}
      {typeof dialog === 'object' && 'reconcile' in dialog && <ReconcileDialog account={dialog.reconcile} onClose={() => setDialog(undefined)} onSaved={accounts.reload} />}
      {spaceId && typeof dialog === 'object' && 'installment' in dialog && (
        <InstallmentEditor
          accounts={accounts.data ?? []}
          currency={currency}
          onClose={() => setDialog(undefined)}
          onSaved={installments.reload}
          plan={dialog.installment ?? undefined}
          spaceId={spaceId}
        />
      )}
      {typeof dialog === 'object' && 'deleteAccount' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete account"
          errorFallback="Could not delete the account"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/accounts/${dialog.deleteAccount.id}`, { method: 'DELETE' });
            accounts.reload();
            action.report(`Deleted ${dialog.deleteAccount.name}.`);
          }}
          title={`Delete ${dialog.deleteAccount.name}?`}
          tone="danger"
        >
          Its transactions stay, but no longer belong to an account. Transfers show “Removed account” instead. Archive it instead to keep its history.
        </ConfirmDialog>
      )}
      {typeof dialog === 'object' && 'deleteCard' in dialog && (
        <ConfirmDialog
          busyLabel="Removing…"
          confirmLabel="Remove card"
          errorFallback="Could not remove the card"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/cards/${dialog.deleteCard.id}`, { method: 'DELETE' });
            accounts.reload();
            action.report(`Removed the card ending in ${dialog.deleteCard.last4}.`);
          }}
          title={`Remove the card ending in ${dialog.deleteCard.last4}?`}
          tone="danger"
        >
          Its transactions stay on {dialog.owner.name} and keep the card ending.
        </ConfirmDialog>
      )}
      {typeof dialog === 'object' && 'deletePlan' in dialog && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete plan"
          errorFallback="Could not delete the plan"
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await auth.request(`/installments/${dialog.deletePlan.id}`, { method: 'DELETE' });
            installments.mutate((current) => current.filter((shown) => shown.id !== dialog.deletePlan.id));
            action.report(`Deleted ${dialog.deletePlan.name}.`);
          }}
          title={`Delete ${dialog.deletePlan.name}?`}
          tone="danger"
        >
          Its reminders stop and the payments marked so far are forgotten.
        </ConfirmDialog>
      )}
    </SpendingFrame>
  );
}

function AccountRows({
  account,
  editable,
  funder,
  onArchive,
  onDialog,
}: {
  account: MoneyAccount;
  editable: boolean;
  funder: string | undefined;
  onArchive: (archived: boolean) => void;
  onDialog: (dialog: Dialog) => void;
}) {
  const kind = kindOf(account);
  return (
    <>
      <ListRow
        lead={
          <span className={account.colour ? `tag-${account.colour}` : undefined} style={account.colour ? { color: 'var(--tag-color)' } : undefined}>
            <Icon name={account.icon ?? kind.icon} size={18} />
          </span>
        }
        meta={[kind.label, account.institution, account.handle, funder && `Funded by ${funder}`].filter(Boolean).join(' · ')}
        onClick={editable ? () => onDialog({ account }) : undefined}
        title={account.name}
        trail={
          <>
            <AccountBalance account={account} />
            {editable && (
              <ActionsMenu
                items={[
                  { label: 'Show transactions', href: `${spendingHref('transactions')}?account=${account.id}` },
                  { label: 'Reconcile balance', onSelect: () => onDialog({ reconcile: account }) },
                  ...(account.kind === 'cash' ? [] : [{ label: 'Add a card', onSelect: () => onDialog({ card: null, owner: account }) }]),
                  account.archivedAt ? { label: 'Restore', onSelect: () => onArchive(false) } : { label: 'Archive', onSelect: () => onArchive(true) },
                  { label: 'Delete', separated: true, onSelect: () => onDialog({ deleteAccount: account }) },
                ]}
                name={account.name}
              />
            )}
          </>
        }
      >
        <BalanceTrend account={account} />
      </ListRow>
      {account.cards.map((card) => (
        <ListRow
          className="ps-12"
          key={card.id}
          lead={<Icon name="wallet" size={18} />}
          meta={card.label}
          onClick={editable ? () => onDialog({ card, owner: account }) : undefined}
          title={cardName(card)}
          trail={
            editable && (
              <ActionsMenu
                items={[
                  { label: 'Edit card', onSelect: () => onDialog({ card, owner: account }) },
                  { label: 'Remove card', separated: true, onSelect: () => onDialog({ deleteCard: card, owner: account }) },
                ]}
                name={`Card ending in ${card.last4}`}
              />
            )
          }
        />
      ))}
    </>
  );
}

function BalanceTrend({ account }: { account: MoneyAccount }) {
  const points = [...account.history.map((point) => ({ at: Date.parse(point.at), minor: point.balanceMinor })), { at: Date.now(), minor: account.balanceMinor }].map((point) => ({
    ...point,
    minor: owedSign(account) * point.minor,
  }));
  if (points.length < 2) return null;
  const [first] = points;
  const low = Math.min(...points.map((point) => point.minor));
  const span = Math.max(...points.map((point) => point.minor)) - low || 1;
  const duration = points.at(-1)!.at - first!.at || 1;
  return (
    <svg
      aria-label={`Balance ${money(first!.minor, account.currency)} on ${formatMoment(account.history[0]!.at)}, ${money(points.at(-1)!.minor, account.currency)} now`}
      className="h-6 w-40 max-w-full text-muted"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 24"
    >
      <polyline
        fill="none"
        points={points.map((point) => `${(((point.at - first!.at) / duration) * 100).toFixed(2)},${(22 - ((point.minor - low) / span) * 20).toFixed(2)}`).join(' ')}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CardDialog({ account, card, onClose, onSaved }: { account: MoneyAccount; card: AccountCard | null; onClose: () => void; onSaved: () => void }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [network, setNetwork] = useState<CardNetwork | ''>(card?.network ?? '');
  const [kind, setKind] = useState<CardKind>(card?.kind ?? (account.kind === 'credit_card' ? 'credit' : account.kind === 'prepaid' ? 'prepaid' : 'debit'));

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={card ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            last4: [(value) => (/^\d{4}$/.test(value.trim()) ? undefined : 'Enter the last 4 digits of the card.')],
            label: [atMost(40, 'Use at most 40 characters.')],
          })
        ) {
          return;
        }
        const values = new FormData(target);
        const body = { last4: String(values.get('last4')).trim(), label: String(values.get('label')).trim() || null, network: network || null, kind };
        void saving
          .run(async () => {
            await auth.request(card ? `/cards/${card.id}` : `/accounts/${account.id}/cards`, { method: card ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            onSaved();
            return `${card ? 'Saved' : 'Added'} the card ending in ${body.last4}.`;
          }, 'Could not save the card')
          .then((saved) => saved && onClose());
      }}
      submitLabel={card ? 'Save changes' : 'Add card'}
      title={card ? 'Edit card' : `New card on ${account.name}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField autoComplete="off" autoFocus defaultValue={card?.last4} hint="Only the last 4 digits." inputMode="numeric" label="Card ending" maxLength={4} {...form.field('last4')} />
        <TextField autoComplete="off" defaultValue={card?.label ?? ''} label="Name (optional)" maxLength={40} placeholder="Daily card" {...form.field('label')} />
        <Select label="Network" onChange={setNetwork} options={cardNetworkOptions} value={network} />
        <Select label="Kind" onChange={setKind} options={cardKindOptions} value={kind} />
      </div>
    </FormDialog>
  );
}

function ReconcileDialog({ account, onClose, onSaved }: { account: MoneyAccount; onClose: () => void; onSaved: () => void }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [entered, setEntered] = useState('');
  const enteredMinor = amountText(entered) === null ? null : owedSign(account) * toMinor(entered, account.currency);
  const owed = account.kind === 'credit_card';

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { balance: [required(`Enter what ${account.name} shows today.`), moneyAmount] }) || enteredMinor === null) return;
        void saving
          .run(async () => {
            const { differenceMinor } = await auth.request<{ differenceMinor: number }>(`/accounts/${account.id}/reconcile`, { method: 'POST', body: JSON.stringify({ balanceMinor: enteredMinor }) });
            onSaved();
            return differenceMinor === 0 ? `${account.name} already matched.` : `Reconciled ${account.name}, a difference of ${signed(owedSign(account) * differenceMinor, account.currency)}.`;
          }, 'Could not reconcile the account')
          .then((saved) => saved && onClose());
      }}
      submitLabel="Set balance"
      title={`Reconcile ${account.name}`}
    >
      <Hint>
        Strata has <AccountBalance account={account} />. Enter what your bank or app shows today; the difference is recorded so the balance matches from now on.
      </Hint>
      <TextField autoFocus inputMode="decimal" label={owed ? 'Owed today' : 'Balance today'} {...form.field('balance')} onChange={(event) => setEntered(event.target.value)} value={entered} />
      {enteredMinor !== null && (
        <p className="m-0 text-small text-muted" role="status">
          {enteredMinor === account.balanceMinor ? 'That matches.' : `Difference: ${signed(owedSign(account) * (enteredMinor - account.balanceMinor), account.currency)}`}
        </p>
      )}
    </FormDialog>
  );
}
