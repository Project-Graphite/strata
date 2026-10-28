import { useState, type ReactNode } from 'react';
import { ConfirmDialog, formatDay, ListRow, Placeholder } from '@project-graphite/ui';
import { dayKey, shiftMonth } from '../../agenda';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { ButtonSkeleton, HintSkeleton, IconButtonSkeleton, rowsOf, RowSkeleton, useRememberedShape } from '../../components/Skeletons';
import { money } from '../../subscriptions';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { PeriodNav } from '../../components/PeriodNav';
import { Button } from '../../components/Button';

interface Debt {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amountMinor: number;
  currency: string;
}

interface Balances {
  month: string;
  charges: { itemId: string; name: string; payerName: string; amountMinor: number; currency: string; renewals: string[] }[];
  debts: Debt[];
  settlements: (Debt & { id: string })[];
}

const payment = (debt: Debt) => `${money(debt.amountMinor, debt.currency)} from ${debt.fromName} to ${debt.toName}`;

function BalanceRowsSkeleton({ action, rows, withAction }: { action: ReactNode; rows: number; withAction: number }) {
  return (
    <ul aria-hidden="true" className="panel-rows">
      {rowsOf(rows).map((row) => (
        <RowSkeleton detail={false} key={row} row={row} trail={row < withAction && action} />
      ))}
    </ul>
  );
}

export function SpaceBalances({ spaceId }: { spaceId: string }) {
  const auth = useAuth();
  const me = auth.user?.id;
  const [month, setMonth] = useState(() => dayKey(new Date()).slice(0, 7));
  const balances = useResource<Balances>(`/spaces/${spaceId}/balances?month=${month}`, true);
  const action = useAction();
  const [deleting, setDeleting] = useState<Balances['settlements'][number]>();
  const [debts, payable, charges, settlements, mine] = useRememberedShape(
    `space-balances-${spaceId}`,
    balances.data && [
      balances.data.debts.length,
      balances.data.debts.filter((debt) => debt.toUserId === me).length,
      balances.data.charges.length,
      balances.data.settlements.length,
      balances.data.settlements.filter((settlement) => settlement.fromUserId === me || settlement.toUserId === me).length,
    ],
    [0, 0, 0, 0, 0],
  );

  function settle(debt: Debt) {
    void action.run(async () => {
      const { id } = await auth.request<{ id: string }>(`/spaces/${spaceId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({ fromUserId: debt.fromUserId, toUserId: debt.toUserId, amountMinor: debt.amountMinor, currency: debt.currency, month }),
      });
      balances.reload();
      return {
        message: `Recorded ${payment(debt)}.`,
        undo: async () => {
          await auth.request(`/settlements/${id}`, { method: 'DELETE' });
          balances.reload();
          return '';
        },
      };
    }, 'Could not record the payment');
  }

  return (
    <Section
      action={<PeriodNav onShift={(step) => setMonth(shiftMonth(month, step))} title={formatDay(`${month}-01`, { month: 'long', year: 'numeric' })} unit="month" />}
      title="Split costs"
    >
      {balances.error ? (
        <LoadError compact error={balances.error} onRetry={balances.reload} />
      ) : !balances.data ? (
        <Placeholder className="grid gap-3" label="Adding up who owes what">
          {charges || settlements ? (
            <>
              {debts ? <BalanceRowsSkeleton action={<ButtonSkeleton width="w-28" />} rows={debts} withAction={payable} /> : <HintSkeleton />}
              {charges > 0 && <HintSkeleton />}
              {settlements > 0 && <BalanceRowsSkeleton action={<IconButtonSkeleton />} rows={settlements} withAction={mine} />}
            </>
          ) : (
            <HintSkeleton />
          )}
        </Placeholder>
      ) : balances.data.charges.length === 0 && balances.data.settlements.length === 0 ? (
        <Hint>No split subscriptions renew this month.</Hint>
      ) : (
        <>
          {balances.data.debts.length === 0 ? (
            <Hint>Everyone is square.</Hint>
          ) : (
            <ul className="panel-rows">
              {balances.data.debts.map((debt) => (
                <ListRow
                  key={`${debt.fromUserId}-${debt.toUserId}-${debt.currency}`}
                  title={`${debt.fromName} owes ${debt.toName} ${money(debt.amountMinor, debt.currency)}`}
                  trail={me === debt.toUserId && <Button disabled={action.busy} label="Mark as paid" onClick={() => settle(debt)} />}
                />
              ))}
            </ul>
          )}
          {balances.data.charges.length > 0 && (
            <Hint>{balances.data.charges.map((charge) => `${charge.name} ${money(charge.amountMinor, charge.currency)}, paid by ${charge.payerName}`).join(' · ')}</Hint>
          )}
          {balances.data.settlements.length > 0 && (
            <ul className="panel-rows">
              {balances.data.settlements.map((settlement) => (
                <ListRow
                  key={settlement.id}
                  title={`${settlement.fromName} paid ${settlement.toName} ${money(settlement.amountMinor, settlement.currency)}`}
                  trail={
                    (me === settlement.fromUserId || me === settlement.toUserId) && (
                      <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDeleting(settlement) }]} name={`${settlement.fromName} paid ${settlement.toName}`} />
                    )
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete payment"
          errorFallback="Could not delete the payment"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/settlements/${deleting.id}`, { method: 'DELETE' });
            balances.reload();
            action.report(`Deleted the payment of ${payment(deleting)}.`);
          }}
          title="Delete this payment?"
          tone="danger"
        >
          What {deleting.fromName} owes {deleting.toName} for this month comes back.
        </ConfirmDialog>
      )}
    </Section>
  );
}
