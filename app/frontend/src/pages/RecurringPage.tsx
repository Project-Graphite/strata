import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ListSkeleton, Tabs } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { spendingTabs } from '../spending';
import { useSpaces } from '../spaces';
import { categoryLabel, money, shortDate, type Subscription } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, IconButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
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

function SubscriptionLine({ subscription, detail, onOpen }: { subscription: Subscription; detail: string; onOpen?: () => void }) {
  const content = (
    <>
      <span className="min-w-0 truncate">{subscription.name}</span>
      <span className="mono-sm shrink-0 text-faint">{detail}</span>
    </>
  );
  return onOpen ? (
    <button className="flex w-full cursor-pointer items-baseline justify-between gap-4 border-0 bg-transparent panel-row text-left text-ink hover:bg-line-soft" onClick={onOpen} type="button">
      {content}
    </button>
  ) : (
    <p className="m-0 flex items-baseline justify-between gap-4 panel-row text-ink">{content}</p>
  );
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
  const close = () => {
    setEditing(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('subscription');
      return next;
    });
  };

  return (
    <Page
      actions={
        editable.length > 0 && (
          <>
            <IconButton icon="upload" label="Import a statement" onClick={() => setImporting(true)} />
            <Button icon="plus" label="Add subscription" onClick={() => setEditing('new')} primary />
          </>
        )
      }
      title="Spending"
    >
      <Tabs items={spendingTabs('recurring')} label="Spending" />
      {opened && (
        <SubscriptionEditor
          onClose={close}
          onSaved={summary.reload}
          spaceId={opened === 'new' ? (editable.find((space) => space.kind === 'personal') ?? editable[0])!.id : opened.spaceId}
          spaces={opened === 'new' ? editable : undefined}
          subscription={opened === 'new' ? undefined : opened}
        />
      )}
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
        <Empty title="No subscriptions yet" />
      ) : (
        <>
          <Stats>
            {summary.data.home && summary.data.totals.length > 1 && (
              <Stat
                detail={`${money(summary.data.home.yearlyMinor, summary.data.home.currency)} over the next year${summary.data.home.ratesOn ? ` · ECB rates of ${shortDate(summary.data.home.ratesOn)}` : ''}`}
                label={`All together, in ${summary.data.home.currency}`}
                value={`≈ ${money(summary.data.home.monthlyMinor, summary.data.home.currency)} a month`}
              />
            )}
            {summary.data.totals.map((total) => (
              <Stat
                detail={`${money(total.yearlyMinor, total.currency)} over the next year`}
                key={total.currency}
                label={total.currency}
                value={`${money(total.monthlyMinor, total.currency)} a month`}
              />
            ))}
          </Stats>
          {summary.data.home && summary.data.totals.length > 1 && <MissingRates currencies={summary.data.home.missing} />}
          {summary.data.trials.length > 0 && (
            <Section title="Trials ending soon">
              <div className="panel-rows">
                {summary.data.trials.map((subscription) => (
                  <SubscriptionLine
                    detail={`ends ${shortDate(subscription.trialEndsOn!)}, then ${money(subscription.amountMinor, subscription.currency)}`}
                    key={subscription.id}
                    onOpen={opener(subscription)}
                    subscription={subscription}
                  />
                ))}
              </div>
            </Section>
          )}
          <Section title="Next renewals">
            <div className="panel-rows">
              {summary.data.upcoming.map((subscription) => (
                <SubscriptionLine
                  detail={`${shortDate(subscription.nextRenewal)} · ${money(subscription.amountMinor, subscription.currency)}`}
                  key={subscription.id}
                  onOpen={opener(subscription)}
                  subscription={subscription}
                />
              ))}
            </div>
          </Section>
          <Section title="By category">
            <div className="panel-rows">
              {summary.data.categories.map((category) => (
                <p className="m-0 flex justify-between gap-4 panel-row" key={`${category.category}-${category.currency}`}>
                  <span className="text-ink">{categoryLabel(category.category)}</span>
                  <span className="mono-sm text-faint">{money(category.monthlyMinor, category.currency)} a month</span>
                </p>
              ))}
            </div>
          </Section>
          {summary.data.stillWorthIt.length > 0 && (
            <Section description="Nobody has marked these as used in two months." title="Still worth it?">
              <ul className="panel-rows">
                {summary.data.stillWorthIt.map((subscription) => (
                  <li className="flex items-center justify-between gap-4 panel-row" key={subscription.id}>
                    {opener(subscription) ? (
                      <button className="text-button min-w-0 truncate text-ink" onClick={opener(subscription)} type="button">
                        {subscription.name}
                      </button>
                    ) : (
                      <span className="min-w-0 truncate text-ink">{subscription.name}</span>
                    )}
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
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
