import { useNavigate } from 'react-router';
import { EmptyState, ListSkeleton, Tabs } from '@project-graphite/ui';
import { useTodaySchedule } from '../agenda';
import { useAuth } from '../auth';
import { AgendaCard } from '../components/AgendaEntryLink';
import { useSpaces } from '../spaces';
import { TaskRow, type Task } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { agendaTabs } from './AgendaPage';

export function TodayPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const tasks = useResource<Task[]>('/tasks/today', true);
  const schedule = useTodaySchedule();
  const action = useAction();
  const spaceOf = (task: Task) => spaces.data?.find((space) => space.id === task.spaceId);

  return (
    <Page title="Agenda">
      <Tabs items={agendaTabs('today', (view) => `/agenda?view=${view}`)} label="Agenda view" />
      {tasks.error || schedule.error ? (
        <LoadError error={tasks.error || schedule.error} onRetry={tasks.error ? tasks.reload : schedule.reload} />
      ) : !tasks.data || !schedule.data ? (
        <ListSkeleton label="Loading today" rows={4} />
      ) : tasks.data.length === 0 && schedule.data.length === 0 ? (
        <EmptyState title="Nothing today" />
      ) : (
        <>
          {schedule.data.length > 0 && (
            <Section title="Schedule">
              <ul className="m-0 grid max-w-3xl list-none gap-1.5 p-0">
                {schedule.data.map((entry) => (
                  <li key={`${entry.kind}-${entry.itemId}-${entry.start}`}>
                    <AgendaCard colour={schedule.colourOf(entry)} entry={entry} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {tasks.data.length > 0 && (
            <Section title="Due">
              <ul className="m-0 grid list-none gap-0 p-0">
                {tasks.data.map((task) => (
                  <TaskRow
                    disabled={spaceOf(task)?.role === 'viewer' || action.busy}
                    key={task.id}
                    onEdit={() => navigate(`/spaces/${task.spaceId}/tasks`)}
                    onToggle={() =>
                      void action.run(async () => {
                        const updated = await auth.request<Task>(`/tasks/${task.id}/complete`, { method: 'POST' });
                        tasks.mutate((current) => current.filter((shown) => shown.id !== task.id));
                        return updated.completedAt
                          ? `Done: ${task.title}.`
                          : `Done for now. ${task.title} is next due ${updated.dueDate}.`;
                      }, 'Could not update the task')
                    }
                    task={task}
                    where={spaceOf(task)?.name}
                  />
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
