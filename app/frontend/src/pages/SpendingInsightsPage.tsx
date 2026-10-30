import { useSearchParams } from 'react-router';
import { formatDay, ListRow, Placeholder, SegmentedControl, Skeleton, Stat, StatGrid, TextLink } from '@project-graphite/ui';
import { Amount } from '../components/Amount';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Section } from '../components/Page';
import { rowsOf, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { SpendingFirstRunSkeleton, SpendingFrame } from '../components/SpendingFrame';
import { categoryName, spendingHref, spendingLive, type SpendingInsights } from '../spending';
import { usePersonalSpace } from '../spaces';
import { money } from '../subscriptions';
import { formatDate, formatMonth, formatRange } from '../time';
import { useResource } from '../useResource';
import { MissingRates } from '../components/Stats';

const shade = (share: number) => `color-mix(in oklab, var(--color-ink) ${Math.round(12 + share * 32)}%, var(--color-surface))`;
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const leadOf = (days: SpendingInsights['days']) => (new Date(`${days[0]!.day}T00:00:00Z`).getUTCDay() + 6) % 7;
const spans = ['3', '6', '12', '24'] as const;
const emptyInsights = { title: 'Nothing to look back on yet', hint: 'Add or import transactions, or connect your phone, to see how your spending moves from month to month.' };
const emptyCompared = { title: 'Nothing spent in either month', hint: 'Categories show here once there is spending to compare.' };
const emptyMerchants = { title: 'No spending in these months', hint: 'The places you spend the most show here.' };
const labelOf = (period: SpendingInsights['periods'][number]) => formatMonth(period.until);

export function SpendingInsightsPage() {
  const { spaceId } = usePersonalSpace();
  const [params, setParams] = useSearchParams();
  const span = spans.find((value) => value === params.get('months')) ?? '6';
  const insights = useResource<SpendingInsights>(spaceId ? `/spaces/${spaceId}/spending/insights?months=${span}` : null, true, spendingLive);
  const shown = insights.data;
  const [periodRows, categoryRows, merchantRows, leadCells, dayCells, empty] = useRememberedShape(
    `spending-insights-${span}`,
    shown && [
      shown.periods.length,
      new Set(shown.periods.slice(-2).flatMap((period) => period.categories.map((row) => row.category))).size,
      shown.merchants.length,
      leadOf(shown.days),
      shown.days.length,
      quiet(shown) ? 1 : 0,
    ],
    [Number(span), 4, 5, 3, 31, 0],
  );

  return (
    <SpendingFrame
      currency={shown?.currency}
      empty={shown && quiet(shown) ? emptyInsights : undefined}
      onChanged={insights.reload}
      tab="insights"
      toolbar={
        <SegmentedControl
          label="Look back over"
          onChange={(value) =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.set('months', value);
              return next;
            })
          }
          options={spans.map((value) => ({ value, label: `${value} months` }))}
          size="small"
          value={span}
        />
      }
    >
      {insights.error ? (
        <LoadError error={insights.error} onRetry={insights.reload} />
      ) : !shown ? (
        <Placeholder className="grid gap-8" label="Looking back over your spending">
          {empty ? (
            <SpendingFirstRunSkeleton empty={emptyInsights} />
          ) : (
            <>
              <StatGrid>
                {rowsOf(3).map((stat) => (
                  <Stat detail={stat === 2 ? <SkeletonLine width="w-24" /> : undefined} key={stat} label={<SkeletonLine width="w-24" />} value={<SkeletonLine width="w-32" />} />
                ))}
              </StatGrid>
              <div className="grid items-start gap-8 lg:grid-cols-2">
                <Section title="Spent each month">
                  <MonthBarsSkeleton rows={periodRows} />
                  <TableSkeleton columns={3} rows={periodRows} />
                </Section>
                <Section title="Compared with the month before">
                  {categoryRows ? (
                    <TableSkeleton columns={4} rows={categoryRows} />
                  ) : (
                    <Empty loading title={emptyCompared.title}>
                      {emptyCompared.hint}
                    </Empty>
                  )}
                </Section>
                <Section title="Where it went">
                  {merchantRows ? (
                    <RowsSkeleton rows={merchantRows} trail={<SkeletonLine className="shrink-0" width="w-16" />} />
                  ) : (
                    <Empty loading title={emptyMerchants.title}>
                      {emptyMerchants.hint}
                    </Empty>
                  )}
                </Section>
                <Section title="Day by day">
                  <div className="grid grid-cols-7 gap-0.5 text-small">
                    {weekdays.map((weekday) => (
                      <SkeletonLine className="justify-center" key={weekday} width="w-6" />
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {rowsOf(leadCells).map((cell) => (
                      <span key={`lead-${cell}`} />
                    ))}
                    {rowsOf(dayCells).map((cell) => (
                      <Skeleton className="aspect-square h-auto rounded-field" key={cell} />
                    ))}
                  </div>
                </Section>
              </div>
            </>
          )}
        </Placeholder>
      ) : (
        !quiet(shown) && <Insights insights={shown} />
      )}
    </SpendingFrame>
  );
}

const quiet = (insights: SpendingInsights) => insights.periods.every((period) => period.spentMinor === 0 && period.receivedMinor === 0);

function MonthBarsSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className="m-0 grid list-none gap-2 p-0">
      {rowsOf(rows).map((row) => (
        <li className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-small" key={row}>
          <SkeletonLine width="w-20" />
          <Skeleton className="h-2 rounded-full" />
          <SkeletonLine width="w-20" />
        </li>
      ))}
    </ul>
  );
}

