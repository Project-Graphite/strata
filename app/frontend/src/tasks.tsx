import { startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Badge, Button, Checkbox, errorMessage, Icon, Pagination } from '@project-graphite/ui';
import { ActiveSpaceContext } from './active-space';
import type { Page as ResultPage } from './api';
import { useAuth } from './auth';
import { AssigneeButton } from './components/AssigneeButton';
import type { FilterGroup } from './components/FilterMenu';
import { priorityNames } from './quick-add';
import { useSwipe } from './swipe';
import type { Tag } from './spaces';
import { capitalised, formatDate, profileDay } from './time';
import { taskPage } from './route-data';
import { cachedData, cachedRequest, resourceKey, useLiveRefresh, useResource } from './useResource';

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
  priority: number;
  position: number;
  status: 'open' | 'in_progress' | 'done';
  type: string;
  columnId: string | null;
  labels: Tag[];
  subtaskCounts: { total: number; done: number };
  assignee: { id: string; handle: string; displayName: string } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskColumn {
  id: string;
  spaceId: string;
  name: string;
  position: number;
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
    task.type !== 'task' && taskTypeLabel(task.type),
    where,
    dueLabel(task),
    repeatLabel(task.repeatRule),
    task.priority > 0 && `${priorityNames[task.priority]!.toLowerCase()} priority`,
    task.subtaskCounts.total > 0 && `${task.subtaskCounts.done}/${task.subtaskCounts.total} subtasks`,
    ...task.labels.map((label) => `#${label.name}`),
  ].filter(Boolean);
}

