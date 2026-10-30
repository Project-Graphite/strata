import { useState } from 'react';
import { Icon, Placeholder, Skeleton } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { taskDetails, TaskListFooter, TaskRow, useAllTasks, useWeekStart, type Task, type TaskLink, type TaskView } from '../tasks';
import { useResource } from '../useResource';
import { Empty } from './Empty';
import { Hint } from './Hint';
import { LoadError } from './LoadError';
import { OpenTask } from './OpenTask';
import { QuickAddTask } from './QuickAddTask';
import { TaskRowsSkeleton, useRememberedShape } from './Skeletons';
import { TaskBoard, TaskGroups, useTaskChanges } from './TaskViews';

export function TaskPanel({
  addTo,
  completed,
  creating,
  editable,
  failed,
  link,
  linkedTask,
  listId,
  onClosed,
  onCloseLinked,
  onCreate,
  onListsChanged,
  page,
  ready,
  shape,
  tasksPath,
  view,
  where,
}: {
  addTo?: { spaceId: string; listId?: string };
  completed: boolean;
  creating: boolean;
  editable: (task: Task) => boolean;
  failed?: { error: string; reload: () => void };
  link: TaskLink;
  linkedTask?: string | null;
  listId: string | null;
  onClosed: () => void;
  onCloseLinked?: () => void;
  onCreate: () => void;
  onListsChanged: () => void;
  page: number;
  ready: boolean;
  shape: string;
  tasksPath: string;
  view: TaskView;
  where: (task: Task) => string | undefined;
}) {
  const weekStart = useWeekStart();
  const listQuery = listId ? `listId=${encodeURIComponent(listId)}` : '';
  const board = view === 'board';
  const open = useAllTasks(completed && !board ? null : `${tasksPath}${listQuery ? `?${listQuery}` : ''}`);
  const finished = useResource<ResultPage<Task>>(completed || board ? `${tasksPath}?page=${board ? 1 : page}&completed=true${listQuery ? `&${listQuery}` : ''}` : null, true, {
    live: ['tasks', 'items'],
  });
  const updateFinished = (change: (tasks: Task[]) => Task[]) => finished.mutate((current) => ({ ...current, results: change(current.results) }));
  const changes = useTaskChanges(completed && !board ? updateFinished : open.mutate, completed && !board ? undefined : updateFinished);
  const [opened, setOpened] = useState<Task>();
  const shown = completed && !board ? finished.data?.results : open.data;
  const [rows, detailed] = useRememberedShape(
    `${shape}${listQuery}${completed ? '-done' : ''}`,
    ready && shown ? [shown.length, shown.filter((task) => taskDetails(task, where(task)).length > 0).length] : undefined,
    [5, 5],
  );
  const reload = () => {
    open.reload();
    finished.reload();
    onListsChanged();
  };
  const changed = (task?: Task) => {
    if (!task) return reload();
    if (completed && !board) updateFinished((tasks) => tasks.map((shownTask) => (shownTask.id === task.id ? task : shownTask)));
    else open.mutate((tasks) => (tasks.some((shownTask) => shownTask.id === task.id) ? tasks.map((shownTask) => (shownTask.id === task.id ? task : shownTask)) : [...tasks, task]));
    onListsChanged();
  };
  const problem = failed?.error ? failed : open.error ? { error: open.error, reload: open.reload } : finished.error ? finished : undefined;
  const empty = completed
    ? { title: 'Nothing finished yet', hint: 'Tasks you finish show up here.' }
    : { title: 'Nothing to do', hint: addTo ? 'Add a task above, or press New task.' : 'Tasks added to this space show up here.' };
  const loaded = ready && shown && (!board || finished.data);

  return (
    <>
      {problem ? (
        <LoadError error={problem.error} onRetry={problem.reload} />
      ) : !loaded ? (
        <Placeholder className="grid gap-8" label="Loading the tasks">
          {!completed && addTo && <Skeleton className="h-14 rounded-field" />}
          {rows ? (
            <TaskRowsSkeleton detailed={detailed} rows={rows} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : (
        <>
          {(!completed || board) && addTo && (
            <QuickAddTask
              key={`${addTo.spaceId}/${addTo.listId ?? ''}`}
              listId={addTo.listId}
              onAdded={(task) => {
                open.mutate((tasks) => [...tasks, task]);
                onListsChanged();
              }}
              spaceId={addTo.spaceId}
            />
          )}
          {open.more && <Hint>Showing the first 1,000 open tasks.</Hint>}
          {board ? (
            <TaskBoard
              changes={changes}
              editable={editable}
              onOpen={setOpened}
              tasks={[...open.data!, ...finished.data!.results.filter((task) => !open.data!.some((shownTask) => shownTask.id === task.id))]}
              where={where}
            />
          ) : shown.length === 0 ? (
            <Empty title={empty.title}>{empty.hint}</Empty>
          ) : completed ? (
            <ul className="panel-rows">
              {shown.map((task) => (
                <TaskRow
                  disabled={!editable(task) || changes.pending.includes(task.id)}
                  key={task.id}
                  onEdit={() => setOpened(task)}
                  onToggle={() => changes.toggle(task)}
                  swipeable
                  task={task}
                  where={where(task)}
                />
              ))}
            </ul>
          ) : (
            <TaskGroups changes={changes} editable={editable} onOpen={setOpened} tasks={shown} weekStart={weekStart ?? 0} where={where} />
          )}
          {completed && !board && finished.data && <TaskListFooter link={link} tasks={finished.data} />}
        </>
      )}

      {addTo && (
        <div className="fab-clearance">
          <button aria-label="New task" className="fab" onClick={onCreate} type="button">
            <Icon name="plus" size={20} />
          </button>
        </div>
      )}

      {(opened || creating) && (
        <OpenTask
          key={opened?.id ?? 'new'}
          listId={addTo?.listId}
          onChanged={changed}
          onClose={() => {
            setOpened(undefined);
            onClosed();
          }}
          spaceId={addTo?.spaceId}
          task={opened}
        />
      )}
      {linkedTask && <OpenTask key={linkedTask} onChanged={changed} onClose={onCloseLinked!} taskId={linkedTask} />}
    </>
  );
}
