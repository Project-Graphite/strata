import { useSearchParams } from 'react-router';
import { formatDay, ListSkeleton, Tabs } from '@project-graphite/ui';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section, Toolbar } from '../components/Page';
import { categoryName, spendingTabs, type SpendingInsights } from '../spending';
import { SpaceChooser, useChosenSpace } from '../spaces';
import { money } from '../subscriptions';
import { useResource } from '../useResource';
import { RowText } from '../components/RowText';
import { MissingRates } from '../components/Stats';

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const shade = (share: number) => `color-mix(in oklab, var(--color-ink) ${Math.round(12 + share * 78)}%, var(--color-surface))`;

export function SpendingInsightsPage() {
  const [params] = useSearchParams();
  const { spaceId } = useChosenSpace();
  const insights = useResource<SpendingInsights>(spaceId ? `/spaces/${spaceId}/spending/insights?months=6` : null, true);
  const shown = insights.data;

  return (
    <Page title="Spending">
      <Tabs items={spendingTabs('insights', params.get('space'))} label="Spending" />
      <Toolbar actions={<SpaceChooser />} />
      {insights.error ? (
        <LoadError error={insights.error} onRetry={insights.reload} />
      ) : !shown ? (
        <ListSkeleton label="Looking back over your spending" rows={5} />
      ) : (
        <Insights insights={shown} />
      )}
    </Page>
  );
}

function Insights({ insights }: { insights: SpendingInsights }) {
  const { currency, periods, merchants, days } = insights;
  const highest = Math.max(1, ...periods.map((period) => period.spentMinor));
  const [previous, current] = periods.slice(-2) as [SpendingInsights['periods'][number], SpendingInsights['periods'][number]];
  const categories = [...new Set([...current.categories, ...previous.categories].map((row) => row.category))].map((category) => {
    const now = current.categories.find((row) => row.category === category)?.spentMinor ?? 0;
    const before = previous.categories.find((row) => row.category === category)?.spentMinor ?? 0;
    return { category, now, before, change: now - before };
  });
  const busiest = Math.max(1, ...days.map((day) => day.spentMinor));
  const lead = (new Date(`${days[0]!.day}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <>
      <MissingRates currencies={insights.missing} />
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <Section title="Spent each month">
          <div aria-hidden="true" className="grid gap-1">
            <div className="flex h-36 items-end gap-2 border-b border-line">
              {periods.map((period) => (
                <div
                  className="flex h-full flex-1 items-end justify-center"
                  key={period.month}
                  title={`${monthLabel.format(new Date(`${period.until}T00:00:00Z`))}: ${money(period.spentMinor, currency)}`}
                >
                  <div className="w-full max-w-8 rounded-t bg-ink" style={{ height: `${(period.spentMinor / highest) * 100}%`, minHeight: period.spentMinor ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {periods.map((period) => (
                <span className="flex-1 text-center text-xs text-muted" key={period.month}>
                  {monthLabel.format(new Date(`${period.until}T00:00:00Z`))}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="insights-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Spent</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.month}>
                    <th scope="row">{`${formatDay(period.from, { day: 'numeric', month: 'short' })} – ${formatDay(period.until, { day: 'numeric', month: 'short' })}`}</th>
                    <td>{money(period.spentMinor, currency)}</td>
                    <td>{money(period.receivedMinor, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Compared with the month before">
          {categories.length === 0 ? (
            <Hint>Nothing spent in either month.</Hint>
          ) : (
            <div className="overflow-x-auto">
              <table className="insights-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">This month</th>
                    <th scope="col">Month before</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {categories
                    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
                    .map((row) => (
                      <tr key={row.category}>
                        <th scope="row">{categoryName(row.category)}</th>
                        <td>{money(row.now, currency)}</td>
                        <td>{money(row.before, currency)}</td>
                        <td>{`${row.change > 0 ? '+' : row.change < 0 ? '−' : ''}${money(Math.abs(row.change), currency)}`}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Where it went">
          {merchants.length === 0 ? (
            <Hint>No spending in these months.</Hint>
          ) : (
            <ul className="panel-rows">
              {merchants.map((merchant) => (
                <li className="panel-row flex items-center gap-3" key={merchant.merchant}>
                  <RowText
                    detail={<>{merchant.count} {merchant.count === 1 ? 'time' : 'times'} · {money(merchant.averageMinor, currency)} on average · last {formatDay(merchant.lastOn, { day: 'numeric', month: 'short' })}</>}
                    title={merchant.merchant}
                  />
                  <span className="shrink-0 text-ink">{money(merchant.totalMinor, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Day by day">
          <div aria-hidden="true" className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5" role="list">
            {Array.from({ length: lead }, (_, index) => (
              <span aria-hidden="true" key={`lead-${index}`} />
            ))}
            {days.map((day) => (
              <span
                aria-label={`${formatDay(day.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${money(day.spentMinor, currency)}`}
                className="spend-day"
                key={day.day}
                role="listitem"
                style={day.spentMinor > 0 ? { background: shade(day.spentMinor / busiest), color: day.spentMinor / busiest > 0.5 ? 'var(--color-paper)' : undefined } : undefined}
                title={`${formatDay(day.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${money(day.spentMinor, currency)}`}
              >
                {Number(day.day.slice(8))}
              </span>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
