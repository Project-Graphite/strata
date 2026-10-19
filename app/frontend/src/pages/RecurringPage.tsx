import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ListSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { currencyName } from '../choices';
import { useSpaces } from '../spaces';
import { categoryLabel, money, shortDate, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { MoneyRow } from '../components/MoneyRow';
import { Section } from '../components/Page';
import { SpendingFrame } from '../components/SpendingFrame';
import { StatementImport } from '../components/StatementImport';
import { MissingRates, Stat, Stats } from '../components/Stats';
import { SubscriptionEditor } from '../components/SubscriptionEditor';

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

export function RecurringPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const summary = useResource<Summary>('/subscriptions/summary', true);
  const action = useAction();
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Subscription | 'new'>();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const opener = (subscription: Subscription) => (editable.some((space) => space.id === subscription.spaceId) ? () => setEditing(subscription) : undefined);
  const [params, setParams] = useSearchParams();
  const linked = useResource<Subscription>(params.get('subscription') ? `/subscriptions/${params.get('subscription')}` : null, true);
  const opened = editing ?? (linked.data && opener(linked.data) ? linked.data : undefined);
  const currency = summary.data?.home?.currency ?? summary.data?.totals[0]?.currency ?? 'EUR';
  const close = () => {
    setEditing(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('subscription');
      return next;
    });
  };
  const subscriptionRow = (subscription: Subscription, detail: string) => (
    <MoneyRow
      amount={<Amount currency={subscription.currency} minor={subscription.amountMinor} />}
      detail={detail}
      key={subscription.id}
      onOpen={opener(subscription)}
      title={subscription.name}
    />
  );

  return (
    <SpendingFrame currency={currency} tab="recurring">
      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <ListSkeleton label="Adding up your subscriptions" rows={4} />
      ) : (
        <>
          {summary.data.totals.length > 0 && (
            <Stats>
              {summary.data.home && summary.data.totals.length > 1 && (
                <Stat
                  detail={`${money(summary.data.home.yearlyMinor, summary.data.home.currency)} over the next year${summary.data.home.ratesOn ? ` · ECB rates of ${shortDate(summary.data.home.ratesOn)}` : ''}`}
                  label={`All together, in ${currencyName(summary.data.home.currency)}`}
                  value={
                    <span>
                      ≈{' '}
                      <Amount currency={summary.data.home.currency} minor={summary.data.home.monthlyMinor}>
                        {' a month'}
                      </Amount>
                    </span>
                  }
                />
              )}
              {summary.data.totals.map((total) => (
                <Stat
                  detail={`${money(total.yearlyMinor, total.currency)} over the next year`}
                  key={total.currency}
                  label={currencyName(total.currency)}
                  value={
                    <Amount currency={total.currency} minor={total.monthlyMinor}>
                      {' a month'}
                    </Amount>
                  }
                />
              ))}
            </Stats>
          )}
          {summary.data.home && summary.data.totals.length > 1 && <MissingRates currencies={summary.data.home.missing} />}
          {summary.data.trials.length > 0 && (
            <Section title="Trials ending soon">
              <ul className="panel-rows">{summary.data.trials.map((subscription) => subscriptionRow(subscription, `ends ${shortDate(subscription.trialEndsOn!)}`))}</ul>
            </Section>
          )}
          <Section
            action={
              editable.length > 0 && (
                <span className="flex items-center gap-2">
                  <Button icon="plus" label="New subscription" large onClick={() => setEditing('new')} />
                  <ActionsMenu items={[{ label: 'Import subscriptions from a statement', onSelect: () => setImporting(true) }]} name="subscriptions" />
                </span>
              )
            }
            title="Next renewals"
          >
            {summary.data.totals.length === 0 ? (
              <Empty level={3} title="No subscriptions yet">
                Add the subscriptions and bills you pay regularly to see what they cost each month and when they renew.
              </Empty>
            ) : summary.data.upcoming.length === 0 ? (
              <Hint>No renewals coming up.</Hint>
            ) : (
              <ul className="panel-rows">{summary.data.upcoming.map((subscription) => subscriptionRow(subscription, shortDate(subscription.nextRenewal)))}</ul>
            )}
          </Section>
          {summary.data.categories.length > 0 && (
            <Section title="By category">
              <ul className="panel-rows">
                {summary.data.categories.map((category) => (
                  <MoneyRow
                    amount={
                      <Amount currency={category.currency} minor={category.monthlyMinor}>
                        {' a month'}
                      </Amount>
                    }
                    key={`${category.category}-${category.currency}`}
                    title={categoryLabel(category.category)}
                  />
                ))}
              </ul>
            </Section>
          )}
          {summary.data.stillWorthIt.length > 0 && (
            <Section description="Nobody has marked these as used in two months." title="Still worth it?">
              <ul className="panel-rows">
                {summary.data.stillWorthIt.map((subscription) => (
                  <MoneyRow
                    amount={<Amount currency={subscription.currency} minor={subscription.amountMinor} />}
                    key={subscription.id}
                    onOpen={opener(subscription)}
                    title={subscription.name}
                  >
                    <Button
                      disabled={action.busy}
                      label="I used this"
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
                    />
                  </MoneyRow>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {opened && (
        <SubscriptionEditor
          onClose={close}
          onSaved={summary.reload}
          spaceId={opened === 'new' ? (editable.find((space) => space.kind === 'personal') ?? editable[0])!.id : opened.spaceId}
          spaces={opened === 'new' ? editable : undefined}
          subscription={opened === 'new' ? undefined : opened}
        />
      )}
      {importing && <StatementImport defaultCurrency={currency} onAdded={summary.reload} onClose={() => setImporting(false)} />}
    </SpendingFrame>
  );
}
