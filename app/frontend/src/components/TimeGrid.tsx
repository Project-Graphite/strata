import { formatDay, type TagColor } from '@project-graphite/ui';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { entryClock, entryKey, entryTime, type AgendaEntry } from '../agenda';
import { clockTime, daysBetween, profileDay, profileMinutes } from '../time';

const dayMinutes = 24 * 60;
const step = 15;
const minuteMs = 60_000;

export interface Slot {
  day: string;
  start: number;
  end: number;
}

export type Reschedule = { by: number } | { length: number };

interface Placed {
  key: string;
  entry: AgendaEntry;
  start: number;
  end: number;
  column: number;
  columns: number;
  colour: TagColor;
  resizable: boolean;
  movable: boolean;
  style: CSSProperties;
}

interface Ghost {
  index: number;
  start: number;
  end: number;
  colour: TagColor;
  title: string;
}

type Gesture =
  | { kind: 'create'; index: number; anchor: number; x: number; y: number; moved: boolean }
  | { kind: 'move'; item: Placed; element: HTMLElement; index: number; minute: number; x: number; y: number; moved: boolean }
  | { kind: 'resize'; item: Placed; index: number; moved: boolean };

const percent = (minutes: number) => `${(minutes / dayMinutes) * 100}%`;
const snapped = (minutes: number) => Math.round(minutes / step) * step;
const absolute = (first: string, at: string) => daysBetween(first, profileDay(at)) * dayMinutes + profileMinutes(at);

function place(offset: number, spans: { entry: AgendaEntry; start: number; end: number }[], colourOf: (entry: AgendaEntry) => TagColor, canEdit: (entry: AgendaEntry) => boolean) {
  const items = spans
    .map((span) => ({ entry: span.entry, start: span.start - offset, end: span.end - offset }))
    .filter((span) => span.end > 0 && span.start < dayMinutes)
    .map((span) => ({
      ...span,
      whole: span.start >= 0 && span.end <= dayMinutes,
      start: Math.max(0, span.start),
      end: Math.min(dayMinutes, Math.max(span.end, span.start + 20)),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: (Omit<Placed, 'style'> & { style?: CSSProperties })[] = [];
  let cluster: typeof placed = [];
  let columnEnds: number[] = [];
  let clusterEnd = 0;
  const close = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const span of items) {
    if (span.start >= clusterEnd) close();
    const free = columnEnds.findIndex((end) => end <= span.start);
    const column = free === -1 ? columnEnds.length : free;
    columnEnds[column] = span.end;
    const movable = canEdit(span.entry);
    const item = {
      key: entryKey(span.entry),
      entry: span.entry,
      start: span.start,
      end: span.end,
      column,
      columns: 1,
      colour: colourOf(span.entry),
      movable,
      resizable: movable && span.whole,
    };
    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  close();
  return placed.map(
    (item): Placed => ({
      ...item,
      style: {
        top: percent(item.start),
        height: `calc(${percent(item.end - item.start)} - 2px)`,
        left: `calc(${(item.column / item.columns) * 100}% + 2px)`,
        width: `calc(${100 / item.columns}% - 4px)`,
      },
    }),
  );
}

export function DayNumber({ day, today }: { day: string; today: string }) {
  return (
    <span className={`mono-sm grid size-7 place-items-center rounded-full ${day === today ? 'bg-ink font-medium text-paper' : ''}`}>{new Date(`${day}T00:00:00`).getDate()}</span>
  );
}

function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), minuteMs);
    return () => clearInterval(timer);
  }, []);
  return <div aria-hidden="true" className="agenda-now" style={{ top: percent(profileMinutes(now)) }} />;
}

