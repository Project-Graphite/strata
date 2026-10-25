import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import type { ReactNode } from 'react';
import { Avatar, Button, Checkbox, formatDay, Icon, Pagination } from '@project-graphite/ui';
import type { Page as ResultPage } from './api';
import type { useAuth } from './auth';
import { FilterChips } from './components/Page';
import { clockTime } from './time';

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
  assignee: { id: string; handle: string; displayName: string } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  id: string;
  spaceId: string;
  title: string;
  openTasks: number;
}

const repeatPresets = [
  ['', 'Does not repeat'],
  ['FREQ=DAILY', 'Every day'],
  ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Every weekday'],
  ['FREQ=WEEKLY', 'Every week'],
  ['FREQ=WEEKLY;INTERVAL=2', 'Every two weeks'],
  ['FREQ=MONTHLY', 'Every month'],
  ['FREQ=YEARLY', 'Every year'],
] as const;

const reminderPresets = [
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

const priorityLabels = ['', 'low', 'medium', 'high'];

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dueLabel(task: Task) {
  if (!task.dueDate) return '';
  const today = localToday();
  const day =
    task.dueDate === today
      ? 'today'
      : formatDay(task.dueDate, { weekday: 'short', day: 'numeric', month: 'short' });
  return task.dueTime ? `${day} ${clockTime(task.dueTime)}` : day;
}

function isOverdue(task: Task) {
  return Boolean(task.dueDate && !task.completedAt && task.dueDate < localToday());
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
    : `Done for now. ${task.title} is next due ${formatDay(updated.dueDate!)}.`;
}

export function taskDetails(task: Task, where?: string) {
  return [where, dueLabel(task), repeatLabel(task.repeatRule), priorityLabels[task.priority] && `${priorityLabels[task.priority]} priority`].filter(Boolean);
}

export function TaskRow({
  actions,
  disabled,
  onEdit,
  onToggle,
  task,
  where,
}: {
  actions?: ReactNode;
  disabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
  task: Task;
  where?: string;
}) {
  const done = Boolean(task.completedAt);
  const details = taskDetails(task, where);
  return (
    <li className="flex min-w-0 items-center gap-3 panel-row">
      <label className="-m-2.5 grid shrink-0 cursor-pointer place-items-center p-2.5">
        <Checkbox
          aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          checked={done}
          disabled={disabled}
          onChange={onToggle}
        />
      </label>
      <ButtonBase className="min-w-0 flex-1 flex-col items-stretch text-left" onClick={onEdit}>
        <span className={`block truncate transition-colors ${done ? 'text-faint' : 'text-ink'}`}>
          {task.parentId && <span className="text-faint">↳ </span>}
          <span className={`task-title ${done ? 'is-done' : ''}`}>{task.title}</span>
        </span>
        {details.length > 0 && (
          <span className={`mono-sm mt-0.5 block truncate ${isOverdue(task) ? 'text-danger' : 'text-faint'}`}>
            {details.join(' · ')}
          </span>
        )}
      </ButtonBase>
      {task.assignee && <Avatar name={task.assignee.displayName} size="sm" />}
      {actions}
    </li>
  );
}

type TaskLink = (next: { list?: string | null; completed?: boolean; page?: number }) => string;

export function taskLink(base: string, listId: string | null, completed: boolean): TaskLink {
  return (next) => {
    const query = new URLSearchParams();
    const list = next.list === undefined ? listId : next.list;
    if (list) query.set('list', list);
    if (next.completed ?? completed) query.set('completed', 'true');
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
        <Chip
          icon={
            <span className="inline-flex">
              <Icon name="plus" size={14} />
            </span>
          }
          label="New list"
          onClick={onNewList}
          variant="outlined"
        />
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