export function TaskRow({
  actions,
  disabled,
  handle,
  onAssign,
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
  onAssign?: (assignee: Task['assignee']) => void;
  onEdit: () => void;
  onToggle: () => void;
  rowProps?: ComponentProps<'li'> & { [data: `data-${string}`]: string | number | undefined };
  swipeable?: boolean;
  task: Task;
  where?: string;
}) {
  const done = Boolean(task.completedAt);
  const details = taskDetails(task, where);
  const swipe = useSwipe({ enabled: swipeable && !disabled, onRight: onToggle });
  return (
    <li {...rowProps} {...swipe.props} className={`list-row task-row swipe-row ${task.parentId ? 'ps-12' : ''} ${rowProps?.className ?? ''}`} style={{ ...rowProps?.style, ...swipe.props.style }}>
      {swipe.offset > 0 && (
        <span aria-hidden="true" className="swipe-hint">
          <Icon name="check" size={18} />
          {swipe.passed ? (done ? 'Release to reopen' : 'Release to complete') : done ? 'Reopen' : 'Complete'}
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
              <span className={`task-title ${done ? 'is-done' : ''}`}>{task.title}</span>
            </span>
          </span>
          {details.length > 0 && <span className="list-row-meta tabular-nums">{capitalised(details.join(' · '))}</span>}
        </span>
      </button>
      {(isOverdue(task) || task.assignee || onAssign || actions) && (
        <span className="list-row-trail">
          {isOverdue(task) && (
            <Badge icon="alert" tone="danger">
              Overdue
            </Badge>
          )}
          <AssigneeButton onAssign={onAssign} task={task} />
          {actions}
        </span>
      )}
    </li>
  );
}

export const defaultEpicName = 'General';

export type TaskView = 'list' | 'board';

export const taskViews: { value: TaskView; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
];

export interface TaskFilterState {
  listId: string | null;
  completed: boolean;
  view: TaskView;
  assignee: string | null;
  type: string | null;
}

export function taskFilterState(params: URLSearchParams): TaskFilterState {
  const view = params.get('view') === 'list' ? 'list' : 'board';
  return { listId: params.get('list'), view, completed: view === 'list' && params.get('completed') === 'true', assignee: params.get('assignee'), type: params.get('type') };
}

export const noFilterChoices: TaskFilterChoices = { types: [], assignees: [] };

export type TaskLink = (next: { list?: string | null; completed?: boolean; page?: number; view?: TaskView; assignee?: string | null; type?: string | null }) => string;

export function taskLink(base: string, state: TaskFilterState): TaskLink {
  return (next) => {
    const query = new URLSearchParams();
    const list = next.list === undefined ? state.listId : next.list;
    const assignee = next.assignee === undefined ? state.assignee : next.assignee;
    const type = next.type === undefined ? state.type : next.type;
    if (list) query.set('list', list);
    if (assignee) query.set('assignee', assignee);
    if (type) query.set('type', type);
    if ((next.view ?? state.view) === 'list') {
      query.set('view', 'list');
      if (next.completed ?? state.completed) query.set('completed', 'true');
    }
    if (next.page && next.page > 1) query.set('page', String(next.page));
    return `${base}${query.size ? `?${query}` : ''}`;
  };
}

export const builtInTaskTypes = ['task', 'idea'];

export const taskTypeLabel = (type: string) => (type === 'task' ? 'Task' : type === 'idea' ? 'Idea' : type);

export interface TaskFilterChoices {
  types: string[];
  assignees: { id: string; displayName: string }[];
}

export function taskFilterQuery({ assignee, listId, type }: Pick<TaskFilterState, 'assignee' | 'listId' | 'type'>) {
  return new URLSearchParams([...(listId ? [['listId', listId]] : []), ...(assignee ? [['assignee', assignee]] : []), ...(type ? [['type', type]] : [])]).toString();
}

export function taskFilters({
  choices,
  defaultAssignee,
  link,
  lists,
  state,
}: {
  choices: TaskFilterChoices;
  defaultAssignee: string;
  link: TaskLink;
  lists: TaskList[];
  state: TaskFilterState;
}): FilterGroup[] {
  const { assignee, completed, listId, type, view } = state;
  return [
    {
      label: 'Epic',
      options: [
        { active: !listId, href: link({ list: null, page: 1 }), label: 'All epics' },
        { active: listId === 'none', href: link({ list: 'none', page: 1 }), label: defaultEpicName },
        ...lists.map((list) => ({ active: listId === list.id, count: list.openTasks, href: link({ list: list.id, page: 1 }), label: list.title })),
      ],
    },
    {
      label: 'Assignee',
      options: [
        { active: !assignee, href: link({ assignee: null, page: 1 }), label: defaultAssignee },
        ...(defaultAssignee === 'Anyone' ? [] : [{ active: assignee === 'any', href: link({ assignee: 'any', page: 1 }), label: 'Anyone' }]),
        { active: assignee === 'me', href: link({ assignee: 'me', page: 1 }), label: 'Assigned to me' },
        { active: assignee === 'none', href: link({ assignee: 'none', page: 1 }), label: 'Unassigned' },
        ...choices.assignees.map((person) => ({ active: assignee === person.id, href: link({ assignee: person.id, page: 1 }), label: person.displayName })),
      ],
    },
    {
      label: 'Type',
      options: [
        { active: !type, href: link({ type: null, page: 1 }), label: 'All types' },
        ...[...builtInTaskTypes, ...choices.types].map((option) => ({ active: type === option, href: link({ type: option, page: 1 }), label: taskTypeLabel(option) })),
      ],
    },
    ...(view === 'list'
      ? [
          {
            label: 'Status',
            options: [
              { active: !completed, href: link({ completed: false, page: 1 }), label: 'Open' },
              { active: completed, href: link({ completed: true, page: 1 }), label: 'Finished' },
            ],
          },
        ]
      : []),
  ];
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
  const { request, user } = useAuth();
  const spaceId = useContext(ActiveSpaceContext)?.space?.id;
  const userId = user?.id;
  const pageKey = (number: number) => (path && userId ? resourceKey(taskPage(path, number), userId, spaceId) : null);
  const firstKey = pageKey(1);
  const [state, setState] = useState<{ key: string; tasks?: Task[]; error: string; more: boolean }>();
  const [version, setVersion] = useState(0);
  const reloadedAt = useRef(0);
  const reload = useCallback(() => {
    reloadedAt.current = Date.now();
    setVersion((current) => current + 1);
  }, []);
  useLiveRefresh(reload, { live: ['tasks', 'items'] });

  useEffect(() => {
    if (!path || !userId || !firstKey) return;
    let stale = false;
    const page = (number: number) => cachedRequest<ResultPage<Task>>(request, userId, taskPage(path, number), spaceId, reloadedAt.current)!;
    void page(1)
      .then(async (first) => {
        const rest = await Promise.all(Array.from({ length: Math.min(first.totalPages, maxTaskPages) - 1 }, (_, index) => page(index + 2)));
        if (!stale) startTransition(() => setState({ key: firstKey, tasks: [first, ...rest].flatMap((result) => result.results), error: '', more: first.totalPages > maxTaskPages }));
      })
      .catch((reason: unknown) => {
        if (!stale) setState((current) => ({ key: firstKey, tasks: current?.key === firstKey ? current.tasks : undefined, error: errorMessage(reason, 'Could not load your tasks'), more: false }));
      });
    return () => {
      stale = true;
    };
  }, [firstKey, path, request, spaceId, userId, version]);

  const current = state?.key === firstKey ? state : undefined;
  const cached = useMemo(() => {
    const first = cachedData<ResultPage<Task>>(firstKey);
    if (!first) return undefined;
    const pages = [first, ...Array.from({ length: Math.min(first.totalPages, maxTaskPages) - 1 }, (_, index) => cachedData<ResultPage<Task>>(pageKey(index + 2)))];
    return pages.every(Boolean) ? { tasks: pages.flatMap((result) => result!.results), more: first.totalPages > maxTaskPages } : undefined;
  }, [firstKey]);
  const shown = current?.tasks ? current : cached;
  const mutate = useCallback((update: (tasks: Task[]) => Task[]) => setState((latest) => (latest?.tasks ? { ...latest, tasks: update(latest.tasks) } : latest)), []);
  return { data: shown?.tasks, error: shown ? '' : (current?.error ?? ''), more: Boolean(shown?.more), mutate, reload };
}