function Block({ item }: { item: Placed }) {
  const short = item.end - item.start < 45;
  return (
    <button className={`agenda-block tag-${item.colour}`} data-entry={item.key} style={item.style} title={item.entry.title} type="button">
      <span className={`min-w-0 ${short ? 'truncate' : ''}`}>
        <span className={`font-medium ${short ? '' : 'block truncate'}`}>{item.entry.title}</span>
        <span className={short ? 'text-muted' : 'sr-only'}> · </span>
        <span className={`text-muted ${short ? '' : 'block truncate'}`}>
          {entryTime(item.entry)}
          {item.entry.location ? ` · ${item.entry.location}` : ''}
        </span>
      </span>
      {item.resizable && <span aria-hidden="true" className="agenda-resize" data-resize="" />}
    </button>
  );
}

const DayColumn = memo(function DayColumn({ day, items, now, weekend }: { day: string; items: Placed[]; now: boolean; weekend: boolean }) {
  return (
    <div className={`agenda-hours relative border-l border-line ${weekend ? 'agenda-weekend' : ''}`} data-day={day}>
      {items.map((item) => (
        <Block item={item} key={item.key} />
      ))}
      {now && <NowLine />}
    </div>
  );
});

function Lane({ columns, days, entries, label, colourOf, timed }: { columns: CSSProperties; days: string[]; entries: Map<string, AgendaEntry[]>; label: string; colourOf: (entry: AgendaEntry) => TagColor; timed: boolean }) {
  return (
    <div className="grid border-b border-line" style={columns}>
      <span className="mono-sm grid content-center px-1 text-faint">{label}</span>
      {days.map((day) => (
        <div className="grid min-w-0 content-start gap-0.5 border-l border-line p-1" key={day}>
          {(entries.get(day) ?? []).map((entry) => (
            <button className={`agenda-chip tag-${colourOf(entry)}`} data-entry={entryKey(entry)} key={entryKey(entry)} title={entry.title} type="button">
              {timed && !entry.allDay && <span className="text-muted">{entryClock(entry.start)} </span>}
              {entry.title}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TimeGrid({
  canEdit,
  colourOf,
  dayHref,
  days,
  entries,
  loaded,
  onCreate,
  onPeek,
  onReschedule,
  scrollOnOpen = true,
  today,
  weekendDays,
}: {
  canEdit: (entry: AgendaEntry) => boolean;
  colourOf: (entry: AgendaEntry) => TagColor;
  dayHref: (day: string) => string;
  days: string[];
  entries: AgendaEntry[];
  loaded: boolean;
  onCreate?: (slot: Slot) => void;
  onPeek: (entry: AgendaEntry, target: HTMLElement) => void;
  onReschedule: (entry: AgendaEntry, change: Reschedule) => void;
  scrollOnOpen?: boolean;
  today: string;
  weekendDays: number[];
}) {
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(undefined);
  const dragged = useRef(false);
  const scrolledTo = useRef('');
  const [ghost, setGhost] = useState<Ghost>();
  const first = days[0]!;
  const spans = useMemo(
    () =>
      entries
        .filter((entry) => !entry.allDay && entry.kind !== 'task')
        .map((entry) => {
          const start = absolute(first, entry.start);
          return { entry, start, end: entry.end ? absolute(first, entry.end) : start + 30 };
        }),
    [entries, first],
  );
  const placed = useMemo(() => days.map((_, index) => place(index * dayMinutes, spans, colourOf, canEdit)), [days, spans, colourOf, canEdit]);
  const lanes = useMemo(() => {
    const allDay = new Map<string, AgendaEntry[]>();
    const due = new Map<string, AgendaEntry[]>();
    for (const entry of entries) {
      if (entry.kind === 'task') {
        const day = entry.allDay ? entry.start : profileDay(entry.start);
        due.set(day, [...(due.get(day) ?? []), entry]);
      } else if (entry.allDay) {
        for (const day of days.filter((shown) => entry.start <= shown && (entry.end ?? entry.start) >= shown)) allDay.set(day, [...(allDay.get(day) ?? []), entry]);
      }
    }
    return { allDay, due };
  }, [days, entries]);
  const byKey = useMemo(() => new Map(entries.map((entry) => [entryKey(entry), entry])), [entries]);
  const columns = useMemo(() => ({ gridTemplateColumns: `var(--agenda-gutter) repeat(${days.length}, minmax(0, 1fr))` }), [days.length]);
  const weekend = useMemo(() => days.map((day) => weekendDays.includes(new Date(`${day}T00:00:00`).getDay())), [days, weekendDays]);
  const focus = days.indexOf(today) === -1 ? 0 : days.indexOf(today);
  const target = placed[focus]![0]?.start ?? 8 * 60;

  useLayoutEffect(() => {
    const period = `${first}/${days.length}`;
    if (!loaded || !scrollOnOpen || scrolledTo.current === period || !body.current || !head.current) return;
    scrolledTo.current = period;
    const sticky = head.current.getBoundingClientRect().height + parseFloat(getComputedStyle(head.current).top);
    const line = body.current.getBoundingClientRect().top + window.scrollY + (Math.max(0, target - 30) / dayMinutes) * body.current.offsetHeight;
    window.scrollTo({ top: Math.max(0, line - sticky) });
  }, [days.length, first, loaded, scrollOnOpen, target]);

  const point = (x: number, y: number, fixed?: number) => {
    const cells = [...body.current!.querySelectorAll<HTMLElement>('[data-day]')];
    const index = fixed ?? Math.max(0, cells.findLastIndex((cell) => cell.getBoundingClientRect().left <= x));
    const rect = cells[index]!.getBoundingClientRect();
    return { index, minute: Math.min(dayMinutes, Math.max(0, ((y - rect.top) / rect.height) * dayMinutes)) };
  };

  const track = (event: PointerEvent<HTMLDivElement>) => {
    const move = (moved: globalThis.PointerEvent) => {
      const current = gesture.current;
      if (!current) return;
      if (current.kind !== 'resize' && !current.moved && Math.hypot(moved.clientX - current.x, moved.clientY - current.y) < 5) return;
      current.moved = true;
      if (current.kind === 'create') {
        const at = snapped(point(moved.clientX, moved.clientY, current.index).minute);
        setGhost({ index: current.index, start: Math.min(current.anchor, at), end: Math.max(current.anchor + step, at), colour: 'blue', title: 'New event' });
      } else if (current.kind === 'resize') {
        const at = snapped(point(moved.clientX, moved.clientY, current.index).minute);
        setGhost({ index: current.index, start: current.item.start, end: Math.max(current.item.start + step, at), colour: current.item.colour, title: current.item.entry.title });
      } else {
        const at = point(moved.clientX, moved.clientY);
        const by = snapped(at.minute - current.minute);
        current.element.dataset.dragging = '';
        setGhost({ index: at.index, start: current.item.start + by, end: current.item.end + by, colour: current.item.colour, title: current.item.entry.title });
      }
    };
    const end = (finished: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const current = gesture.current;
      gesture.current = undefined;
      setGhost(undefined);
      if (!current) return;
      if (current.kind === 'move') delete current.element.dataset.dragging;
      if (finished.type === 'pointercancel' || !current.moved) return;
      dragged.current = true;
      window.setTimeout(() => (dragged.current = false));
      if (current.kind === 'create') {
        const at = snapped(point(finished.clientX, finished.clientY, current.index).minute);
        onCreate?.({ day: days[current.index]!, start: Math.min(current.anchor, at), end: Math.max(current.anchor + step, at) });
      } else if (current.kind === 'resize') {
        const length = Math.max(step, snapped(point(finished.clientX, finished.clientY, current.index).minute) - current.item.start);
        if (length !== current.item.end - current.item.start) onReschedule(current.item.entry, { length });
      } else {
        const at = point(finished.clientX, finished.clientY);
        const by = (at.index - current.index) * dayMinutes + snapped(at.minute - current.minute);
        if (by !== 0) onReschedule(current.item.entry, { by });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const block = target.closest<HTMLElement>('[data-entry]');
    const at = point(event.clientX, event.clientY);
    const item = block ? placed[at.index]!.find((candidate) => candidate.key === block.dataset.entry) : undefined;
    if (item && target.closest('[data-resize]')) {
      gesture.current = { kind: 'resize', item, index: at.index, moved: false };
      track(event);
    } else if (block && item?.movable && event.pointerType === 'mouse') {
      gesture.current = { kind: 'move', item, element: block, index: at.index, minute: at.minute, x: event.clientX, y: event.clientY, moved: false };
      track(event);
    } else if (!block && onCreate && event.pointerType === 'mouse') {
      gesture.current = { kind: 'create', index: at.index, anchor: snapped(at.minute), x: event.clientX, y: event.clientY, moved: false };
      track(event);
    }
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (dragged.current) return;
    const target = event.target as HTMLElement;
    const block = target.closest<HTMLElement>('[data-entry]');
    const entry = block ? byKey.get(block.dataset.entry!) : undefined;
    if (block && entry) onPeek(entry, block);
    else if (!block && onCreate && target.closest('[data-day]')) {
      const at = point(event.clientX, event.clientY);
      const start = Math.min(dayMinutes - 60, Math.floor(at.minute / 30) * 30);
      onCreate({ day: days[at.index]!, start, end: start + 60 });
    }
  };

  return (
    <div className="agenda-grid rounded-panel border border-line" onClick={onClick}>
      <div className="sticky top-(--header-height) z-10 rounded-t-panel bg-paper" ref={head}>
        <div className="grid border-b border-line" style={columns}>
          <span />
          {days.map((day, index) => (
            <Link
              aria-current={day === today ? 'date' : undefined}
              className={`agenda-day-head border-l border-line ${day === today ? 'text-ink' : 'text-faint'} ${weekend[index] ? 'agenda-weekend' : ''}`}
              key={day}
              to={dayHref(day)}
            >
              <span className="text-xs uppercase">{formatDay(day, { weekday: 'short' })}</span>
              <DayNumber day={day} today={today} />
            </Link>
          ))}
        </div>
        {lanes.allDay.size > 0 && <Lane colourOf={colourOf} columns={columns} days={days} entries={lanes.allDay} label="all day" timed={false} />}
        {lanes.due.size > 0 && <Lane colourOf={colourOf} columns={columns} days={days} entries={lanes.due} label="due" timed />}
      </div>
      <div className="agenda-body relative grid select-none" onPointerDown={onPointerDown} ref={body} style={columns}>
        <div className="relative">
          {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
            <span className="mono-sm absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-faint" key={hour} style={{ top: percent(hour * 60) }}>
              {clockTime(new Date(2000, 0, 1, hour))}
            </span>
          ))}
        </div>
        {days.map((day, index) => (
          <DayColumn day={day} items={placed[index]!} key={day} now={day === today} weekend={weekend[index]!} />
        ))}
        {ghost && (
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(var(--agenda-gutter) + (100% - var(--agenda-gutter)) * ${ghost.index / days.length})`, width: `calc((100% - var(--agenda-gutter)) / ${days.length})` }}>
            <div aria-hidden="true" className={`agenda-block agenda-ghost tag-${ghost.colour}`} style={{ top: percent(Math.max(0, ghost.start)), height: `calc(${percent(Math.min(dayMinutes, ghost.end) - Math.max(0, ghost.start))} - 2px)`, left: 2, right: 2 }}>
              <span className="block truncate font-medium">{ghost.title}</span>
              <span className="block truncate text-muted">
                {clockTime(new Date(2000, 0, 1, 0, Math.max(0, ghost.start)))}–{clockTime(new Date(2000, 0, 1, 0, Math.min(dayMinutes, ghost.end)))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
