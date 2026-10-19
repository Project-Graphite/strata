import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ListSkeleton, Select, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { QuickAddTask } from '../components/QuickAddTask';
import { OpenTask } from '../components/TaskEditor';
import { spaceOptions, useSpaces } from '../spaces';
import { completeTask, TaskListChips, TaskListFooter, taskLink, TaskRow, TaskStatusChips, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';

export function TasksPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [params, setParams] = useSearchParams();
  const listId = params.get('list');
  const completed = params.get('completed') === 'true';
  const page = Number(params.get('page')) || 1;
  const linkedTask = params.get('task');
  const filters = `${listId ? `&listId=${encodeURIComponent(listId)}` : ''}${completed ? '&completed=true' : ''}`;
  const tasks = useResource<ResultPage<Task>>(`/me/tasks?page=${page}${filters}`, true);
  const lists = useResource<TaskList[]>('/me/lists', true);
  const action = useAction();
  const listForm = useFormErrors();
  const [creatingList, setCreatingList] = useState(false);
  const [opened, setOpened] = useState<Task | 'new'>();
  const closeLinked = useCallback(
    () =>
      setParams(
        (current) => {
          current.delete('task');
          return current;
        },
        { replace: true },
      ),
    [setParams],
  );
  const spaceOf = (id: string) => spaces.data?.find((space) => space.id === id);
  const editableSpaces = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const personal = spaces.data?.find((space) => space.kind === 'personal');
  const link = taskLink('/tasks', listId, completed);
  const shownList = lists.data?.find((list) => list.id === listId);
  const addTo = shownList ? spaceOf(shownList.spaceId) : personal;
  const reload = () => {
    tasks.reload();
    lists.reload();
  };

  const failed = [tasks, lists, spaces].find((resource) => resource.error);
  return (
    <Page
      actions={addTo && addTo.role !== 'viewer' && <Button icon="plus" label="New task" large onClick={() => setOpened('new')} primary />}
      title="Tasks"
      toolbar={lists.data && <TaskListChips link={link} listId={listId} lists={lists.data} onNewList={editableSpaces.length > 0 ? () => setCreatingList(true) : undefined} />}
      toolbarEnd={<TaskStatusChips completed={completed} link={link} />}
    >
      {failed ? (
        <LoadError error={failed.error} onRetry={failed.reload} />
      ) : !tasks.data || !lists.data || !spaces.data ? (
        <ListSkeleton label="Loading your tasks" rows={5} />
      ) : (
        <>
          {!completed && addTo && addTo.role !== 'viewer' && <QuickAddTask key={`${addTo.id}/${shownList?.id ?? ''}`} listId={shownList?.id} onAdded={reload} spaceId={addTo.id} />}

          {tasks.data.results.length === 0 ? (
            completed ? (
              <Empty title="Nothing finished yet">Tasks you tick off in any space show up here.</Empty>
            ) : (
              <Empty title="Nothing to do">Tasks from all your spaces show up here, so add one above.</Empty>
            )
          ) : (
            <ul className="panel-rows">
              {tasks.data.results.map((task) => (
                <TaskRow
                  disabled={spaceOf(task.spaceId)?.role === 'viewer' || action.busy}
                  key={task.id}
                  onEdit={() => setOpened(task)}
                  onToggle={() =>
                    void action.run(async () => {
                      if (!task.completedAt) return completeTask(auth.request, task, reload);
                      await auth.request(`/tasks/${task.id}/reopen`, { method: 'POST' });
                      reload();
                      return '';
                    }, 'Could not update the task')
                  }
                  task={task}
                  where={[spaces.data!.length > 1 && spaceOf(task.spaceId)?.name, !shownList && lists.data?.find((list) => list.id === task.listId)?.title].filter(Boolean).join(' · ')}
                />
              ))}
            </ul>
          )}

          <TaskListFooter link={link} tasks={tasks.data} />
        </>
      )}

      {opened && (
        <OpenTask listId={shownList?.id} onChanged={reload} onClose={() => setOpened(undefined)} spaceId={addTo?.id} task={opened === 'new' ? undefined : opened} />
      )}
      {linkedTask && <OpenTask key={linkedTask} onChanged={reload} onClose={closeLinked} taskId={linkedTask} />}

      {creatingList && (
        <FormDialog
          busy={action.busy}
          busyLabel="Adding…"
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
                return `Added ${created.title}.`;
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
