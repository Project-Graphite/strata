import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { formatDay, ListSkeleton, Select, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Page, Toolbar } from '../components/Page';
import { QuickAddTask } from '../components/QuickAddTask';
import { spaceOptions, useSpaces } from '../spaces';
import { TaskListChips, TaskListFooter, taskLink, TaskRow, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';

export function TodoPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const listId = params.get('list');
  const completed = params.get('completed') === 'true';
  const page = Number(params.get('page')) || 1;
  const filters = `${listId ? `&listId=${encodeURIComponent(listId)}` : ''}${completed ? '&completed=true' : ''}`;
  const tasks = useResource<ResultPage<Task>>(`/me/tasks?page=${page}${filters}`, true);
  const lists = useResource<TaskList[]>('/me/lists', true);
  const action = useAction();
  const listForm = useFormErrors();
  const [creatingList, setCreatingList] = useState(false);
  const spaceOf = (id: string) => spaces.data?.find((space) => space.id === id);
  const editableSpaces = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const personal = spaces.data?.find((space) => space.kind === 'personal');
  const link = taskLink('/todo', listId, completed);

  const failed = [tasks, lists, spaces].find((resource) => resource.error);
  if (failed || !tasks.data || !lists.data || !spaces.data) {
    return (
      <Page title="To-do">
        {failed ? <LoadError error={failed.error} onRetry={failed.reload} /> : <ListSkeleton label="Loading your tasks" rows={5} />}
      </Page>
    );
  }
  const shownList = lists.data.find((list) => list.id === listId);
  const addTo = shownList ? spaceOf(shownList.spaceId) : personal;
  const listTitle = (task: Task) => lists.data?.find((list) => list.id === task.listId)?.title;
  const manySpaces = spaces.data.length > 1;

  return (
    <Page title="To-do">
      <Toolbar>
        <TaskListChips link={link} listId={listId} lists={lists.data} onNewList={editableSpaces.length > 0 ? () => setCreatingList(true) : undefined} />
      </Toolbar>

      {!completed && addTo && addTo.role !== 'viewer' && (
        <QuickAddTask
          key={`${addTo.id}/${shownList?.id ?? ''}`}
          listId={shownList?.id}
          onAdded={() => {
            tasks.reload();
            lists.reload();
          }}
          spaceId={addTo.id}
        />
      )}

      {tasks.data.results.length === 0 ? (
        <Empty title={completed ? 'Nothing finished yet' : 'Nothing to do'} />
      ) : (
        <ul className="panel-rows">
          {tasks.data.results.map((task) => (
            <TaskRow
              disabled={spaceOf(task.spaceId)?.role === 'viewer' || action.busy}
              key={task.id}
              onEdit={() => navigate(`/spaces/${task.spaceId}/tasks${task.listId ? `?list=${task.listId}` : ''}`)}
              onToggle={() =>
                void action.run(async () => {
                  const updated = await auth.request<Task>(`/tasks/${task.id}/${task.completedAt ? 'reopen' : 'complete'}`, { method: 'POST' });
                  tasks.reload();
                  lists.reload();
                  if (task.completedAt) return '';
                  return updated.completedAt
                    ? {
                        message: `Done: ${task.title}.`,
                        undo: async () => {
                          await auth.request(`/tasks/${task.id}/reopen`, { method: 'POST' });
                          tasks.reload();
                          lists.reload();
                          return '';
                        },
                      }
                    : `Done for now. ${task.title} is next due ${formatDay(updated.dueDate!)}.`;
                }, 'Could not update the task')
              }
              task={task}
              where={[manySpaces && spaceOf(task.spaceId)?.name, !shownList && listTitle(task)].filter(Boolean).join(' · ')}
            />
          ))}
        </ul>
      )}

      <TaskListFooter completed={completed} link={link} tasks={tasks.data} />

      {creatingList && (
        <FormDialog
          busy={action.busy}
          busyLabel="Saving…"
          onClose={() => setCreatingList(false)}
          onSubmit={(target) => {
            if (!listForm.check(target, { title: [required('Name the list.'), atMost(100, 'Use at most 100 characters.')] })) return;
            const values = new FormData(target);
            void action
              .run(async () => {
                const created = await auth.request<TaskList>(`/spaces/${String(values.get('spaceId'))}/lists`, {
                  method: 'POST',
                  body: JSON.stringify({ title: String(values.get('title')).trim() }),
                });
                lists.mutate((current) => [...current, created]);
                navigate(link({ list: created.id, completed: false, page: 1 }));
                return `Added the list ${created.title}.`;
              }, 'Could not add the list')
              .then((saved) => saved && setCreatingList(false));
          }}
          submitLabel="Add list"
          title="New list"
        >
          <TextField autoFocus label="Name" maxLength={100} {...listForm.field('title')} />
          {editableSpaces.length > 1 ? (
            <Select defaultValue={personal?.id} label="Space" name="spaceId" options={spaceOptions(editableSpaces)} />
          ) : (
            <input name="spaceId" type="hidden" value={editableSpaces[0]!.id} />
          )}
        </FormDialog>
      )}
    </Page>
  );
}
