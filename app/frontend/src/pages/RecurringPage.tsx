import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ListSkeleton, PageHeader } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useSpaces } from '../spaces';
import { money, shortDate, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from '../components/LoadError';
import { StatementImport } from '../components/StatementImport';

interface Total {
  currency: string;
  yearlyMinor: number;
  monthlyMinor: number;
}

interface Summary {
  home: (Total & { ratesOn: string | null; missing: string[] }) | null;
  totals: Total[];
  categories: (Total & { category: string })[];
  upcoming: Subscription[];
  trials: Subscription[];
  stillWorthIt: Subscription[];
}

function SubscriptionLine({ subscription, detail }: { subscription: Subscription; detail: string }) {
  return (
    <Link
      className="flex items-baseline justify-between gap-4 border-b border-line-soft py-3 text-ink no-underline hover:underline"
      to={`/spaces/${subscription.spaceId}/recurring`}
    >
      <span className="min-w-0 truncate">{subscription.name}</span>
      <span className="mono-sm shrink-0 text-faint">{detail}</span>
    </Link>
  );
}

export function RecurringPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const summary = useResource<Summary>('/subscriptions/summary', true);
  const action = useAction();
  const [importing, setImporting] = useState(false);

  return (
    <section className="page-enter grid max-w-3xl gap-10">
      <PageHeader
        actions={
          spaces.data?.some((space) => space.role !== 'viewer') && (
            <button className="secondary-button px-3 py-2 text-sm" onClick={() => setImporting(true)} type="button">
              Import a statement
            </button>
          )
        }
        title="Recurring"
      />
      {importing && (
        <StatementImport
          defaultCurrency={summary.data?.home?.currency ?? summary.data?.totals[0]?.currency ?? 'EUR'}
          onAdded={summary.reload}
          onClose={() => setImporting(false)}
        />
      )}
      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <ListSkeleton label="Adding up your subscriptions" rows={4} />
      ) : summary.data.totals.length === 0 ? (
        <EmptyState title="No subscriptions yet">
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            Open a space, then its Recurring tab, to add the first one.{' '}
            {spaces.data?.[0] && <Link to={`/spaces/${spaces.data[0].id}/recurring`}>Start in {spaces.data[0].name}</Link>}
          </p>
        </EmptyState>
      ) : (
        <>
          {summary.data.home && summary.data.totals.length > 1 && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="m-0 text-sm text-muted">All together, in {summary.data.home.currency}</p>
              <p className="m-0 mt-2 text-3xl text-ink">≈ {money(summary.data.home.monthlyMinor, summary.data.home.currency)} a month</p>
              <p className="mono-sm m-0 mt-1 text-faint">
                {money(summary.data.home.yearlyMinor, summary.data.home.currency)} over the next year
                {summary.data.home.ratesOn && ` · ECB rates of ${shortDate(summary.data.home.ratesOn)}`}
              </p>
              {summary.data.home.missing.length > 0 && (
                <p className="m-0 mt-2 text-sm text-muted">Not included, with no rate available: {summary.data.home.missing.join(', ')}.</p>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {summary.data.totals.map((total) => (
              <div className="rounded-xl border border-line bg-surface p-5" key={total.currency}>
                <p className="m-0 text-sm text-muted">{total.currency}</p>
                <p className="m-0 mt-2 text-2xl text-ink">{money(total.monthlyMinor, total.currency)} a month</p>
                <p className="mono-sm m-0 mt-1 text-faint">{money(total.yearlyMinor, total.currency)} over the next year</p>
              </div>
            ))}
          </div>
          {summary.data.trials.length > 0 && (
            <section>
              <h2 className="m-0 text-xl font-medium">Trials ending soon</h2>
              <div className="mt-3">
                {summary.data.trials.map((subscription) => (
                  <SubscriptionLine
                    detail={`ends ${shortDate(subscription.trialEndsOn!)}, then ${money(subscription.amountMinor, subscription.currency)}`}
                    key={subscription.id}
                    subscription={subscription}
                  />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="m-0 text-xl font-medium">Next renewals</h2>
            <div className="mt-3">
              {summary.data.upcoming.map((subscription) => (
                <SubscriptionLine
                  detail={`${shortDate(subscription.nextRenewal)} · ${money(subscription.amountMinor, subscription.currency)}`}
                  key={subscription.id}
                  subscription={subscription}
                />
              ))}
            </div>
          </section>
          <section>
            <h2 className="m-0 text-xl font-medium">By category</h2>
            <div className="mt-3">
              {summary.data.categories.map((category) => (
                <p className="m-0 flex justify-between gap-4 border-b border-line-soft py-3" key={`${category.category}-${category.currency}`}>
                  <span className="text-ink">{category.category}</span>
                  <span className="mono-sm text-faint">{money(category.monthlyMinor, category.currency)} a month</span>
                </p>
              ))}
            </div>
          </section>
          {summary.data.stillWorthIt.length > 0 && (
            <section>
              <h2 className="m-0 text-xl font-medium">Still worth it?</h2>
              <p className="mt-2 mb-0 text-sm text-muted">Nobody has marked these as used in two months.</p>
              <ul className="mt-3 grid list-none gap-0 p-0">
                {summary.data.stillWorthIt.map((subscription) => (
                  <li className="flex items-center justify-between gap-4 border-b border-line-soft py-3" key={subscription.id}>
                    <Link className="min-w-0 truncate text-ink" to={`/spaces/${subscription.spaceId}/recurring`}>
                      {subscription.name}
                    </Link>
                    <button
                      className="secondary-button shrink-0 px-3 py-2 text-sm"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await auth.request(`/subscriptions/${subscription.id}/used`, { method: 'POST' });
                          summary.mutate((current) => ({
                            ...current,
                            stillWorthIt: current.stillWorthIt.filter((shown) => shown.id !== subscription.id),
                          }));
                          return `Noted that you used ${subscription.name}.`;
                        }, 'Could not update the subscription')
                      }
                      type="button"
                    >
                      I used this
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
