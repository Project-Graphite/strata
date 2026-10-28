import { useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Avatar, Badge, Button, Checkbox, errorMessage, Icon, isAbortError, Pagination } from '@project-graphite/ui';
import { inActiveSpace, isSpaceResource, ActiveSpaceContext } from './active-space';
import type { Page as ResultPage } from './api';
import { useAuth } from './auth';
import { FilterChips } from './components/Page';
import { priorityNames } from './quick-add';
import type { Tag } from './spaces';
import { formatDate, profileDay } from './time';
import { useLiveRefresh, useResource } from './useResource';

export interface Task {
  id: string;
  spaceId: string;
  title: string;
  listId: string | null;
  parentId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  timeZone: string;
  repeatRule: string | null;
  reminderMinutes: number | null;
  priority: number;
  position: number;
  status: 'open' | 'in_progress' | 'done';
  labels: Tag[];
  subtaskCounts: { total: number; done: number };
  assignee: { id: string; handle: string; displayName: string } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Task {
  description: Record<string, unknown> | null;
  subtasks: Task[];
}

export const taskStatuses = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const;

export interface TaskList {
  id: string;
  spaceId: string;
  title: string;
  openTasks: number;
}

export const repeatPresets = [
  ['', 'Does not repeat'],
  ['FREQ=DAILY', 'Every day'],
  ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Every weekday'],
  ['FREQ=WEEKLY', 'Every week'],
  ['FREQ=WEEKLY;INTERVAL=2', 'Every two weeks'],
  ['FREQ=MONTHLY', 'Every month'],
  ['FREQ=YEARLY', 'Every year'],
] as const;

export const reminderPresets = [
  ['', 'No reminder'],
  ['0', 'At the due time'],
  ['15', '15 minutes before'],
  ['60', '1 hour before'],
  ['1440', '1 day before'],
] as const;

export function repeatOptions(current?: string | null) {
  const options: { value: string; label: string }[] = repeatPresets.map(([value, label]) => ({ value, label }));
  if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: 'Custom schedule' });
  return options;
}

export function reminderOptions(current?: number | null) {
  const options: { value: string; label: string }[] = reminderPresets.map(([value, label]) => ({ value, label }));
  if (current != null && !options.some((option) => option.value === String(current))) {
    const [amount, unit]: [number, string] = current % 1440 === 0 ? [current / 1440, 'day'] : current % 60 === 0 ? [current / 60, 'hour'] : [current, 'minute'];
    options.push({ value: String(current), label: `${amount} ${unit}${amount === 1 ? '' : 's'} before` });
  }
  return options;
}

export function dueLabel(task: Task) {
  return task.dueDate ? formatDate(task.dueDate, task.dueTime) : '';
}

export function isOverdue(task: Task) {
  return Boolean(task.dueDate && !task.completedAt && task.dueDate < profileDay());
}

export function repeatLabel(rule: string | null) {
  if (!rule) return '';
  return repeatPresets.find(([value]) => value === rule)?.[1].toLowerCase() ?? 'repeats';
}

export async function completeTask(request: ReturnType<typeof useAuth>['request'], task: Task, onChange: (completed?: Task) => void) {
  const updated = await request<Task>(`/tasks/${task.id}/complete`, { method: 'POST' });
  onChange(updated);
  return updated.completedAt
    ? {
        message: `Completed ${task.title}.`,
        undo: async () => {
          await request(`/tasks/${task.id}/reopen`, { method: 'POST' });
          onChange();
          return '';
        },
      }
    : `Done for now. ${task.title} is next due ${formatDate(updated.dueDate!)}.`;
}

export function taskDetails(task: Task, where?: string) {
  return [
    where,
    dueLabel(task),
    repeatLabel(task.repeatRule),
    task.priority > 0 && `${priorityNames[task.priority]!.toLowerCase()} priority`,
    task.subtaskCounts.total > 0 && `${task.subtaskCounts.done}/${task.subtaskCounts.total} subtasks`,
    ...task.labels.map((label) => `#${label.name}`),
  ].filter(Boolean);
}

const swipeDistance = 96;

