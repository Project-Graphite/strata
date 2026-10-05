import { dateText, dateValue, dayMs } from '../recurrence/dates';

export const shiftDay = (day: string, days: number) => dateText(new Date(dateValue(day).getTime() + days * dayMs));

const weekStart = (day: string) => shiftDay(day, -((dateValue(day).getUTCDay() + 6) % 7));

export function habitStats(days: string[], perWeek: number, today: string) {
  const checked = new Set(days);
  const thisWeekStart = weekStart(today);
  const thisWeek = [...checked].filter((day) => day >= thisWeekStart && day <= today).length;
  let streak = 0;
  if (perWeek >= 7) {
    for (let day = checked.has(today) ? today : shiftDay(today, -1); checked.has(day); day = shiftDay(day, -1)) streak += 1;
  } else {
    const counts = new Map<string, number>();
    for (const day of checked) counts.set(weekStart(day), (counts.get(weekStart(day)) ?? 0) + 1);
    for (let week = thisWeek >= perWeek ? thisWeekStart : shiftDay(thisWeekStart, -7); (counts.get(week) ?? 0) >= perWeek; week = shiftDay(week, -7)) {
      streak += 1;
    }
  }
  return {
    checkedToday: checked.has(today),
    thisWeek,
    streak,
    recent: Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6)).filter((day) => checked.has(day)),
  };
}
