import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Placeholder, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../../api';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Toolbar } from '../../components/Page';
import { QuickAddTask } from '../../components/QuickAddTask';
import { ChipsSkeleton, FieldSkeleton, IconButtonSkeleton, TaskRowsSkeleton, useRememberedShape } from '../../components/Skeletons';
import { TaskEditor } from '../../components/TaskEditor';
import type { Tag } from '../../spaces';
import { completeTask, taskDetails, TaskListChips, TaskListFooter, taskLink, TaskRow, TaskStatusChips, type Task, type TaskList } from '../../tasks';
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
  const link = taskLink(`/spaces/${space.id}/tasks`, listId, completed);
  const reload = () => {
    tasks.reload();
    lists.reload();
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

  const failed = [tasks, lists].find((resource) => resource.error);
  const shownList = lists.data?.find((list) => list.id === listId);
  const whereOf = (task: Task) => lists.data?.find((list) => list.id === task.listId)?.title;
  const [taskRows, detailedRows] = useRememberedShape(
    `space-tasks-${space.id}${filters}`,
    tasks.data && lists.data && [tasks.data.results.length, tasks.data.results.filter((task) => taskDetails(task, whereOf(task)).length > 0).length],
    [5, 5],
  );
  const [listCount] = useRememberedShape(`space-task-lists-${space.id}`, lists.data && [lists.data.length], [1]);
  const empty = completed
    ? { title: 'Nothing finished yet', hint: 'Tasks you tick off in this space show up here.' }
    : { title: 'Nothing to do', hint: 'Tasks you add to this space show up here.' };

  return (
    <>
      <Toolbar
        actions={
          <>
            <TaskStatusChips completed={completed} link={link} />
            {editable && <Button icon="plus" label="New task" onClick={() => setEditing('new')} />}
          </>
        }
      >
        {lists.data ? (
          <TaskListChips link={link} listId={listId} lists={lists.data} onNewList={editable ? () => setListDialog('new') : undefined} />
        ) : (
          <ChipsSkeleton count={listCount + (editable ? 2 : 1)} />
        )}
        {editable && listId && !lists.data && <IconButtonSkeleton />}
        {editable && shownList && (
          <ActionsMenu
            items={[
              { label: 'Rename list', onSelect: () => setListDialog('rename') },
              {
                label: 'Move to trash',
                separated: true,
                onSelect: () =>
                  void action.run(async () => {
                    await auth.request(`/items/${shownList.id}/trash`, { method: 'POST' });
                    lists.mutate((current) => current.filter((list) => list.id !== shownList.id));
                    navigate(link({ list: null }));
                    return {
                      message: `Moved ${shownList.title} to the trash. Its tasks stay in this space.`,
                      undo: async () => {
                        await auth.request(`/items/${shownList.id}/restore`, { method: 'POST' });
                        lists.reload();
                        navigate(link({ list: shownList.id }));
                        return '';
                      },
                    };
                  }, 'Could not move the list to the trash'),
              },
            ]}
            name={shownList.title}
          />
        )}
      </Toolbar>

      {failed ? (
        <LoadError error={failed.error} onRetry={failed.reload} />
      ) : !tasks.data || !lists.data ? (
        <Placeholder className="grid gap-8" label="Loading the tasks in this space">
          {!completed && editable && <FieldSkeleton />}
          {taskRows ? (
            <TaskRowsSkeleton detailed={detailedRows} rows={taskRows} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : (
        <>
          {!completed && editable && <QuickAddTask key={listId ?? ''} listId={shownList?.id} onAdded={replace} spaceId={space.id} />}
          {tasks.data.results.length === 0 ? (
            <Empty title={empty.title}>{empty.hint}</Empty>
          ) : (
            <ul className="panel-rows">
              {tasks.data.results.map((task) => (
                <TaskRow
                  disabled={!editable || action.busy}
                  key={task.id}
                  onEdit={() => setEditing(task)}
                  onToggle={() =>
                    void action.run(async () => {
                      if (!task.completedAt) return completeTask(auth.request, task, (updated) => (updated ? replace(updated) : reload()));
                      replace(await auth.request<Task>(`/tasks/${task.id}/reopen`, { method: 'POST' }));
                      return '';
                    }, 'Could not update the task')
                  }
                  task={task}
                  where={whereOf(task)}
                />
              ))}
            </ul>
          )}
          <TaskListFooter link={link} tasks={tasks.data} />
        </>
      )}

      {editing && lists.data && (
        <TaskEditor
          defaultListId={listId}
          editable={editable}
          lists={lists.data}
          members={members.data ?? []}
          onClose={() => setEditing(undefined)}
          onRestored={reload}
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
          busyLabel={listDialog === 'rename' ? 'Saving…' : 'Adding…'}
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
                    return `Saved ${title}.`;
                  }
                  const created = await auth.request<TaskList>(`/spaces/${space.id}/lists`, { method: 'POST', body: JSON.stringify({ title }) });
                  lists.mutate((current) => [...current, created]);
                  navigate(link({ list: created.id }));
                  return `Added ${created.title}.`;
                },
                listDialog === 'rename' ? 'Could not rename the list' : 'Could not add the list',
              )
              .then((saved) => saved && setListDialog(undefined));
          }}
          submitLabel={listDialog === 'rename' ? 'Save' : 'Add list'}
          title={listDialog === 'rename' ? 'Rename list' : 'New list'}
        >
          <TextField autoFocus defaultValue={listDialog === 'rename' ? shownList?.title : ''} label="Name" maxLength={100} {...listForm.field('title')} />
        </FormDialog>
      )}
    </>
  );
}
