import { weekdays, type RepetitionRule } from './rule';

export interface LocalStart {
  date: string;
  time: string;
  timeZone: string;
}

const dayMs = 24 * 60 * 60 * 1000;
const maxPeriods = 100_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function dayNumber(year: number, month: number, day: number) {
  return Date.UTC(year, month - 1, day) / dayMs;
}

function calendarDay(day: number) {
  const date = new Date(day * dayMs);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: (date.getUTCDay() + 6) % 7,
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function zoneOffset(timeZone: string, instant: number) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!) - instant;
}

export function zonedInstant(day: number, hour: number, minute: number, timeZone: string) {
  const wall = day * dayMs + (hour * 60 + minute) * 60_000;
  const guess = wall - zoneOffset(timeZone, wall);
  return new Date(wall - zoneOffset(timeZone, guess));
}

function pick<T>(values: T[], positions: number[]) {
  return [...new Set(positions.map((position) => values[position > 0 ? position - 1 : values.length + position]))].filter(
    (value): value is T => value !== undefined,
  );
}

export function occurrences(
  rule: RepetitionRule,
  start: LocalStart,
  window: { from: Date; to: Date },
  limit = 500,
): Date[] {
  const [startYear, startMonth, startDate] = start.date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = start.time.split(':').map(Number) as [number, number];
  const startDay = dayNumber(startYear, startMonth, startDate);
  const { weekday: startWeekday } = calendarDay(startDay);
  const chosenWeekdays = new Set(rule.byDay.map((day) => weekdays.indexOf(day.weekday)));
  const weekStart = weekdays.indexOf(rule.weekStart);
  const firstWeek = startDay - ((startWeekday - weekStart + 7) % 7);

  const matchesDay = (day: number) => {
    const date = calendarDay(day);
    const monthLength = daysInMonth(date.year, date.month);
    return (
      (chosenWeekdays.size === 0 || chosenWeekdays.has(date.weekday)) &&
      (rule.byMonthDay.length === 0 ||
        rule.byMonthDay.some((value) => (value > 0 ? value : monthLength + value + 1) === date.day))
    );
  };

  const monthDays = (year: number, month: number) => {
    const length = daysInMonth(year, month);
    const first = dayNumber(year, month, 1);
    const all = Array.from({ length }, (_, index) => first + index);
    const byMonthDay = rule.byMonthDay
      .map((value) => (value > 0 ? value : length + value + 1))
      .filter((value) => value >= 1 && value <= length)
      .map((value) => first + value - 1);
    const byDay = rule.byDay.flatMap((rule) => {
      const matching = all.filter((day) => calendarDay(day).weekday === weekdays.indexOf(rule.weekday));
      return rule.ordinal === null ? matching : pick(matching, [rule.ordinal]);
    });
    if (rule.byMonthDay.length > 0 && rule.byDay.length > 0) return byMonthDay.filter((day) => byDay.includes(day));
    if (rule.byDay.length > 0) return byDay;
    if (rule.byMonthDay.length > 0) return byMonthDay;
    return startDate <= length ? [first + startDate - 1] : [];
  };

  const period = (index: number): { first: number; days: number[] } => {
    const step = index * rule.interval;
    switch (rule.frequency) {
      case 'DAILY': {
        const day = startDay + step;
        return { first: day, days: matchesDay(day) ? [day] : [] };
      }
      case 'WEEKLY': {
        const first = firstWeek + step * 7;
        const days = Array.from({ length: 7 }, (_, offset) => first + offset);
        return {
          first,
          days: days.filter((day) =>
            chosenWeekdays.size === 0 ? calendarDay(day).weekday === startWeekday : chosenWeekdays.has(calendarDay(day).weekday),
          ),
        };
      }
      case 'MONTHLY': {
        const months = startYear * 12 + startMonth - 1 + step;
        const year = Math.floor(months / 12);
        const month = (months % 12) + 1;
        return { first: dayNumber(year, month, 1), days: monthDays(year, month) };
      }
      case 'YEARLY': {
        const year = startYear + step;
        const exists = startDate <= daysInMonth(year, startMonth);
        return { first: dayNumber(year, 1, 1), days: exists ? [dayNumber(year, startMonth, startDate)] : [] };
      }
    }
  };

  const found: Date[] = [];
  let emitted = 0;
  for (let index = 0; index < maxPeriods; index += 1) {
    const { first, days } = period(index);
    if (zonedInstant(first, 0, 0, start.timeZone).getTime() > window.to.getTime() + dayMs) {
      break;
    }
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    for (const day of rule.bySetPos.length > 0 ? pick(sorted, rule.bySetPos).sort((a, b) => a - b) : sorted) {
      if (day < startDay) continue;
      const at = zonedInstant(day, hour, minute, start.timeZone);
      if (rule.until && at > rule.until) return found;
      emitted += 1;
      if (at >= window.from && at < window.to) found.push(at);
      if (found.length >= limit || (rule.count !== null && emitted >= rule.count)) return found;
    }
  }
  return found;
}
