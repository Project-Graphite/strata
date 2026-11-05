import { useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Badge, Card, Checkbox, Icon, SectionHeading, useSnackbar } from '@project-graphite/ui';
import { IconButton } from './IconButton';
import { useAuth } from '../auth';
import { pageScroller } from '../page-scroll';
import { usePageVirtualizer } from '../page-virtualizer';
import { groupTasks, reorderTask } from '../task-groups';
import { completeTask, isOverdue, taskDetails, TaskRow, taskStatuses, type Task, type TaskColumn } from '../tasks';
import { profileDay } from '../time';
import { useAction } from '../useAction';
import { ActionsMenu } from './ActionsMenu';
import { AssigneeButton } from './AssigneeButton';
import type { NestedMenuItem } from './NestedMenu';

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
        return completeTask(auth.request, task, replace);
      },
      'Could not update the task',
    );

  const setStatus = (task: Task, status: Task['status']) =>
    run(
      task,
      { ...task, status, completedAt: status === 'done' ? (task.completedAt ?? new Date().toISOString()) : null },
      async () => {
        const saved = await auth.request<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        replace(saved);
        return saved.completedAt && !task.completedAt ? { message: `Completed ${task.title}.`, undo: async () => (replace(await auth.request<Task>(`/tasks/${task.id}/reopen`, { method: 'POST' })), '') } : '';
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

  const assign = (task: Task, assignee: Task['assignee']) =>
    run(
      task,
      { ...task, assignee },
      async () => {
        replace(await auth.request<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ assigneeId: assignee?.id ?? null }) }));
        return assignee ? `Assigned ${task.title} to ${assignee.displayName}.` : `Unassigned ${task.title}.`;
      },
      'Could not change the assignee',
    );

  const setColumn = (task: Task, columnId: string) =>
    run(
      task,
      { ...task, columnId, status: 'in_progress', completedAt: null },
      async () => {
        replace(await auth.request<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ columnId }) }));
        return '';
      },
      'Could not move the task',
    );

  return { pending, toggle, setStatus, setColumn, move, assign };
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
        onAssign={editable(task) ? (assignee) => changes.assign(task, assignee) : undefined}
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

interface BoardColumn {
  key: string;
  label: string;
  status: Task['status'];
  custom: TaskColumn[];
}

function boardColumns(columns: TaskColumn[]): BoardColumn[] {
  const custom = new Map<string, BoardColumn>();
  for (const column of columns) {
    const key = `column:${column.name.toLowerCase()}`;
    const entry = custom.get(key) ?? { key, label: column.name, status: 'in_progress', custom: [] };
    custom.set(key, { ...entry, custom: [...entry.custom, column] });
  }
  const fixed = taskStatuses.map((status) => ({ key: status.value, label: status.label, status: status.value, custom: [] }));
  return [fixed[0]!, fixed[1]!, ...custom.values(), fixed[2]!];
}

export function TaskBoard({
  changes,
  columnActions,
  columns,
  editable,
  finished,
  onAdd,
  onOpen,
  tasks,
  where,
}: ViewProps & {
  columnActions?: (column: TaskColumn) => NestedMenuItem[];
  columns: TaskColumn[];
  finished?: { shown: number; total: number; href: string };
  onAdd?: (status: Task['status']) => void;
  tasks: Task[];
}) {
  const show = useSnackbar();
  const [dragging, setDragging] = useState<Task>();
  const [over, setOver] = useState<string>();
  const shownColumns = boardColumns(columns);
  const keyOf = (task: Task) => {
    if (task.completedAt) return 'done';
    const column = task.columnId && columns.find((candidate) => candidate.id === task.columnId);
    if (column) return `column:${column.name.toLowerCase()}`;
    return task.status === 'done' ? 'open' : task.status;
  };
  const moveTo = (task: Task, column: BoardColumn) => {
    if (column.custom.length === 0) return changes.setStatus(task, column.status);
    const target = column.custom.find((candidate) => candidate.spaceId === task.spaceId && candidate.listId === task.listId);
    if (target) changes.setColumn(task, target.id);
    else show({ message: `The epic of ${task.title} has no ${column.label} column.`, tone: 'error' });
  };
  const board = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = board.current!;
    const content = element.closest('#content');
    const fit = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      const below = content ? parseFloat(getComputedStyle(content).paddingBottom) : 0;
      element.style.setProperty('--board-height', `${Math.max(window.innerHeight - top - below, 320)}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(document.body);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <div className="task-board" ref={board} style={{ '--board-columns': shownColumns.length } as CSSProperties}>
      {shownColumns.map((column) => {
        const shown = tasks.filter((task) => keyOf(task) === column.key);
        return (
          <section
            aria-labelledby={`task-column-${column.key}`}
            className="task-column"
            data-over={(over === column.key && dragging && keyOf(dragging) !== column.key) || undefined}
            key={column.key}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(undefined);
            }}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(column.key);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging && keyOf(dragging) !== column.key) moveTo(dragging, column);
              setDragging(undefined);
              setOver(undefined);
            }}
          >
            <SectionHeading
              action={
                <span className="flex items-center gap-1">
                  <span className="text-small text-muted tabular-nums">{shown.length}</span>
                  {onAdd && column.custom.length === 0 && <IconButton icon="plus" label={`New task in ${column.label}`} onClick={() => onAdd(column.status)} />}
                  {columnActions && column.custom.length === 1 && <ActionsMenu items={columnActions(column.custom[0]!)} name={`the ${column.label} column`} />}
                </span>
              }
              id={`task-column-${column.key}`}
              level={2}
              title={column.label}
            />
            {shown.length === 0 ? (
              <p className="task-column-empty">{dragging ? `Drop here to move it to ${column.label}` : 'No tasks'}</p>
            ) : (
              <ul className="task-column-cards m-0 grid list-none content-start gap-2 p-0">
                {shown.map((task) => {
                  const details = taskDetails(task, where?.(task));
                  const done = Boolean(task.completedAt);
                  return (
                    <Card as="li" className={`task-card ${done ? 'task-done' : ''}`} interactive key={task.id} padding="sm">
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
                        <Checkbox
                          aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
                          checked={done}
                          className="task-card-check"
                          disabled={!editable(task) || changes.pending.includes(task.id)}
                          onChange={() => changes.toggle(task)}
                        />
                        <button className="task-card-main" onClick={() => onOpen(task)} type="button">
                          <span>
                            <span className={`task-title ${done ? 'is-done text-faint' : 'text-ink'}`}>{task.title}</span>
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
                        <span className="task-card-trail">
                          <AssigneeButton onAssign={editable(task) ? (assignee) => changes.assign(task, assignee) : undefined} task={task} />
                          {editable(task) && (
                            <ActionsMenu
                              items={[
                                { label: 'Open', onSelect: () => onOpen(task) },
                                {
                                  label: 'Move to',
                                  items: shownColumns.filter((other) => other.key !== column.key).map((other) => ({ label: other.label, onSelect: () => moveTo(task, other) })),
                                },
                              ]}
                              name={task.title}
                            />
                          )}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </ul>
            )}
            {column.key === 'done' && finished && finished.total > finished.shown && (
              <Link className="task-column-more" to={finished.href}>
                Show all {finished.total} finished tasks
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
