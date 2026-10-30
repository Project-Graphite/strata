import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { Avatar, Badge, Card, Icon, SectionHeading } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { pageScroller } from '../page-scroll';
import { usePageVirtualizer } from '../page-virtualizer';
import { groupTasks, reorderTask } from '../task-groups';
import { completeTask, isOverdue, taskDetails, TaskRow, taskStatuses, type Task } from '../tasks';
import { profileDay } from '../time';
import { useAction } from '../useAction';
import { ActionsMenu } from './ActionsMenu';
import { Empty } from './Empty';

type Update = (change: (tasks: Task[]) => Task[]) => void;

const virtualAbove = 100;

const upsert = (task: Task) => (tasks: Task[]) => (tasks.some((shown) => shown.id === task.id) ? tasks.map((shown) => (shown.id === task.id ? task : shown)) : [...tasks, task]);

export function useTaskChanges(update: Update, finished?: Update) {
  const auth = useAuth();
  const action = useAction();
  const [pending, setPending] = useState<string[]>([]);
  const replace = (task: Task) => {
    update(upsert(task));
    finished?.((tasks) => tasks.filter((shown) => shown.id !== task.id));
  };

  function run(task: Task, optimistic: Task, work: () => Promise<Parameters<typeof action.report>[0]>, fallback: string) {
    setPending((current) => [...current, task.id]);
    replace(optimistic);
    void action
      .run(async () => {
        try {
          return await work();
        } catch (reason) {
          replace(task);
          throw reason;
        }
      }, fallback)
      .finally(() => setPending((current) => current.filter((id) => id !== task.id)));
  }

  const toggle = (task: Task) =>
    run(
      task,
      { ...task, completedAt: task.completedAt ? null : new Date().toISOString(), status: task.completedAt ? 'open' : 'done' },
      async () => {
        if (task.completedAt) {
          replace(await auth.request<Task>(`/tasks/${task.id}/reopen`, { method: 'POST' }));
          return '';
        }
        return completeTask(auth.request, task, (updated) => replace(updated ?? { ...task, completedAt: null, status: 'open' }));
      },
      'Could not update the task',
    );

  const setStatus = (task: Task, status: Task['status']) =>
    run(
      task,
      { ...task, status, completedAt: status === 'done' ? (task.completedAt ?? new Date().toISOString()) : null },
      async () => {
        replace(await auth.request<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }));
        return '';
      },
      'Could not move the task',
    );

  const move = (task: Task, target: { previousId: string | null; nextId: string | null; position: number }) =>
    run(
      task,
      { ...task, position: target.position },
      async () => {
        replace(await auth.request<Task>(`/tasks/${task.id}/move`, { method: 'POST', body: JSON.stringify({ previousId: target.previousId, nextId: target.nextId }) }));
        return '';
      },
      'Could not move the task',
    );

  return { pending, toggle, setStatus, move };
}

interface ViewProps {
  changes: ReturnType<typeof useTaskChanges>;
  editable: (task: Task) => boolean;
  onOpen: (task: Task) => void;
  where?: (task: Task) => string | undefined;
}

function GroupRows({
  changes,
  editable,
  onAnnounce,
  onOpen,
  tasks,
  virtual,
  where,
}: ViewProps & { onAnnounce: (message: string) => void; tasks: Task[]; virtual: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  useLayoutEffect(() => {
    if (virtual && list.current) setMargin(list.current.getBoundingClientRect().top + pageScroller().scrollTop);
  });
  const virtualizer = usePageVirtualizer({ count: tasks.length, enabled: virtual, estimateSize: () => 64, overscan: 10, scrollMargin: margin });

  function reorder(task: Task, to: number) {
    const target = reorderTask(tasks, task.id, to);
    if (!target) {
      onAnnounce(`${task.title} stays here. Tasks are ordered by due date, and only tasks due the same day can swap places.`);
      return false;
    }
    changes.move(task, target);
    onAnnounce(`Moved ${task.title} to position ${to + 1} of ${tasks.length}.`);
    return true;
  }

  const draggedIndex = tasks.findIndex((task) => task.id === dragging);
  const row = (task: Task, index: number, placement?: ComponentProps<'li'> & { [data: `data-${string}`]: string | number | undefined }) => {
    const canMove = editable(task) && tasks.length > 1;
    return (
      <TaskRow
        disabled={!editable(task) || changes.pending.includes(task.id)}
        handle={
          editable(task) && (
            <button
              aria-label={`Reorder ${task.title}`}
              className="task-handle"
              data-handle={task.id}
              disabled={tasks.length < 2}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                if (reorder(task, index + (event.key === 'ArrowUp' ? -1 : 1))) {
                  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-handle="${task.id}"]`)?.focus());
                }
              }}
              title="Drag to reorder, or use the up and down arrow keys"
              type="button"
            >
              <Icon name="grip" size={16} />
            </button>
          )
        }
        key={task.id}
        onEdit={() => onOpen(task)}
        onToggle={() => changes.toggle(task)}
        rowProps={{
          ...placement,
          draggable: canMove,
          'data-drop': over === task.id && dragging !== task.id ? (index < draggedIndex ? 'before' : 'after') : undefined,
          onDragStart: (event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', task.id);
            setDragging(task.id);
          },
          onDragOver: (event) => {
            if (!dragging) return;
            event.preventDefault();
            setOver(task.id);
          },
          onDrop: (event) => {
            event.preventDefault();
            const moved = tasks.find((candidate) => candidate.id === dragging);
            if (moved && moved.id !== task.id) reorder(moved, index);
            setDragging(undefined);
            setOver(undefined);
          },
          onDragEnd: () => {
            setDragging(undefined);
            setOver(undefined);
          },
        }}
        swipeable
        task={task}
        where={where?.(task)}
      />
    );
  };

  if (!virtual) return <ul className="panel-rows">{tasks.map((task, index) => row(task, index))}</ul>;
  return (
    <ul className="panel-rows task-rows-virtual" ref={list} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) =>
        row(tasks[item.index]!, item.index, {
          ref: virtualizer.measureElement,
          'data-index': item.index,
          style: { transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` },
        }),
      )}
    </ul>
  );
}

