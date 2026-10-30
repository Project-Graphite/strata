import type { Habit } from './habits';
import type { Task } from './tasks';
import { formatMonth } from './time';

export type GoalPeriod = 'year' | 'quarter' | 'month';
export type GoalStatus = 'active' | 'done' | 'dropped';

export interface Goal {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  period: GoalPeriod;
  startsOn: string;
  endsOn: string;
  status: GoalStatus;
  why: string;
  target: number | null;
  current: number | null;
  unit: string | null;
  tasks: { done: number; total: number };
  habitCount: number;
  progress: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalDetail extends Goal {
  taskList: (Task & { linkId: string })[];
  habits: Habit[];
}

export function periodLabel(period: GoalPeriod, startsOn: string) {
  const year = startsOn.slice(0, 4);
  if (period === 'year') return year;
  if (period === 'quarter') return `Q${Math.floor((Number(startsOn.slice(5, 7)) - 1) / 3) + 1} ${year}`;
  return formatMonth(startsOn);
}

export function periodChoices(period: GoalPeriod, today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const steps = { year: { months: 12, from: -1, count: 4 }, quarter: { months: 3, from: -1, count: 6 }, month: { months: 1, from: -1, count: 14 } }[period];
  const first = period === 'year' ? 0 : period === 'quarter' ? month - (month % 3) : month;
  return Array.from({ length: steps.count }, (_, index) => {
    const start = new Date(Date.UTC(year, first + (steps.from + index) * steps.months, 1)).toISOString().slice(0, 10);
    return { value: start, label: periodLabel(period, start) };
  });
}

export function periodStart(period: GoalPeriod, day: string) {
  return periodChoices(period, day)[1]!.value;
}

const amount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function progressText(goal: Goal) {
  if (goal.target) return `${amount(goal.current ?? 0)} of ${amount(goal.target)}${goal.unit ? ` ${goal.unit}` : ''}`;
  if (goal.tasks.total) return `${goal.tasks.done} of ${goal.tasks.total} task${goal.tasks.total === 1 ? '' : 's'} done`;
  return 'Link tasks or set a number to track progress';
}

export const statusLabels: Record<GoalStatus, string> = { active: 'Active', done: 'Done', dropped: 'Dropped' };
