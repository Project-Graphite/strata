import { useNavigate } from 'react-router';
import { EmptyState, ListSkeleton, PageHeader } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useSpaces } from '../spaces';
import { TaskRow, type Task } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from '../components/LoadError';

export function TodayPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const tasks = useResource<Task[]>('/tasks/today', true);
  const action = useAction();
  const spaceOf = (task: Task) => spaces.data?.find((space) => space.id === task.spaceId);

  return (
    <section className="page-enter grid max-w-3xl gap-6">
      <PageHeader title="Today" />
      {tasks.error ? (
        <LoadError error={tasks.error} onRetry={tasks.reload} />
      ) : !tasks.data ? (
        <ListSkeleton label="Loading today's tasks" rows={4} />
      ) : tasks.data.length === 0 ? (
        <EmptyState title="Nothing due today">
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">Give tasks a due date and they show up here on the day.</p>
        </EmptyState>
      ) : (
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
      )}
    </section>
  );
}
