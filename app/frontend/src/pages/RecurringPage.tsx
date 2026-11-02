import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog, ListRow, Placeholder, Stat, StatGrid } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { currencyName } from '../choices';
import { categoryLabel, money, type Subscription } from '../subscriptions';
import { capitalised, formatDate } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { AddButton, Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Section } from '../components/Page';
import { AddButtonSkeleton, AmountRowsSkeleton, ButtonSkeleton, IconButtonSkeleton, StatsSkeleton, useRememberedShape } from '../components/Skeletons';
import { SpendingFrame } from '../components/SpendingFrame';
import { StatementImport } from '../components/StatementImport';
import { MissingRates } from '../components/Stats';
import { SubscriptionEditor } from '../components/SubscriptionEditor';

interface Total {
  currency: string;
  yearlyMinor: number;
  monthlyMinor: number;
}

interface Summary {
  home: (Total & { ratesOn: string | null; ratesFrom: string[]; missing: string[] }) | null;
  totals: Total[];
  categories: (Total & { category: string })[];
  upcoming: Subscription[];
  trials: Subscription[];
  stillWorthIt: Subscription[];
}

const empty = { title: 'No subscriptions yet', hint: 'Add the subscriptions and bills you pay regularly to see what they cost each month and when they renew.' };
const emptyRenewals = { title: 'No renewals coming up', hint: 'Subscriptions show here before they renew.' };
const sourceList = new Intl.ListFormat('en', { type: 'conjunction' });
const unusedDescription = 'Nobody has marked these as used in two months.';

