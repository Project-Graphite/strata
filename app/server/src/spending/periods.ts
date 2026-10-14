import { dateText, dateValue, dayMs, nextMonth } from '../recurrence/dates';

const pad = (value: number) => String(value).padStart(2, '0');

export function previousMonth(month: string) {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return number === 1 ? `${year - 1}-12` : `${year}-${pad(number - 1)}`;
}

export const periodOf = (month: string, startDay: number) => ({ from: `${month}-${pad(startDay)}`, to: `${nextMonth(month)}-${pad(startDay)}` });

export const monthOf = (day: string, startDay: number) => (Number(day.slice(8)) >= startDay ? day.slice(0, 7) : previousMonth(day.slice(0, 7)));

export const dayBefore = (day: string) => dateText(new Date(dateValue(day).getTime() - dayMs));

export const daysBetween = (from: string, to: string) => Math.round((dateValue(to).getTime() - dateValue(from).getTime()) / dayMs);