export function TaskRow({
  actions,
  disabled,
  handle,
  onEdit,
  onToggle,
  rowProps,
  swipeable = false,
  task,
  where,
}: {
  actions?: ReactNode;
  disabled: boolean;
  handle?: ReactNode;
  onEdit: () => void;
  onToggle: () => void;
  rowProps?: ComponentProps<'li'> & { [data: `data-${string}`]: string | number | undefined };
  swipeable?: boolean;
  task: Task;
  where?: string;
}) {
  const done = Boolean(task.completedAt);
  const details = taskDetails(task, where);
  const start = useRef<{ x: number; y: number }>(undefined);
  const swiped = useRef(false);
  const [offset, setOffset] = useState(0);
  const settle = () => {
    start.current = undefined;
    setOffset(0);
  };
  return (
    <li
      {...rowProps}
      className={`list-row task-row ${rowProps?.className ?? ''}`}
      data-swiping={offset > 0 || undefined}
      onClickCapture={(event) => {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={settle}
      onPointerDown={(event) => {
        swiped.current = false;
        if (swipeable && !disabled && event.pointerType === 'touch') start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const across = event.clientX - start.current.x;
        if (offset === 0 && Math.abs(event.clientY - start.current.y) > Math.abs(across)) return settle();
        if (across > 8) setOffset(Math.min(across, swipeDistance * 1.5));
      }}
      onPointerUp={() => {
        if (offset > 8) swiped.current = true;
        if (offset >= swipeDistance) onToggle();
        settle();
      }}
      style={{ ...rowProps?.style, ...(offset > 0 ? { '--swipe': `${offset}px` } : {}) }}
    >
      {offset > 0 && (
        <span aria-hidden="true" className="task-swipe">
          <Icon name="check" size={18} />
          {offset >= swipeDistance ? (done ? 'Release to reopen' : 'Release to complete') : done ? 'Reopen' : 'Complete'}
        </span>
      )}
      {handle}
      <span className="list-row-lead">
        <label className="-m-2.5 grid shrink-0 cursor-pointer place-items-center p-2.5">
          <Checkbox aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`} checked={done} disabled={disabled} onChange={onToggle} />
        </label>
      </span>
      <button className="list-row-main" onClick={onEdit} type="button">
        <span className="list-row-text">
          <span className="list-row-title">
            <span className={`transition-colors ${done ? 'text-faint' : 'text-ink'}`}>
              {task.parentId && <span className="text-faint">↳ </span>}
              <span className={`task-title ${done ? 'is-done' : ''}`}>{task.title}</span>
            </span>
          </span>
          {details.length > 0 && (
            <span className="list-row-meta">
              <span className="flex min-w-0 items-center gap-2">
                {isOverdue(task) && (
                  <Badge icon="alert" tone="danger">
                    Overdue
                  </Badge>
                )}
                <span className="truncate tabular-nums">{details.join(' · ')}</span>
              </span>
            </span>
          )}
        </span>
      </button>
      {(task.assignee || actions) && (
        <span className="list-row-trail">
          {task.assignee && <Avatar name={task.assignee.displayName} size="sm" />}
          {actions}
        </span>
      )}
    </li>
  );
}

export type TaskView = 'list' | 'board';

export const taskViews: { value: TaskView; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
];

export type TaskLink = (next: { list?: string | null; completed?: boolean; page?: number; view?: TaskView }) => string;

export function taskLink(base: string, listId: string | null, completed: boolean, view: TaskView = 'list'): TaskLink {
  return (next) => {
    const query = new URLSearchParams();
    const list = next.list === undefined ? listId : next.list;
    if (list) query.set('list', list);
    if ((next.view ?? view) === 'board') query.set('view', 'board');
    else if (next.completed ?? completed) query.set('completed', 'true');
    if (next.page && next.page > 1) query.set('page', String(next.page));
    return `${base}${query.size ? `?${query}` : ''}`;
  };
}

export function TaskListChips({ link, listId, lists, onNewList }: { link: TaskLink; listId: string | null; lists: TaskList[]; onNewList?: () => void }) {
  return (
    <FilterChips
      items={[
        { active: !listId, href: link({ list: null, page: 1 }), label: 'All tasks' },
        ...lists.map((list) => ({ active: listId === list.id, count: list.openTasks, href: link({ list: list.id, page: 1 }), label: list.title })),
      ]}
      label="Lists"
    >
      {onNewList && (
        <Button icon="plus" onClick={onNewList} size="small">
          New list
        </Button>
      )}
    </FilterChips>
  );
}

export function TaskStatusChips({ completed, link }: { completed: boolean; link: TaskLink }) {
  return (
    <FilterChips
      items={[
        { active: !completed, href: link({ completed: false, page: 1 }), label: 'Open' },
        { active: completed, href: link({ completed: true, page: 1 }), label: 'Finished' },
      ]}
      label="Status"
    />
  );
}

export function TaskListFooter({ completed, link, tasks }: { completed?: boolean; link: TaskLink; tasks: ResultPage<Task> }) {
  if (completed === undefined && tasks.totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {completed !== undefined && (
        <Button href={link({ completed: !completed, page: 1 })} size="small" variant="text">
          {completed ? 'Show open' : 'Show finished'}
        </Button>
      )}
      <Pagination page={tasks.page} pageHref={(next) => link({ page: next })} totalPages={tasks.totalPages} />
    </div>
  );
}

export function useWeekStart() {
  return useResource<{ weekStart: number }>('/me', true).data?.weekStart;
}

const maxTaskPages = 10;

export function useAllTasks(path: string | null) {
  const { request } = useAuth();
  const active = useContext(ActiveSpaceContext);
  const scoped = path !== null && isSpaceResource(path);
  const spaceId = scoped ? active?.space?.id : undefined;
  const resolved = !path || (scoped && !spaceId) ? null : inActiveSpace(path, spaceId);
  const [state, setState] = useState<{ path: string; tasks?: Task[]; error: string; more: boolean }>();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  useLiveRefresh(reload, { live: ['tasks', 'items'] });

  useEffect(() => {
    if (!resolved) return;
    const controller = new AbortController();
    const page = (number: number) => request<ResultPage<Task>>(`${resolved}${resolved.includes('?') ? '&' : '?'}page=${number}`, { signal: controller.signal });
    void page(1)
      .then(async (first) => {
        const rest = await Promise.all(Array.from({ length: Math.min(first.totalPages, maxTaskPages) - 1 }, (_, index) => page(index + 2)));
        setState({ path: resolved, tasks: [first, ...rest].flatMap((result) => result.results), error: '', more: first.totalPages > maxTaskPages });
      })
      .catch((reason: unknown) => {
        if (!isAbortError(reason)) setState((current) => ({ path: resolved, tasks: current?.path === resolved ? current.tasks : undefined, error: errorMessage(reason, 'Could not load your tasks'), more: false }));
      });
    return () => controller.abort();
  }, [request, resolved, version]);

  const current = state?.path === resolved ? state : undefined;
  const mutate = useCallback((update: (tasks: Task[]) => Task[]) => setState((shown) => (shown?.tasks ? { ...shown, tasks: update(shown.tasks) } : shown)), []);
  return { data: current?.tasks, error: current?.tasks ? '' : (current?.error ?? ''), more: Boolean(current?.more), mutate, reload };
}
