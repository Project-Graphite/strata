import { formatDay, type TagColor } from '@project-graphite/ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { dayKey, entryTime, type AgendaEntry } from '../agenda';
import { AgendaEntryLink } from './AgendaEntryLink';
import { clockTime } from '../time';

const hourHeight = 48;
const dayMinutes = 24 * 60;
const minuteMs = 60_000;

interface Placed {
  entry: AgendaEntry;
  start: number;
  end: number;
  column: number;
  columns: number;
}

const minutesInto = (day: string, at: string) => (new Date(at).getTime() - new Date(`${day}T00:00:00`).getTime()) / minuteMs;

function place(day: string, entries: AgendaEntry[]) {
  const spans = entries
    .map((entry) => {
      const start = minutesInto(day, entry.start);
      return { entry, start, end: entry.end ? minutesInto(day, entry.end) : start + 30 };
    })
    .filter((span) => span.end > 0 && span.start < dayMinutes)
    .map((span) => ({ ...span, start: Math.max(0, span.start), end: Math.min(dayMinutes, Math.max(span.end, span.start + 20)) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = 0;
  const close = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const span of spans) {
    if (span.start >= clusterEnd) close();
    const free = columnEnds.findIndex((end) => end <= span.start);
    const column = free === -1 ? columnEnds.length : free;
    columnEnds[column] = span.end;
    const item = { ...span, column, columns: 1 };
    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  close();
  return placed;
}

export function DayNumber({ day, today }: { day: string; today: string }) {
  return (
    <span className={`mono-sm grid size-7 place-items-center rounded-full ${day === today ? 'bg-ink font-medium text-paper' : ''}`}>{new Date(`${day}T00:00:00`).getDate()}</span>
  );
}

function NowLine({ day }: { day: string }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), minuteMs);
    return () => clearInterval(timer);
  }, []);
  return <div aria-hidden="true" className="agenda-now" style={{ top: (minutesInto(day, now) / 60) * hourHeight }} />;
}

export function TimeGrid({
  colourOf,
  dayHref,
  days,
  entries,
  today,
}: {
  colourOf: (entry: AgendaEntry) => TagColor;
  dayHref: (day: string) => string;
  days: string[];
  entries: AgendaEntry[];
  today: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const timed = useMemo(() => entries.filter((entry) => !entry.allDay), [entries]);
  const placed = useMemo(() => new Map(days.map((day) => [day, place(day, timed)])), [days, timed]);
  const allDay = entries.filter((entry) => entry.allDay);
  const columns = { gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))` };
  const firstHour = Math.min(8, ...timed.filter((entry) => days.includes(dayKey(new Date(entry.start)))).map((entry) => new Date(entry.start).getHours()));

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: Math.max(0, firstHour - 1) * hourHeight });
  }, [firstHour]);

  return (
    <div className="max-h-[70vh] overflow-auto rounded-panel border border-line" ref={scroller}>
      <div style={{ minWidth: days.length > 1 ? '40rem' : undefined }}>
        <div className="sticky top-0 z-2 bg-paper">
          <div className="grid border-b border-line" style={columns}>
            <span className="sticky left-0 bg-paper" />
            {days.map((day) => (
              <Link
                aria-current={day === today ? 'date' : undefined}
                className={`agenda-day-head border-l border-line ${day === today ? 'text-ink' : 'text-faint'}`}
                key={day}
                to={dayHref(day)}
              >
                <span className="text-xs uppercase">{formatDay(day, { weekday: 'short' })}</span>
                <DayNumber day={day} today={today} />
              </Link>
            ))}
          </div>
          {allDay.length > 0 && (
            <div className="grid border-b border-line" style={columns}>
              <span className="mono-sm sticky left-0 grid content-center bg-paper px-1 text-faint">all day</span>
              {days.map((day) => (
                <div className="grid content-start gap-0.5 border-l border-line p-1" key={day}>
                  {allDay
                    .filter((entry) => entry.start <= day && (entry.end ?? entry.start) >= day)
                    .map((entry) => (
                      <AgendaEntryLink className="agenda-chip" colour={colourOf(entry)} entry={entry} key={`${entry.kind}-${entry.itemId}-${entry.start}`}>
                        {entry.title}
                      </AgendaEntryLink>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid" style={{ ...columns, height: 24 * hourHeight }}>
          <div className={days.length > 1 ? 'sticky left-0 z-1 bg-paper' : 'relative'}>
            {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
              <span className="mono-sm absolute right-1.5 -translate-y-1/2 text-faint" key={hour} style={{ top: hour * hourHeight }}>
                {clockTime(new Date(2000, 0, 1, hour))}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div className="agenda-hours relative isolate border-l border-line" key={day} style={{ backgroundSize: `100% ${hourHeight}px` }}>
              {placed.get(day)!.map(({ column, columns: shared, end, entry, start }) => (
                <AgendaEntryLink
                  className={`agenda-block ${end - start < 45 ? 'truncate' : ''}`}
                  colour={colourOf(entry)}
                  entry={entry}
                  key={`${entry.kind}-${entry.itemId}-${entry.start}`}
                  style={{
                    top: (start / 60) * hourHeight,
                    height: ((end - start) / 60) * hourHeight - 2,
                    left: `calc(${(column / shared) * 100}% + 2px)`,
                    width: `calc(${100 / shared}% - 4px)`,
                  }}
                >
                  <span className={`font-medium ${end - start < 45 ? '' : 'block truncate'}`}>{entry.title}</span>
                  <span className={end - start < 45 ? 'text-muted' : 'sr-only'}> · </span>
                  <span className={`text-muted ${end - start < 45 ? '' : 'block truncate'}`}>
                    {entryTime(entry)}
                    {entry.location ? ` · ${entry.location}` : ''}
                  </span>
                </AgendaEntryLink>
              ))}
              {day === today && <NowLine day={day} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
