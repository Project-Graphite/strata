import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FilterChip, formatDay, Placeholder, Skeleton, Stat, StatGrid } from '@project-graphite/ui';
import { entryClock, entryDay, entryLink, type AgendaEntry } from '../agenda';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { money } from '../subscriptions';
import { formatMoment, profileDay } from '../time';
import { useResource } from '../useResource';
import { SkeletonLine } from './widget-parts';

interface HomeSummary {
  nextEvent: AgendaEntry | null;
  dueToday: number;
  safeToSpend: { amountMinor: number; currency: string } | null;
  toReview: number;
  payments: { missed: number; upcoming: number };
  invitations: number;
  unread: number;
}

function startsIn(entry: AgendaEntry, now: number) {
  const minutes = Math.round((Date.parse(entry.start) - now) / 60_000);
  if (minutes <= 0) return `Now, until ${entryClock(entry.end!)}`;
  if (minutes < 60) return `In ${minutes} min`;
  if (minutes < 12 * 60) return `In ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return formatMoment(entry.start);
}

function greeting(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  return hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function NowStrip() {
  const { user } = useAuth();
  const summary = useResource<HomeSummary>('/me/home', true, { live: ['items', 'tasks', 'subscriptions', 'spending', 'inbox', 'spaces'], every: 5 * 60_000 });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const features = user?.features ?? [];
  const next = summary.data?.nextEvent;
  const chips = summary.data
    ? ([
        [summary.data.toReview, 'To review', '/spending'],
        [summary.data.payments.missed, summary.data.payments.missed === 1 ? 'Missed payment' : 'Missed payments', '/spending/accounts'],
        [summary.data.payments.upcoming, 'Payments this week', '/spending/accounts'],
        [summary.data.invitations, summary.data.invitations === 1 ? 'Invitation' : 'Invitations', '/spaces/invitations'],
        [summary.data.unread, 'Unread', '/inbox'],
      ] as const).filter(([count]) => count > 0)
    : [];

  return (
    <section aria-label="Now" className="grid gap-4">
      <div>
        <h2 className="m-0 text-h2 text-ink">
          {greeting(now, user?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)}, {user?.displayName.split(' ')[0]}
        </h2>
        <p className="m-0 text-small text-muted">{formatDay(profileDay(now), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      {summary.error ? (
        <LoadError compact error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <Placeholder className="stat-grid" label="Loading what is next">
          {[0, 1, 2].map((stat) => (
            <div aria-hidden="true" className="stat" key={stat}>
              <SkeletonLine className="text-small" width="w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </Placeholder>
      ) : (
        <>
          <StatGrid>
            {features.includes('agenda') && (
              <Stat
                detail={
                  next && (
                    <Link className="block truncate text-small text-ink no-underline hover:underline" to={next.kind === 'external' ? `/agenda/day?date=${entryDay(next)}` : entryLink(next)}>
                      {next.title}
                    </Link>
                  )
                }
                label="Next"
                value={next ? startsIn(next, now.getTime()) : <span className="text-muted">Nothing this week</span>}
              />
            )}
            {features.includes('tasks') && (
              <Stat
                label="Due today"
                value={
                  <Link className="text-ink no-underline hover:underline" to="/tasks">
                    {summary.data.dueToday}
                  </Link>
                }
              />
            )}
            {summary.data.safeToSpend && (
              <Stat
                label="Safe to spend today"
                value={
                  <Link className="text-ink no-underline hover:underline" to="/spending/budgets">
                    {money(summary.data.safeToSpend.amountMinor, summary.data.safeToSpend.currency)}
                  </Link>
                }
              />
            )}
          </StatGrid>
          {chips.length > 0 && (
            <div aria-label="Needs you" className="flex flex-wrap items-center gap-2" role="group">
              <span className="text-small text-muted">Needs you</span>
              {chips.map(([count, label, href]) => (
                <FilterChip active={false} count={count} href={href} key={label} label={label} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
