export type TaskGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

interface Placed {
  id: string;
  spaceId: string;
  dueDate: string | null;
  position: number;
}

export const taskGroupTitles: Record<TaskGroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  none: 'No date',
};

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dueOrder = (first: string | null, second: string | null) => (first === second ? 0 : first === null ? 1 : second === null ? -1 : first < second ? -1 : 1);

export function taskGroupOf(dueDate: string | null, today: string, weekStart: number): TaskGroupKey {
  if (!dueDate) return 'none';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate === shift(today, 1)) return 'tomorrow';
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return dueDate <= shift(today, 6 - ((weekday - weekStart + 7) % 7)) ? 'week' : 'later';
}

export function groupTasks<T extends Placed>(tasks: T[], today: string, weekStart: number) {
  const sorted = tasks.toSorted((first, second) => dueOrder(first.dueDate, second.dueDate) || first.position - second.position);
  return (Object.keys(taskGroupTitles) as TaskGroupKey[])
    .map((key) => ({ key, title: taskGroupTitles[key], tasks: sorted.filter((task) => taskGroupOf(task.dueDate, today, weekStart) === key) }))
    .filter((group) => group.tasks.length > 0);
}

export function reorderTask<T extends Placed>(tasks: T[], id: string, to: number) {
  const moved = tasks.find((task) => task.id === id);
  if (!moved || to < 0 || to >= tasks.length) return null;
  const order = tasks.filter((task) => task !== moved);
  order.splice(to, 0, moved);
  if (order.some((task, index) => index > 0 && dueOrder(order[index - 1]!.dueDate, task.dueDate) > 0)) return null;
  const peers = order.filter((task) => task.dueDate === moved.dueDate && task.spaceId === moved.spaceId);
  const at = peers.indexOf(moved);
  const previous = peers[at - 1];
  const next = peers[at + 1];
  if (!previous && !next) return null;
  const position = previous && next ? (previous.position + next.position) / 2 : previous ? previous.position + 1024 : next!.position - 1024;
  return { previousId: previous?.id ?? null, nextId: next?.id ?? null, position };
}
