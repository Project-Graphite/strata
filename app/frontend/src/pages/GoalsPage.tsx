import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ListRow, Meter, Placeholder, Skeleton } from '@project-graphite/ui';
import { AddButton, Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { GoalEditor } from '../components/GoalEditor';
import { LoadError } from '../components/LoadError';
import { FilterChips, Page, Section } from '../components/Page';
import { rowsOf, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';
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
  const shape = useRememberedShape(
    `goals${finished ? '-finished' : ''}`,
    goals.data && [...groups.values()].flatMap((shown) => [shown.length, shown.filter((goal) => goal.progress !== null).length]),
    [3, 3],
  );
  const { hint: emptyHint, ...empty } = finished
    ? { title: 'Nothing finished yet', hint: 'Goals you mark as done or drop are kept here.', variant: 'filtered' as const }
    : {
        title: 'No goals yet',
        hint: 'Set a goal for the year, quarter or month, and track it with a number or with linked tasks.',
        variant: 'page' as const,
        icon: 'target' as const,
        action: writable.length > 0 && <Button icon="plus" label="New goal" onClick={() => setAdding(true)} primary />,
      };

  return (
    <Page
      actions={writable.length > 0 && <AddButton label="New goal" large onClick={() => setAdding(true)} primary />}
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
        <Placeholder className="grid gap-8" label="Loading your goals">
          {shape.length > 0 ? (
            rowsOf(shape.length / 2).map((group) => (
              <div aria-hidden="true" className="grid gap-3" key={group}>
                <SkeletonLine className="text-h2" width="w-32" />
                <RowsSkeleton
                  below={<Skeleton className="h-1.5 rounded-full" />}
                  belowRows={shape[group * 2 + 1]}
                  rows={shape[group * 2]!}
                  trail={<SkeletonLine className="text-small shrink-0" width="w-8" />}
                />
              </div>
            ))
          ) : (
            <Empty {...empty} loading>
              {emptyHint}
            </Empty>
          )}
        </Placeholder>
      ) : goals.data.length === 0 ? (
        <Empty {...empty}>{emptyHint}</Empty>
      ) : (
        [...groups].map(([label, shown]) => (
          <Section key={label} title={label}>
            <ul className="panel-rows">
              {shown.map((goal) => (
                <ListRow
                  href={`/goals/${goal.id}`}
                  key={goal.id}
                  meta={`${goal.spaceName} · ${progressText(goal)}`}
                  title={goal.title}
                  trail={
                    goal.status !== 'active' ? (
                      <span className="text-small">{statusLabels[goal.status]}</span>
                    ) : (
                      goal.progress !== null && <span className="text-small text-muted tabular-nums">{Math.round(goal.progress * 100)}%</span>
                    )
                  }
                >
                  {goal.progress !== null && <Meter label={`Progress of ${goal.title}`} value={goal.progress} />}
                </ListRow>
              ))}
            </ul>
          </Section>
        ))
      )}
      {adding && <GoalEditor onClose={() => setAdding(false)} onSaved={(saved) => navigate(`/goals/${saved.id}`)} spaces={writable} />}
    </Page>
  );
}
