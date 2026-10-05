import { useState } from 'react';
import { ListSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { LoadError } from '../../components/LoadError';
import { money } from '../../subscriptions';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';

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

const shiftMonth = (month: string, by: number) => {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return date.toISOString().slice(0, 7);
};

export function SpaceBalances({ spaceId }: { spaceId: string }) {
  const auth = useAuth();
  const me = auth.user?.id;
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const balances = useResource<Balances>(`/spaces/${spaceId}/balances?month=${month}`, true);
  const action = useAction();

  function settle(debt: Debt) {
    void action.run(async () => {
      await auth.request(`/spaces/${spaceId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({ fromUserId: debt.fromUserId, toUserId: debt.toUserId, amountMinor: debt.amountMinor, currency: debt.currency, month }),
      });
      balances.reload();
      return `Recorded ${money(debt.amountMinor, debt.currency)} from ${debt.fromName} to ${debt.toName}.`;
    }, 'Could not record the payment');
  }

  function undo(id: string) {
    void action.run(async () => {
      await auth.request(`/settlements/${id}`, { method: 'DELETE' });
      balances.reload();
      return 'The payment was removed.';
    }, 'Could not remove the payment');
  }

  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <section aria-label="Split costs" className="grid gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-base font-medium">Split costs · {label}</h2>
        <div className="flex gap-2">
          <button aria-label="Previous month" className="secondary-button px-2.5 py-1 text-sm" onClick={() => setMonth(shiftMonth(month, -1))} type="button">
            ←
          </button>
          <button aria-label="Next month" className="secondary-button px-2.5 py-1 text-sm" onClick={() => setMonth(shiftMonth(month, 1))} type="button">
            →
          </button>
        </div>
      </div>
      {balances.error ? (
        <LoadError error={balances.error} onRetry={balances.reload} />
      ) : !balances.data ? (
        <ListSkeleton label="Adding up who owes what" rows={2} />
      ) : balances.data.charges.length === 0 && balances.data.settlements.length === 0 ? (
        <p className="m-0 text-sm text-muted">No split subscriptions renew this month.</p>
      ) : (
        <>
          {balances.data.debts.length === 0 ? (
            <p className="m-0 text-ink">Everyone is square.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {balances.data.debts.map((debt) => (
                <li className="flex flex-wrap items-center justify-between gap-3" key={`${debt.fromUserId}-${debt.toUserId}-${debt.currency}`}>
                  <span className="text-ink">
                    {debt.fromName} owes {debt.toName} {money(debt.amountMinor, debt.currency)}
                  </span>
                  {me === debt.toUserId && (
                    <button className="secondary-button px-3 py-1.5 text-sm" disabled={action.busy} onClick={() => settle(debt)} type="button">
                      Mark as paid
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mono-sm m-0 text-faint">
            {balances.data.charges.map((charge) => `${charge.name} ${money(charge.amountMinor, charge.currency)}, paid by ${charge.payerName}`).join(' · ')}
          </p>
          {balances.data.settlements.length > 0 && (
            <ul className="m-0 grid list-none gap-1 p-0 text-sm text-muted">
              {balances.data.settlements.map((payment) => (
                <li className="flex flex-wrap items-center gap-2" key={payment.id}>
                  {payment.fromName} paid {payment.toName} {money(payment.amountMinor, payment.currency)}
                  {(me === payment.fromUserId || me === payment.toUserId) && (
                    <button className="text-button text-sm" disabled={action.busy} onClick={() => undo(payment.id)} type="button">
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
