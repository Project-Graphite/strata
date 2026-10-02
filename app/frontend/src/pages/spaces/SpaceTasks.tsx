import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, Pagination } from '@project-graphite/ui';
import type { Page } from '../../api';
import { useAuth } from '../../auth';
import { TaskEditor } from '../../components/TaskEditor';
import { TaskRow, type Task, type TaskList } from '../../tasks';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

export function SpaceTasks() {
  const auth = useAuth();
  const space = useSpace();
  const [params] = useSearchParams();
  const listId = params.get('list');
  const completed = params.get('completed') === 'true';
  const page = Number(params.get('page')) || 1;
  const base = `/spaces/${space.id}/tasks`;
  const filters = `${listId ? `&listId=${encodeURIComponent(listId)}` : ''}${completed ? '&completed=true' : ''}`;
  const tasks = useResource<Page<Task>>(`/spaces/${space.id}/tasks?page=${page}${filters}`, true);
  const lists = useResource<TaskList[]>(`/spaces/${space.id}/lists`, true);
  const members = useResource<{ userId: string; displayName: string }[]>(`/spaces/${space.id}/members`, true);
  const adding = useAction();
  const action = useAction();
  const [editing, setEditing] = useState<Task>();
  const editable = space.role !== 'viewer';
  const link = (next: { list?: string | null; completed?: boolean; page?: number }) => {
    const query = new URLSearchParams();
    const list = next.list === undefined ? listId : next.list;
    if (list) query.set('list', list);
    if (next.completed ?? completed) query.set('completed', 'true');
    if (next.page && next.page > 1) query.set('page', String(next.page));
    return `${base}${query.size ? `?${query}` : ''}`;
  };

  function replace(task: Task) {
    tasks.mutate((current) => ({
      ...current,
      results: current.results.flatMap((shown) =>
        shown.id !== task.id ? [shown] : Boolean(task.completedAt) === completed ? [task] : [],
      ),
    }));
    lists.reload();
  }

  if (tasks.error) return <p className="error-message">{tasks.error}</p>;
  if (!tasks.data || !lists.data) return <ListSkeleton label="Loading the tasks in this space" rows={5} />;

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <nav aria-label="Lists" className="flex flex-wrap gap-2">
        <Link className={`tag-chip tag-gray ${!listId ? 'font-medium' : ''}`} to={link({ list: null })}>
          <span className="tag-chip-label">All tasks</span>
        </Link>
        {lists.data.map((list) => (
          <Link className={`tag-chip tag-blue ${listId === list.id ? 'font-medium' : ''}`} key={list.id} to={link({ list: list.id })}>
            <span className="tag-chip-label">
              {list.title} <span className="text-faint">{list.openTasks}</span>
            </span>
          </Link>
        ))}
      </nav>

      {editable && !completed && (
        <form
          className="flex flex-wrap gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            const values = new FormData(target);
            const title = String(values.get('title')).trim();
            const dueDate = String(values.get('dueDate'));
            if (!title) return;
            void adding
              .run(async () => {
                const created = await auth.request<Task>(`/spaces/${space.id}/tasks`, {
                  method: 'POST',
                  body: JSON.stringify({ title, ...(listId ? { listId } : {}), ...(dueDate ? { dueDate } : {}) }),
                });
                tasks.mutate((current) => ({ ...current, totalResults: current.totalResults + 1, results: [...current.results, created] }));
                lists.reload();
                return '';
              }, 'Could not add the task')
              .then((added) => added && target.reset());
          }}
        >
          <input aria-label="New task" className="min-w-0 flex-1" maxLength={200} name="title" placeholder="Add a task" />
          <input aria-label="Due date" name="dueDate" type="date" />
          <button className="primary-button px-4" disabled={adding.busy} type="submit">
            Add
          </button>
        </form>
      )}
      {adding.status}

      {tasks.data.results.length === 0 ? (
        <EmptyState title={completed ? 'Nothing finished yet' : 'Nothing to do'}>
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            {completed ? 'Finished tasks are kept here.' : 'Tasks you add to this space appear here, soonest first.'}
          </p>
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {tasks.data.results.map((task) => (
            <TaskRow
              disabled={!editable || action.busy}
              key={task.id}
              onEdit={() => setEditing(task)}
              onToggle={() =>
                void action.run(async () => {
                  replace(
                    await auth.request<Task>(`/tasks/${task.id}/${task.completedAt ? 'reopen' : 'complete'}`, { method: 'POST' }),
                  );
                  return '';
                }, 'Could not update the task')
              }
              task={task}
              where={lists.data?.find((list) => list.id === task.listId)?.title}
            />
          ))}
        </ul>
      )}
      {action.status}

      <div className="flex flex-wrap justify-between gap-4">
        <Link className="mono-sm text-faint" to={link({ completed: !completed })}>
          {completed ? 'show open tasks' : 'show finished tasks'}
        </Link>
        {editable && (
          <form
            className="flex gap-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              const title = String(new FormData(target).get('title')).trim();
              if (!title) return;
              void adding
                .run(async () => {
                  const created = await auth.request<TaskList>(`/spaces/${space.id}/lists`, {
                    method: 'POST',
                    body: JSON.stringify({ title }),
                  });
                  lists.mutate((current) => [...current, created]);
                  return `Added the list ${created.title}.`;
                }, 'Could not add the list')
                .then((added) => added && target.reset());
            }}
          >
            <input aria-label="New list" maxLength={100} name="title" placeholder="New list" />
            <button className="secondary-button px-3 py-2 text-sm" disabled={adding.busy} type="submit">
              Add list
            </button>
          </form>
        )}
      </div>

      <Pagination page={tasks.data.page} pageHref={(next) => link({ page: next })} totalPages={tasks.data.totalPages} />

      {editing && (
        <TaskEditor
          editable={editable}
          lists={lists.data}
          members={members.data ?? []}
          onClose={() => setEditing(undefined)}
          onSaved={replace}
          task={editing}
        />
      )}
    </div>
  );
}
