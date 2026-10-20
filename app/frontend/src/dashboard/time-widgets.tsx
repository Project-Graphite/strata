import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatDay, IconButton, Meter, type TagColor } from '@project-graphite/ui';
import { addDays, dayKey, entryDay, monthDays, shiftMonth, useAgenda } from '../agenda';
import { LoadError } from '../components/LoadError';

export function CalendarWidget() {
  const today = dayKey(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const { from, to } = monthDays(`${month}-01`);
  const agenda = useAgenda(from, to);
  const busy = new Map<string, TagColor[]>();
  for (const entry of agenda.data ?? []) busy.set(entryDay(entry), [...(busy.get(entryDay(entry)) ?? []), agenda.colourOf(entry)]);
  const days = Array.from({ length: 42 }, (_, index) => addDays(from, index));
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink">{formatDay(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
        <span className="-mr-1.5 flex items-center">
          <IconButton icon="chevron-left" label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} size="small" />
          <IconButton icon="chevron-right" label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} size="small" />
        </span>
      </div>
      <div className="widget-calendar">
        {days.slice(0, 7).map((day) => (
          <span aria-hidden="true" className="widget-calendar-weekday" key={`weekday-${day}`}>
            {formatDay(day, { weekday: 'narrow' })}
          </span>
        ))}
        {days.map((day) => {
          const colours = busy.get(day) ?? [];
          return (
            <Link
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}${colours.length ? `, ${colours.length} planned` : ''}`}
              className={`widget-calendar-day ${day.startsWith(month) ? '' : 'is-outside'}`}
              key={day}
              to={`/agenda/day?date=${day}`}
            >
              {Number(day.slice(8))}
              <span aria-hidden="true" className="widget-calendar-dots">
                {colours.slice(0, 3).map((colour, index) => (
                  <span className={`tag-${colour}`} key={`${colour}-${index}`} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>
      {agenda.error && <LoadError compact error={agenda.error} onRetry={agenda.reload} />}
    </div>
  );
}

export function DayProgress() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const monday = date - ((now.getDay() + 6) % 7);
  const at = (...parts: [number, number, number]) => new Date(...parts).getTime();
  const spans: [string, number, number][] = [
    ['Today', at(year, month, date), at(year, month, date + 1)],
    ['This week', at(year, month, monday), at(year, month, monday + 7)],
    ['This month', at(year, month, 1), at(year, month + 1, 1)],
    ['This year', at(year, 0, 1), at(year + 1, 0, 1)],
  ];
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {spans.map(([label, start, end]) => {
        const share = (now.getTime() - start) / (end - start);
        return (
          <li className="grid gap-1" key={label}>
            <span className="flex justify-between gap-3 text-sm">
              <span className="text-muted">{label}</span>
              <span className="text-ink tabular-nums">{Math.floor(share * 100)}%</span>
            </span>
            <Meter label={`${label}, gone so far`} value={share} />
          </li>
        );
      })}
    </ul>
  );
}
