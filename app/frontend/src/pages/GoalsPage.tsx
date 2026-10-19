import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ListSkeleton, Meter } from '@project-graphite/ui';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { GoalEditor } from '../components/GoalEditor';
import { LoadError } from '../components/LoadError';
import { FilterChips, Page, Section } from '../components/Page';
import { RowText } from '../components/RowText';
import { periodLabel, progressText, statusLabels, type Goal } from '../goals';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';

export function GoalsPage() {
  const navigate = useNavigate();
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
      actions={writable.length > 0 && <Button icon="plus" label="New goal" large onClick={() => setAdding(true)} primary />}
      title="Goals"
      toolbar={
        <FilterChips
          items={[
            { active: !finished, href: '/goals', label: 'Active' },
            { active: finished, href: '/goals?status=finished', label: 'Done or dropped' },
          ]}
          label="Goal status"
        />
      }
    >
      {goals.error ? (
        <LoadError error={goals.error} onRetry={goals.reload} />
      ) : !goals.data ? (
        <ListSkeleton label="Loading your goals" rows={3} />
      ) : goals.data.length === 0 ? (
        finished ? (
          <Empty title="Nothing finished yet">Goals you mark as done or drop are kept here.</Empty>
        ) : (
          <Empty title="No goals yet">Set a goal for the year, quarter or month, and track it with a number or with linked tasks.</Empty>
        )
      ) : (
        [...groups].map(([label, shown]) => (
          <Section key={label} title={label}>
            <ul className="panel-rows">
              {shown.map((goal) => (
                <li key={goal.id}>
                  <Link className="panel-row flex items-center gap-3 text-ink no-underline hover:bg-line-soft" to={`/goals/${goal.id}`}>
                    <RowText detail={`${goal.spaceName} · ${progressText(goal)}`} title={goal.title}>
                      {goal.progress !== null && <Meter label={`Progress of ${goal.title}`} value={goal.progress} />}
                    </RowText>
                    {goal.status !== 'active' ? (
                      <span className="shrink-0 text-sm text-muted">{statusLabels[goal.status]}</span>
                    ) : (
                      goal.progress !== null && <span className="mono-sm shrink-0 text-faint">{Math.round(goal.progress * 100)}%</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
      {adding && <GoalEditor onClose={() => setAdding(false)} onSaved={(saved) => navigate(`/goals/${saved.id}`)} spaces={writable} />}
    </Page>
  );
}