export function RecurringPage() {
  const auth = useAuth();
  const summary = useResource<Summary>('/subscriptions/summary', true, { live: ['subscriptions', 'spending'] });
  const action = useAction();
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Subscription | 'new'>();
  const [deleting, setDeleting] = useState<Subscription>();
  const [params, setParams] = useSearchParams();
  const linked = useResource<Subscription>(params.get('subscription') ? `/subscriptions/${params.get('subscription')}` : null, true);
  const opened = editing ?? linked.data;
  const currency = summary.data?.home?.currency ?? summary.data?.totals[0]?.currency ?? 'EGP';
  const [statCount, trialRows, renewalRows, categoryRows, unusedRows] = useRememberedShape(
    'recurring',
    summary.data && [
      summary.data.totals.length + (summary.data.home && summary.data.totals.length > 1 ? 1 : 0),
      summary.data.trials.length,
      summary.data.upcoming.length,
      summary.data.categories.length,
      summary.data.stillWorthIt.length,
    ],
    [1, 0, 4, 0, 0],
  );
  const close = () => {
    setEditing(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('subscription');
      return next;
    });
  };
  const subscriptionRow = (subscription: Subscription, detail: string) => (
    <ListRow
      key={subscription.id}
      meta={detail}
      onClick={() => setEditing(subscription)}
      title={subscription.name}
      trail={
        <>
          <Amount currency={subscription.currency} minor={subscription.amountMinor} />
          <ActionsMenu items={[{ label: 'Delete', separated: true, onSelect: () => setDeleting(subscription) }]} name={subscription.name} />
        </>
      }
    />
  );

  return (
    <SpendingFrame currency={currency} tab="recurring">
      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <Placeholder className="grid gap-8" label="Adding up your subscriptions">
          {statCount > 0 && <StatsSkeleton count={statCount} />}
          {trialRows > 0 && (
            <Section title="Trials ending soon">
              <AmountRowsSkeleton rows={trialRows} />
            </Section>
          )}
          <Section
            action={
              <span className="flex items-center gap-2">
                <IconButtonSkeleton />
                <AddButtonSkeleton />
              </span>
            }
            title="Next renewals"
          >
            {!statCount ? (
              <Empty loading title={empty.title}>
                {empty.hint}
              </Empty>
            ) : renewalRows ? (
              <AmountRowsSkeleton rows={renewalRows} />
            ) : (
              <Empty loading title={emptyRenewals.title}>
                {emptyRenewals.hint}
              </Empty>
            )}
          </Section>
          {categoryRows > 0 && (
            <Section title="By category">
              <AmountRowsSkeleton detailed={0} rows={categoryRows} />
            </Section>
          )}
          {unusedRows > 0 && (
            <Section description={unusedDescription} title="Still worth it?">
              <AmountRowsSkeleton detailed={0} rows={unusedRows} trail={<ButtonSkeleton width="w-24" />} />
            </Section>
          )}
        </Placeholder>
      ) : (
        <>
          {summary.data.totals.length > 0 && (
            <StatGrid>
              {summary.data.home && summary.data.totals.length > 1 && (
                <Stat
                  detail={`${money(summary.data.home.yearlyMinor, summary.data.home.currency)} over the next year${summary.data.home.ratesOn && summary.data.home.ratesFrom.length ? ` · ${sourceList.format(summary.data.home.ratesFrom)} rates of ${formatDate(summary.data.home.ratesOn)}` : ''}`}
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
                    <span>
                      <Amount currency={total.currency} minor={total.monthlyMinor}>
                        {' a month'}
                      </Amount>
                    </span>
                  }
                />
              ))}
            </StatGrid>
          )}
          {summary.data.home && summary.data.totals.length > 1 && <MissingRates currencies={summary.data.home.missing} />}
          {summary.data.trials.length > 0 && (
            <Section title="Trials ending soon">
              <ul className="panel-rows">{summary.data.trials.map((subscription) => subscriptionRow(subscription, `Ends ${formatDate(subscription.trialEndsOn!)}`))}</ul>
            </Section>
          )}
          <Section
            action={
              <span className="flex items-center gap-2">
                <ActionsMenu items={[{ label: 'Import subscriptions from a statement', onSelect: () => setImporting(true) }]} name="subscriptions" />
                <AddButton label="New subscription" onClick={() => setEditing('new')} />
              </span>
            }
            title="Next renewals"
          >
            {summary.data.totals.length === 0 ? (
              <Empty level={3} title={empty.title}>
                {empty.hint}
              </Empty>
            ) : summary.data.upcoming.length === 0 ? (
              <Empty level={3} title={emptyRenewals.title}>
                {emptyRenewals.hint}
              </Empty>
            ) : (
              <ul className="panel-rows">{summary.data.upcoming.map((subscription) => subscriptionRow(subscription, capitalised(formatDate(subscription.nextRenewal))))}</ul>
            )}
          </Section>
          {summary.data.categories.length > 0 && (
            <Section title="By category">
              <ul className="panel-rows">
                {summary.data.categories.map((category) => (
                  <ListRow
                    key={`${category.category}-${category.currency}`}
                    title={categoryLabel(category.category)}
                    trail={
                      <Amount currency={category.currency} minor={category.monthlyMinor}>
                        {' a month'}
                      </Amount>
                    }
                  />
                ))}
              </ul>
            </Section>
          )}
          {summary.data.stillWorthIt.length > 0 && (
            <Section description={unusedDescription} title="Still worth it?">
              <ul className="panel-rows">
                {summary.data.stillWorthIt.map((subscription) => (
                  <ListRow
                    key={subscription.id}
                    onClick={() => setEditing(subscription)}
                    title={subscription.name}
                    trail={
                      <>
                        <Amount currency={subscription.currency} minor={subscription.amountMinor} />
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
                      </>
                    }
                  />
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {opened && <SubscriptionEditor onClose={close} onSaved={summary.reload} subscription={opened === 'new' ? undefined : opened} />}
      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete"
          errorFallback="Could not delete the subscription"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/subscriptions/${deleting.id}`, { method: 'DELETE' });
            summary.reload();
            action.report(`Deleted ${deleting.name}.`);
          }}
          title={`Delete ${deleting.name}?`}
          tone="danger"
        >
          Its price history and reminders go with it, and this can’t be undone.
        </ConfirmDialog>
      )}
      {importing && <StatementImport defaultCurrency={currency} onAdded={summary.reload} onClose={() => setImporting(false)} />}
    </SpendingFrame>
  );
}