export function TaskGroups({ tasks, weekStart, ...view }: ViewProps & { tasks: Task[]; weekStart: number }) {
  const [announcement, setAnnouncement] = useState('');
  const groups = groupTasks(tasks, profileDay(), weekStart);
  return (
    <div className="grid gap-8">
      {groups.map((group) => (
        <section aria-labelledby={`task-group-${group.key}`} className="grid gap-3" key={group.key}>
          <SectionHeading
            action={<span className="text-small text-muted tabular-nums">{group.tasks.length}</span>}
            id={`task-group-${group.key}`}
            level={2}
            title={group.title}
          />
          <GroupRows {...view} onAnnounce={setAnnouncement} tasks={group.tasks} virtual={tasks.length > virtualAbove} />
        </section>
      ))}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export function TaskBoard({ changes, editable, onOpen, tasks, where }: ViewProps & { tasks: Task[] }) {
  const [dragging, setDragging] = useState<Task>();
  const [over, setOver] = useState<Task['status']>();
  const statusOf = (task: Task) => (task.completedAt ? 'done' : task.status === 'done' ? 'open' : task.status);
  return (
    <div className="task-board">
      {taskStatuses.map((column) => {
        const shown = tasks.filter((task) => statusOf(task) === column.value);
        return (
          <section
            aria-labelledby={`task-column-${column.value}`}
            className="task-column"
            data-over={(over === column.value && dragging && statusOf(dragging) !== column.value) || undefined}
            key={column.value}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(undefined);
            }}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(column.value);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging && statusOf(dragging) !== column.value) changes.setStatus(dragging, column.value);
              setDragging(undefined);
              setOver(undefined);
            }}
          >
            <SectionHeading action={<span className="text-small text-muted tabular-nums">{shown.length}</span>} id={`task-column-${column.value}`} level={2} title={column.label} />
            {shown.length === 0 ? (
              dragging ? (
                <p className="m-0 text-small text-muted">{`Drop here to mark it ${column.label.toLowerCase()}.`}</p>
              ) : (
                <Empty level={3} title="Nothing here" />
              )
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {shown.map((task) => {
                  const details = taskDetails(task, where?.(task));
                  return (
                    <Card as="li" className="task-card" interactive key={task.id} padding="sm">
                      <div
                        className="flex items-start gap-2"
                        draggable={editable(task)}
                        onDragEnd={() => {
                          setDragging(undefined);
                          setOver(undefined);
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', task.id);
                          setDragging(task);
                        }}
                      >
                        <button className="task-card-main" onClick={() => onOpen(task)} type="button">
                          <span>
                            <span className={`task-title ${task.completedAt ? 'is-done text-faint' : 'text-ink'}`}>{task.title}</span>
                          </span>
                          {details.length > 0 && (
                            <span className="flex min-w-0 flex-wrap items-center gap-2 text-small text-muted">
                              {isOverdue(task) && (
                                <Badge icon="alert" tone="danger">
                                  Overdue
                                </Badge>
                              )}
                              <span className="tabular-nums">{details.join(' · ')}</span>
                            </span>
                          )}
                        </button>
                        {task.assignee && <Avatar name={task.assignee.displayName} size="sm" />}
                        {editable(task) && (
                          <ActionsMenu
                            items={taskStatuses
                              .filter((status) => status.value !== column.value)
                              .map((status) => ({ label: `Move to ${status.label}`, onSelect: () => changes.setStatus(task, status.value) }))}
                            name={task.title}
                          />
                        )}
                      </div>
                    </Card>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
