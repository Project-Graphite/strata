import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, ListSkeleton, Pagination, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../../api';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Toolbar } from '../../components/Page';
import { TaskEditor } from '../../components/TaskEditor';
import type { Tag } from '../../spaces';
import { TaskRow, type Task, type TaskList } from '../../tasks';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';

export function SpaceTasks() {
  const auth = useAuth();
  const space = useSpace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listId = params.get('list');
  const completed = params.get('completed') === 'true';
  const page = Number(params.get('page')) || 1;
  const base = `/spaces/${space.id}/tasks`;
  const filters = `${listId ? `&listId=${encodeURIComponent(listId)}` : ''}${completed ? '&completed=true' : ''}`;
  const tasks = useResource<ResultPage<Task>>(`/spaces/${space.id}/tasks?page=${page}${filters}`, true);
  const lists = useResource<TaskList[]>(`/spaces/${space.id}/lists`, true);
  const members = useResource<{ userId: string; displayName: string }[]>(`/spaces/${space.id}/members`, true);
  const tags = useResource<Tag[]>(`/spaces/${space.id}/tags`, true);
  const action = useAction();
  const listForm = useFormErrors();
  const [editing, setEditing] = useState<Task | 'new'>();
  const [listDialog, setListDialog] = useState<'new' | 'rename'>();
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
    tasks.mutate((current) => {
      const shown = current.results.some((entry) => entry.id === task.id);
      const belongs = Boolean(task.completedAt) === completed && (!listId || task.listId === listId);
      return {
        ...current,
        totalResults: current.totalResults + (shown ? (belongs ? 0 : -1) : belongs ? 1 : 0),
        results: shown
          ? current.results.flatMap((entry) => (entry.id !== task.id ? [entry] : belongs ? [task] : []))
          : belongs
            ? [...current.results, task]
            : current.results,
      };
    });
    lists.reload();
  }

  if (tasks.error) return <LoadError error={tasks.error} onRetry={tasks.reload} />;
  if (!tasks.data || !lists.data) return <ListSkeleton label="Loading the tasks in this space" rows={5} />;
  const shownList = lists.data.find((list) => list.id === listId);

  return (
    <>
      <Toolbar actions={editable && <Button icon="plus" label="New task" onClick={() => setEditing('new')} primary />}>
        <nav aria-label="Lists" className="flex flex-wrap items-center gap-2">
          <Link aria-current={!listId ? 'page' : undefined} className="filter-chip" to={link({ list: null })}>
            All tasks
          </Link>
          {lists.data.map((list) => (
            <Link aria-current={listId === list.id ? 'page' : undefined} className="filter-chip" key={list.id} to={link({ list: list.id })}>
              {list.title}
              <span className="text-faint">{list.openTasks}</span>
            </Link>
          ))}
          {editable && (
            <button className="filter-chip" onClick={() => setListDialog('new')} type="button">
              <Icon name="plus" size={14} />
              New list
            </button>
          )}
        </nav>
        {editable && shownList && (
          <ActionsMenu
            items={[
              { label: 'Rename list', onSelect: () => setListDialog('rename') },
              {
                label: 'Move list to trash',
                separated: true,
                onSelect: () =>
                  void action.run(async () => {
                    await auth.request(`/items/${shownList.id}/trash`, { method: 'POST' });
                    lists.mutate((current) => current.filter((list) => list.id !== shownList.id));
                    navigate(link({ list: null }));
                    return `Moved the list ${shownList.title} to the trash. Its tasks stay in this space.`;
                  }, 'Could not move the list to the trash'),
              },
            ]}
            name={shownList.title}
          />
        )}
      </Toolbar>

      {tasks.data.results.length === 0 ? (
        <Empty title={completed ? 'Nothing finished yet' : 'Nothing to do'} />
      ) : (
        <ul className="panel-rows">
          {tasks.data.results.map((task) => (
            <TaskRow
              disabled={!editable || action.busy}
              key={task.id}
              onEdit={() => setEditing(task)}
              onToggle={() =>
                void action.run(async () => {
                  replace(await auth.request<Task>(`/tasks/${task.id}/${task.completedAt ? 'reopen' : 'complete'}`, { method: 'POST' }));
                  return '';
                }, 'Could not update the task')
              }
              task={task}
              where={lists.data?.find((list) => list.id === task.listId)?.title}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link className="text-button text-sm" to={link({ completed: !completed })}>
          {completed ? 'Show open' : 'Show finished'}
        </Link>
        <Pagination page={tasks.data.page} pageHref={(next) => link({ page: next })} totalPages={tasks.data.totalPages} />
      </div>

      {editing && (
        <TaskEditor
          defaultListId={listId}
          editable={editable}
          lists={lists.data}
          members={members.data ?? []}
          onClose={() => setEditing(undefined)}
          onSaved={replace}
          onTrashed={() => {
            if (editing === 'new') return;
            tasks.mutate((current) => ({
              ...current,
              totalResults: current.totalResults - 1,
              results: current.results.filter((task) => task.id !== editing.id),
            }));
            lists.reload();
          }}
          spaceId={space.id}
          tags={tags.data ?? []}
          task={editing === 'new' ? undefined : editing}
        />
      )}

      {listDialog && (
        <FormDialog
          busy={action.busy}
          busyLabel="Saving…"
          onClose={() => setListDialog(undefined)}
          onSubmit={(target) => {
            if (!listForm.check(target, { title: [required('Name the list.'), atMost(100, 'Use at most 100 characters.')] })) return;
            const title = String(new FormData(target).get('title')).trim();
            void action
              .run(
                async () => {
                  if (listDialog === 'rename' && shownList) {
                    await auth.request(`/items/${shownList.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
                    lists.mutate((current) => current.map((list) => (list.id === shownList.id ? { ...list, title } : list)));
                    return '';
                  }
                  const created = await auth.request<TaskList>(`/spaces/${space.id}/lists`, { method: 'POST', body: JSON.stringify({ title }) });
                  lists.mutate((current) => [...current, created]);
                  navigate(link({ list: created.id }));
                  return `Added the list ${created.title}.`;
                },
                listDialog === 'rename' ? 'Could not rename the list' : 'Could not add the list',
              )
              .then((saved) => saved && setListDialog(undefined));
          }}
          submitLabel={listDialog === 'rename' ? 'Rename' : 'Add list'}
          title={listDialog === 'rename' ? 'Rename list' : 'New list'}
        >
          <TextField autoFocus defaultValue={listDialog === 'rename' ? shownList?.title : ''} label="Name" maxLength={100} {...listForm.field('title')} />
        </FormDialog>
      )}
    </>
  );
}
