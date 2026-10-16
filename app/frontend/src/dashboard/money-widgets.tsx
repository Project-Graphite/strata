import { Link } from 'react-router';
import { formatDay, ListSkeleton, Meter } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { Amount } from '../components/Amount';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import type { InstallmentPlan, MoneyAccount, SavingsGoal, SpendingMonth } from '../spending';
import { useSpaces } from '../spaces';
import { money } from '../subscriptions';
import { useResource } from '../useResource';

function usePersonalSpace() {
  return useSpaces().data?.find((space) => space.kind === 'personal')?.id;
}

function nextCardDue(dueDay: number) {
  const today = new Date();
  const due = (offset: number) => {
    const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0).getDate();
    return dayKey(new Date(today.getFullYear(), today.getMonth() + offset, Math.min(dueDay, last)));
  };
  return due(0) >= dayKey(today) ? due(0) : due(1);
}

export function SpendingWidget() {
  const spaceId = usePersonalSpace();
  const summary = useResource<SpendingMonth>(spaceId ? `/spaces/${spaceId}/spending` : null, true, { live: ['spending', 'items'] });
  if (summary.error) return <LoadError compact error={summary.error} onRetry={summary.reload} />;
  if (!summary.data) return <ListSkeleton label="Adding up the month" rows={3} />;
  const { budgetMinor, currency, expenses, safeDailyMinor, spentMinor } = summary.data;
  return (
    <div className="grid gap-3">
      <p className="m-0 text-xl text-ink">
        {money(spentMinor, currency)} <span className="text-sm text-muted">{budgetMinor === null ? 'spent' : `of ${money(budgetMinor, currency)}`}</span>
      </p>
      {budgetMinor !== null && <Meter label="Spent of the budget" value={budgetMinor ? spentMinor / budgetMinor : 1} />}
      {safeDailyMinor !== null && <Hint>{money(safeDailyMinor, currency)} a day to stay on budget</Hint>}
      <ul className="m-0 grid list-none gap-1 p-0">
        {expenses.slice(0, 4).map((expense) => (
          <li className="flex justify-between gap-3 text-sm" key={expense.id}>
            <span className="truncate text-ink">{expense.title}</span>
            <Amount currency={expense.currency} direction={expense.direction} minor={expense.amountMinor} />
          </li>
        ))}
      </ul>
      <Link className="text-sm" to="/spending">
        Open spending
      </Link>
    </div>
  );
}

export function PaymentsWidget() {
  const spaceId = usePersonalSpace();
  const installments = useResource<InstallmentPlan[]>(spaceId ? `/spaces/${spaceId}/installments` : null, true, { live: ['spending'] });
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true, { live: ['spending', 'items'] });
  const failed = installments.error ?? accounts.error;
  if (failed) return <LoadError compact error={failed} onRetry={installments.error ? installments.reload : accounts.reload} />;
  if (!installments.data || !accounts.data) return <ListSkeleton label="Looking for payments" rows={3} />;
  const payments = [
    ...installments.data.flatMap((plan) => (plan.nextDueOn ? [{ key: plan.id, name: plan.name, on: plan.nextDueOn, amountMinor: plan.monthlyMinor, currency: plan.currency, missed: plan.status === 'missed' }] : [])),
    ...accounts.data.flatMap((account) =>
      account.kind === 'credit' && account.dueDay && account.balanceMinor < 0
        ? [{ key: account.id, name: account.name, on: nextCardDue(account.dueDay), amountMinor: -account.balanceMinor, currency: account.currency, missed: false }]
        : [],
    ),
  ].sort((a, b) => a.on.localeCompare(b.on));
  if (payments.length === 0) return <Hint>No payments coming up.</Hint>;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {payments.slice(0, 5).map((payment) => (
        <li className="flex justify-between gap-3 text-sm" key={payment.key}>
          <span className="min-w-0 flex-1 truncate text-ink">{payment.name}</span>
          <span className={payment.missed ? 'shrink-0 text-danger' : 'shrink-0 text-muted'}>
            {payment.missed ? 'missed ' : ''}
            {formatDay(payment.on, { day: 'numeric', month: 'short' })}
          </span>
          <Amount currency={payment.currency} danger={payment.missed} minor={payment.amountMinor} />
        </li>
      ))}
    </ul>
  );
}

export function SavingsWidget() {
  const spaceId = usePersonalSpace();
  const goals = useResource<SavingsGoal[]>(spaceId ? `/spaces/${spaceId}/savings-goals` : null, true, { live: ['spending', 'items'] });
  if (goals.error) return <LoadError compact error={goals.error} onRetry={goals.reload} />;
  if (!goals.data) return <ListSkeleton label="Looking at your goals" rows={3} />;
  if (goals.data.length === 0) {
    return (
      <Hint>
        No savings goals yet. <Link to="/spending/net-worth">Add one</Link>
      </Hint>
    );
  }
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {goals.data.slice(0, 4).map((goal) => (
        <li className="grid gap-1" key={goal.id}>
          <span className="flex flex-wrap justify-between gap-x-3 text-sm">
            <span className="max-w-full shrink-0 truncate text-ink">{goal.name}</span>
            <Amount currency={goal.currency} minor={goal.savedMinor ?? goal.targetMinor}>
              {goal.savedMinor !== null && ` of ${money(goal.targetMinor, goal.currency)}`}
            </Amount>
          </span>
          <Meter label={`${goal.name} saved`} value={goal.targetMinor ? Math.max(0, goal.savedMinor ?? 0) / goal.targetMinor : 1} />
        </li>
      ))}
    </ul>
  );
}
