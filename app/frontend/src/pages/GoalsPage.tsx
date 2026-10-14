import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, Meter } from '@project-graphite/ui';
import { GoalEditor } from '../components/GoalEditor';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section, Toolbar } from '../components/Page';
import { periodLabel, progressText, statusLabels, type Goal } from '../goals';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';

export function GoalsPage() {
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const finished = params.get('status') === 'finished';
  const goals = useResource<Goal[]>(`/me/goals${finished ? '?status=finished' : ''}`, true);
  const [adding, setAdding] = useState(false);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const groups = new Map<string, Goal[]>();
  for (const goal of goals.data ?? []) {
    const label = periodLabel(goal.period, goal.startsOn);
    groups.set(label, [...(groups.get(label) ?? []), goal]);
  }

  return (
    <Page
      actions={writable.length > 0 && <HeaderButton icon="plus" label="New goal" onClick={() => setAdding(true)} primary />}
      title="Goals"
    >
      <Toolbar>
        <nav aria-label="Goals" className="flex flex-wrap items-center gap-2">
          <Link aria-current={finished ? undefined : 'page'} className="filter-chip" to="/goals">
            Active
          </Link>
          <Link aria-current={finished ? 'page' : undefined} className="filter-chip" to="/goals?status=finished">
            Done or dropped
          </Link>
        </nav>
      </Toolbar>
      {goals.error ? (
        <LoadError error={goals.error} onRetry={goals.reload} />
      ) : !goals.data ? (
        <ListSkeleton label="Loading your goals" rows={3} />
      ) : goals.data.length === 0 ? (
        <EmptyState title={finished ? 'Nothing finished yet' : 'No goals yet'} />
      ) : (
        [...groups].map(([label, shown]) => (
          <Section key={label} title={label}>
            <ul className="panel-rows">
              {shown.map((goal) => (
                <li key={goal.id}>
                  <Link className="panel-row grid gap-2 text-ink no-underline hover:bg-line-soft" to={`/goals/${goal.id}`}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{goal.title}</span>
                      <span className="shrink-0 text-sm text-muted">
                        {goal.status === 'active' ? (goal.progress === null ? '' : `${Math.round(goal.progress * 100)}%`) : statusLabels[goal.status]}
                      </span>
                    </span>
                    {goal.progress !== null && <Meter label={`Progress of ${goal.title}`} value={goal.progress} />}
                    <span className="truncate text-sm text-muted">
                      {goal.spaceName} · {progressText(goal)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
      {adding && <GoalEditor onClose={() => setAdding(false)} onSaved={() => goals.reload()} spaces={writable} />}
    </Page>
  );
}
