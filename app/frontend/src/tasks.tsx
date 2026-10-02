import { Avatar } from '@project-graphite/ui';

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
      : new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return task.dueTime ? `${day} ${task.dueTime}` : day;
}

export function isOverdue(task: Task) {
  return Boolean(task.dueDate && !task.completedAt && task.dueDate < localToday());
}

export function repeatLabel(rule: string | null) {
  if (!rule) return '';
  return repeatPresets.find(([value]) => value === rule)?.[1].toLowerCase() ?? 'repeats';
}

export function TaskRow({
  disabled,
  onEdit,
  onToggle,
  task,
  where,
}: {
  disabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
  task: Task;
  where?: string;
}) {
  const done = Boolean(task.completedAt);
  const details = [
    where,
    dueLabel(task),
    repeatLabel(task.repeatRule),
    priorityLabels[task.priority] && `${priorityLabels[task.priority]} priority`,
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-3 border-b border-line-soft py-3">
      <input
        aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        checked={done}
        className="h-5 w-5 shrink-0"
        disabled={disabled}
        onChange={onToggle}
        type="checkbox"
      />
      <button className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left" onClick={onEdit} type="button">
        <span className={`block truncate ${done ? 'text-faint line-through' : 'text-ink'}`}>
          {task.parentId && <span className="text-faint">↳ </span>}
          {task.title}
        </span>
        {details.length > 0 && (
          <span className={`mono-sm mt-0.5 block truncate ${isOverdue(task) ? 'text-danger' : 'text-faint'}`}>
            {details.join(' · ')}
          </span>
        )}
      </button>
      {task.assignee && <Avatar name={task.assignee.displayName} size="sm" />}
    </li>
  );
}