function TableSkeleton({ columns, rows }: { columns: number; rows: number }) {
  const cells = (Cell: 'th' | 'td') =>
    rowsOf(columns).map((column) => (
      <Cell key={column}>
        <SkeletonLine className={column ? 'justify-end' : ''} width={column ? 'w-14' : 'w-24'} />
      </Cell>
    ));
  return (
    <div className="overflow-x-auto">
      <table className="insights-table">
        <thead>
          <tr>{cells('th')}</tr>
        </thead>
        <tbody>
          {rowsOf(rows).map((row) => (
            <tr key={row}>{cells('td')}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Insights({ insights }: { insights: SpendingInsights }) {
  const { currency, periods, merchants, days } = insights;
  const highest = Math.max(1, ...periods.map((period) => period.spentMinor));
  const busiestMonth = periods.reduce((best, period) => (period.spentMinor > best.spentMinor ? period : best), periods[0]!);
  const totalMinor = periods.reduce((total, period) => total + period.spentMinor, 0);
  const [previous, current] = periods.slice(-2) as [SpendingInsights['periods'][number], SpendingInsights['periods'][number]];
  const categories = [...new Set([...current.categories, ...previous.categories].map((row) => row.category))].map((category) => {
    const now = current.categories.find((row) => row.category === category)?.spentMinor ?? 0;
    const before = previous.categories.find((row) => row.category === category)?.spentMinor ?? 0;
    return { category, now, before, change: now - before };
  });
  const busiest = Math.max(1, ...days.map((day) => day.spentMinor));
  const lead = leadOf(days);

  return (
    <>
      <StatGrid>
        <Stat label={`Spent over ${periods.length} months`} value={<Amount currency={currency} minor={totalMinor} />} />
        <Stat label="Average a month" value={<Amount currency={currency} minor={Math.round(totalMinor / periods.length)} />} />
        <Stat detail={labelOf(busiestMonth)} label="Highest month" value={<Amount currency={currency} minor={busiestMonth.spentMinor} />} />
      </StatGrid>
      <MissingRates currencies={insights.missing} />
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <Section title="Spent each month">
          <ul aria-hidden="true" className="m-0 grid list-none gap-2 p-0">
            {periods.map((period) => (
              <li className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-small" key={period.month}>
                <span className="text-muted">{labelOf(period)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-line-soft">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${(period.spentMinor / highest) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-ink">{money(period.spentMinor, currency)}</span>
              </li>
            ))}
          </ul>
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
                    <th scope="row">{formatRange(period.from, period.until)}</th>
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
            <Empty level={3} title={emptyCompared.title}>
              {emptyCompared.hint}
            </Empty>
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
                        <th scope="row">
                          <TextLink href={`${spendingHref('transactions')}?category=${encodeURIComponent(row.category)}`}>{categoryName(row.category)}</TextLink>
                        </th>
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
            <Empty level={3} title={emptyMerchants.title}>
              {emptyMerchants.hint}
            </Empty>
          ) : (
            <ul className="panel-rows">
              {merchants.map((merchant) => (
                <ListRow
                  key={merchant.merchantId ?? merchant.merchant}
                  meta={<>{merchant.count} {merchant.count === 1 ? 'time' : 'times'} · {money(merchant.averageMinor, currency)} on average · last {formatDate(merchant.lastOn)}</>}
                  title={merchant.merchant}
                  trail={<Amount currency={currency} minor={merchant.totalMinor} />}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Day by day">
          <div aria-hidden="true" className="grid grid-cols-7 gap-0.5 text-center text-small text-muted">
            {weekdays.map((weekday) => (
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
                style={day.spentMinor > 0 ? { background: shade(day.spentMinor / busiest), color: 'var(--color-ink)' } : undefined}
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
