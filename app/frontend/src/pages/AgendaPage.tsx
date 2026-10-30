import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ConfirmDialog, formatDay, ListRow, Placeholder, useSnackbar, type TagColor } from '@project-graphite/ui';
import { addDays, agendaPeriod, dayKey, entryClock, entryDay, entryKey, entryLink, phoneQuery, useAgenda, type AgendaEntry, type AgendaView as View, type EventDetails } from '../agenda';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { AgendaEntryLink, AgendaRow, CalendarEventDialog, EntryPeek } from '../components/AgendaEntryLink';
import { Button, ButtonLink } from '../components/Button';
import { Empty } from '../components/Empty';
import { EventSheet } from '../components/EventDetails';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section, Subheading } from '../components/Page';
import { PeriodNav } from '../components/PeriodNav';
import { AgendaRowsSkeleton, SkeletonLine, TaskRowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { OpenTask } from '../components/OpenTask';
import { DayNumber, TimeGrid, type Reschedule, type Slot } from '../components/TimeGrid';
import { useSpaces } from '../spaces';
import { completeTask, taskDetails, TaskRow, type Task } from '../tasks';
import { capitalised, clockTime, formatDate, formatRange, profileDay, profileMinutes } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import type { Me } from './settings/SettingsLayout';

const EventEditor = lazy(() => import('../components/EventEditor').then((module) => ({ default: module.EventEditor })));

const views: Record<View, string> = { day: 'Day', week: 'Week', month: 'Month', list: 'List' };
const viewKey = 'strata-agenda-view';
const freeFrom = 8 * 60;
const freeUntil = 22 * 60;

type ViewLink = (next: { view?: View; date?: string }) => string;
type Draft = { startsOn: string; startTime?: string; endTime?: string };

const emptyPeriod = { title: 'Nothing in these 30 days', hint: 'Events, due tasks, renewals and birthdays in these 30 days show up here.' };

function rememberedView(): View {
  try {
    const stored = localStorage.getItem(viewKey);
    return stored && stored in views ? (stored as View) : 'list';
  } catch {
    return 'list';
  }
}

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(phoneQuery);
    const update = () => setPhone(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}

const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const wall = (day: string, time: string) => Date.parse(`${day}T${time}Z`);
const fromWall = (at: number) => ({ day: new Date(at).toISOString().slice(0, 10), time: new Date(at).toISOString().slice(11, 16) });
const lengthLabel = (minutes: number) => [Math.floor(minutes / 60) && `${Math.floor(minutes / 60)} h`, minutes % 60 && `${minutes % 60} min`].filter(Boolean).join(' ');

function rescheduled(event: EventDetails, change: Reschedule) {
  const start = wall(event.startsOn, event.startTime!);
  if ('length' in change) {
    const end = fromWall(start + change.length * 60_000);
    return { endsOn: end.day, endTime: end.time };
  }
  const next = fromWall(start + change.by * 60_000);
  const end = fromWall(wall(event.endsOn, event.endTime ?? event.startTime!) + change.by * 60_000);
  return { startsOn: next.day, startTime: next.time, endsOn: end.day, endTime: event.endTime ? end.time : null };
}

function shifted(entry: AgendaEntry, change: Reschedule): AgendaEntry {
  const start = Date.parse(entry.start) + ('by' in change ? change.by * 60_000 : 0);
  const end = 'by' in change ? entry.end && Date.parse(entry.end) + change.by * 60_000 : start + change.length * 60_000;
  return { ...entry, start: new Date(start).toISOString(), end: end ? new Date(end).toISOString() : null };
}

function EditEvent({ id, onClose }: { id: string; onClose: () => void }) {
  const event = useResource<EventDetails>(`/events/${id}`, true);
  const show = useSnackbar();
  const { error } = event;
  useEffect(() => {
    if (!error) return;
    show({ message: error, tone: 'error' });
    onClose();
  }, [error, onClose, show]);
  return event.data ? (
    <Suspense fallback={null}>
      <EventEditor event={event.data} onClose={onClose} onSaved={(saved) => event.mutate(() => saved)} />
    </Suspense>
  ) : null;
}

function DueToday() {
  const auth = useAuth();
  const spaces = useSpaces();
  const tasks = useResource<Task[]>('/tasks/today', true);
  const action = useAction();
  const [opened, setOpened] = useState<Task>();
  const spaceOf = (task: Task) => spaces.data?.find((space) => space.id === task.spaceId);
  const [dueRows, detailedRows] = useRememberedShape('agenda-due', tasks.data && spaces.data && [tasks.data.length, tasks.data.filter((task) => taskDetails(task, spaceOf(task)?.name).length > 0).length], [2, 2]);

  if (tasks.error) return <LoadError compact error={tasks.error} onRetry={tasks.reload} />;
  if (!tasks.data) return <Placeholder label="Loading due tasks">{dueRows > 0 ? <TaskRowsSkeleton detailed={detailedRows} rows={dueRows} /> : <Empty level={3} loading title="Nothing due" />}</Placeholder>;
  if (tasks.data.length === 0) return <Empty level={3} title="Nothing due" />;
  return (
    <>
      <ul className="panel-rows">
        {tasks.data.map((task) => (
          <TaskRow
            disabled={spaceOf(task)?.role === 'viewer' || action.busy}
            key={task.id}
            onEdit={() => setOpened(task)}
            onToggle={() =>
              void action.run(
                () => completeTask(auth.request, task, (completed) => (completed ? tasks.mutate((current) => current.filter((shown) => shown.id !== task.id)) : tasks.reload())),
                'Could not update the task',
              )
            }
            task={task}
            where={spaceOf(task)?.name}
          />
        ))}
      </ul>
      {opened && <OpenTask onChanged={tasks.reload} onClose={() => setOpened(undefined)} task={opened} />}
    </>
  );
}

function freeTime(day: string, today: string, entries: AgendaEntry[]) {
  const busy = entries
    .filter((entry) => !entry.allDay && entry.kind !== 'task')
    .map((entry) => {
      const start = profileDay(entry.start) < day ? 0 : profileMinutes(entry.start);
      const end = !entry.end ? start + 30 : profileDay(entry.end) > day ? 24 * 60 : profileMinutes(entry.end);
      return [start, end] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = day === today ? Math.max(freeFrom, Math.ceil(profileMinutes(new Date()) / 15) * 15) : freeFrom;
  for (const [start, end] of [...busy, [freeUntil, freeUntil] as const]) {
    if (Math.min(start, freeUntil) - cursor >= 30) gaps.push([cursor, Math.min(start, freeUntil)]);
    cursor = Math.max(cursor, end);
  }
  return gaps;
}

function DayAside({ colourOf, day, entries, onOpen, today }: { colourOf: (entry: AgendaEntry) => TagColor; day: string; entries: AgendaEntry[]; onOpen: (entry: AgendaEntry, target: HTMLElement) => void; today: string }) {
  const now = new Date().toISOString();
  const next = entries.find((entry) => !entry.allDay && entry.kind !== 'task' && (entry.end ?? entry.start) > now);
  const due = entries.filter((entry) => entry.kind === 'task');
  const gaps = freeTime(day, today, entries);

  return (
    <aside className="grid content-start gap-8 md:sticky md:top-[calc(var(--header-height)+1rem)]">
      {day === today && (
        <Section title="Next up">
          {next ? (
            <ul className="panel-rows">
              <AgendaRow colour={colourOf(next)} entry={next} onOpen={(target) => onOpen(next, target)} />
            </ul>
          ) : (
            <Empty level={3} title="Nothing else today" />
          )}
        </Section>
      )}
      <Section title="Due">
        {day === today ? (
          <DueToday />
        ) : due.length > 0 ? (
          <ul className="panel-rows">
            {due.map((entry) => (
              <AgendaRow colour={colourOf(entry)} entry={entry} key={entryKey(entry)} />
            ))}
          </ul>
        ) : (
          <Empty level={3} title="Nothing due" />
        )}
      </Section>
      <Section title="Free time">
        {gaps.length > 0 ? (
          <ul className="panel-rows">
            {gaps.map(([start, end]) => (
              <ListRow
                key={start}
                title={<span className="tabular-nums">{`${clockTime(clockOf(start))}–${clockTime(clockOf(end))}`}</span>}
                trail={<span className="tabular-nums">{lengthLabel(end - start)}</span>}
              />
            ))}
          </ul>
        ) : (
          <Hint>No free half hour between {clockTime(clockOf(freeFrom))} and {clockTime(clockOf(freeUntil))}.</Hint>
        )}
      </Section>
    </aside>
  );
}

function Period({
  anchor,
  link,
  onCreate,
  openEvent,
  period: { days, from, to },
  phone,
  today,
  view,
  weekendDays,
}: {
  anchor: string;
  link: ViewLink;
  onCreate?: (draft: Draft) => void;
  openEvent: (id: string) => void;
  period: ReturnType<typeof agendaPeriod>;
  phone: boolean;
  today: string;
  view: View;
  weekendDays: number[];
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const agenda = useAgenda(from, to);
  const action = useAction();
  const [peek, setPeek] = useState<{ entry: AgendaEntry; anchor: HTMLElement }>();
  const [calendarEntry, setCalendarEntry] = useState<AgendaEntry>();
  const [editing, setEditing] = useState<string>();
  const [confirming, setConfirming] = useState<{ event: EventDetails; changes: ReturnType<typeof rescheduled> }>();
  const [picked, setPicked] = useState(anchor.slice(0, 7) === today.slice(0, 7) ? today : '');
  const allDays = Array.from({ length: days }, (_, index) => addDays(from, index));
  const byDay = new Map<string, AgendaEntry[]>();
  for (const entry of agenda.data ?? []) {
    const spanned = entry.allDay ? allDays.filter((day) => entry.start <= day && (entry.end ?? entry.start) >= day) : [entryDay(entry)];
    for (const day of spanned) byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const month = new Date(`${anchor}T00:00:00`).getMonth();
  const listShape = useRememberedShape('agenda-list', agenda.data && view === 'list' ? allDays.flatMap((day) => byDay.get(day)?.length ?? []) : undefined, [2, 1, 3]);
  const canEdit = useCallback(
    (entry: AgendaEntry) => {
      const role = spaces.data?.find((space) => space.id === entry.spaceId)?.role;
      return entry.kind === 'event' && role !== undefined && role !== 'viewer';
    },
    [spaces.data],
  );
  const closePeek = useCallback(() => setPeek(undefined), []);
  const onPeek = (entry: AgendaEntry, target: HTMLElement) => setPeek({ entry, anchor: target });
  const open = (entry: AgendaEntry) => {
    setPeek(undefined);
    if (entry.kind === 'event') openEvent(entry.itemId);
    else if (entry.kind === 'external') setCalendarEntry(entry);
    else navigate(entryLink(entry));
  };
  const openCard = (entry: AgendaEntry) => (entry.kind === 'event' || entry.kind === 'external' ? () => open(entry) : undefined);
  const emptyAction = anchor !== today && <ButtonLink label="Today" to={link({ date: today })} />;

  async function save(event: EventDetails, changes: ReturnType<typeof rescheduled>) {
    await auth.request(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    return {
      message: `Moved ${event.title}.`,
      undo: async () => {
        await auth.request(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ startsOn: event.startsOn, startTime: event.startTime, endsOn: event.endsOn, endTime: event.endTime }) });
        return '';
      },
    };
  }

  const onReschedule = (entry: AgendaEntry, change: Reschedule) => {
    agenda.mutate((entries) => entries.map((shown) => (entryKey(shown) === entryKey(entry) ? shifted(shown, change) : shown)));
    void action.run(async () => {
      try {
        const event = await auth.request<EventDetails>(`/events/${entry.itemId}`);
        const changes = rescheduled(event, change);
        if (!event.repeatRule) return await save(event, changes);
        if (changes.startsOn && changes.startsOn !== event.startsOn) throw new Error(`${event.title} repeats. Move it to another day from its editor.`);
        setConfirming({ event, changes });
        return '';
      } catch (reason) {
        agenda.reload();
        throw reason;
      }
    }, 'Could not move the event');
  };

  const grid = (shown: string[], entries: AgendaEntry[]) => (
    <TimeGrid
      canEdit={canEdit}
      colourOf={agenda.colourOf}
      dayHref={(day) => link({ view: 'day', date: day })}
      days={shown}
      entries={entries}
      loaded={Boolean(agenda.data)}
      onCreate={onCreate && ((slot: Slot) => onCreate({ startsOn: slot.day, startTime: clockOf(slot.start), endTime: clockOf(Math.min(slot.end, 24 * 60 - 1)) }))}
      onPeek={onPeek}
      onReschedule={onReschedule}
      scrollOnOpen={!(phone && view === 'day')}
      today={today}
      weekendDays={weekendDays}
    />
  );

  const overlays = (
    <>
      {peek && (
        <EntryPeek
          anchor={peek.anchor}
          entry={peek.entry}
          onClose={closePeek}
          onEdit={
            canEdit(peek.entry)
              ? () => {
                  setEditing(peek.entry.itemId);
                  setPeek(undefined);
                }
              : undefined
          }
          onOpen={() => open(peek.entry)}
        />
      )}
      {calendarEntry && <CalendarEventDialog entry={calendarEntry} onClose={() => setCalendarEntry(undefined)} />}
      {editing && <EditEvent id={editing} onClose={() => setEditing(undefined)} />}
      {confirming && (
        <ConfirmDialog
          busyLabel="Moving…"
          confirmLabel="Change every occurrence"
          errorFallback="Could not move the event"
          onClose={() => {
            setConfirming(undefined);
            agenda.reload();
          }}
          onConfirm={async () => action.report(await save(confirming.event, confirming.changes))}
          title={`Change every occurrence of ${confirming.event.title}?`}
        >
          {confirming.event.title} repeats, so the new time applies to the whole series.
        </ConfirmDialog>
      )}
    </>
  );

  if (agenda.error) return <LoadError error={agenda.error} onRetry={agenda.reload} />;
  if (view === 'list') {
    if (!agenda.data) {
      return (
        <Placeholder className="grid gap-8" label="Loading your agenda">
          {listShape.length > 0 ? (
            listShape.map((rows, group) => (
              <div className="grid gap-3" key={group}>
                <SkeletonLine className="text-h3" width="w-48" />
                <AgendaRowsSkeleton rows={rows} />
              </div>
            ))
          ) : (
            <Empty action={emptyAction} loading title={emptyPeriod.title} variant="filtered">
              {emptyPeriod.hint}
            </Empty>
          )}
        </Placeholder>
      );
    }
    if (agenda.data.length === 0) {
      return (
        <Empty action={emptyAction} title={emptyPeriod.title} variant="filtered">
          {emptyPeriod.hint}
        </Empty>
      );
    }
    return (
      <>
        {allDays
          .filter((day) => byDay.has(day))
          .map((day) => (
            <section className="grid gap-3" key={day}>
              <div className="flex flex-wrap items-baseline gap-3">
                <Subheading level={2}>
                  <Link className="text-ink no-underline hover:underline" to={link({ view: 'day', date: day })}>
                    {capitalised(formatDate(day))}
                  </Link>
                </Subheading>
                {day <= today && (
                  <Link className="text-small text-muted" to="/journal">
                    Journal
                  </Link>
                )}
              </div>
              <ul className="panel-rows">
                {byDay.get(day)!.map((entry) => (
                  <AgendaRow colour={agenda.colourOf(entry)} entry={entry} key={entryKey(entry)} onOpen={openCard(entry)} />
                ))}
              </ul>
            </section>
          ))}
        {overlays}
      </>
    );
  }
  if (view === 'day') {
    const entries = byDay.get(anchor) ?? [];
    return (
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 max-md:order-last">
          {agenda.data ? grid(allDays, entries.filter((entry) => entry.kind !== 'task')) : <Placeholder label="Loading the day">{grid(allDays, [])}</Placeholder>}
        </div>
        {agenda.data ? (
          <DayAside colourOf={agenda.colourOf} day={anchor} entries={entries} onOpen={onPeek} today={today} />
        ) : (
          <Placeholder className="grid content-start gap-8" label="Loading the day">
            <AgendaRowsSkeleton rows={1} />
            <AgendaRowsSkeleton rows={2} />
          </Placeholder>
        )}
        {overlays}
      </div>
    );
  }
  const weekend = (day: string) => weekendDays.includes(new Date(`${day}T00:00:00`).getDay());
  const pickedEntries = byDay.get(picked) ?? [];
  const body =
    view === 'month' ? (
      <>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-panel border border-line bg-line">
          {allDays.slice(0, 7).map((day) => (
            <p className={`m-0 px-2 py-1 text-small text-muted ${weekend(day) ? 'agenda-weekend' : 'bg-paper'}`} key={`head-${day}`}>
              {formatDay(day, { weekday: 'short' })}
            </p>
          ))}
          {allDays.map((day) => {
            const entries = byDay.get(day) ?? [];
            const outside = new Date(`${day}T00:00:00`).getMonth() !== month;
            const label = `${formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}${entries.length ? `, ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : ''}`;
            return phone ? (
              <button
                aria-label={label}
                aria-pressed={day === picked}
                className={`grid min-h-14 min-w-0 content-start justify-items-center gap-1 p-1 ${outside ? 'text-muted' : 'text-ink'} ${weekend(day) ? 'agenda-weekend' : 'bg-paper'} ${day === picked ? 'outline-2 -outline-offset-2 outline-ink' : ''}`}
                key={day}
                onClick={() => setPicked(day)}
                type="button"
              >
                <DayNumber day={day} today={today} />
                <span aria-hidden="true" className="flex max-w-full flex-wrap justify-center gap-0.5">
                  {entries.slice(0, 4).map((entry) => (
                    <span className={`tag-dot tag-${agenda.colourOf(entry)}`} key={entryKey(entry)} />
                  ))}
                </span>
              </button>
            ) : (
              <div className={`relative min-h-24 min-w-0 p-1.5 ${weekend(day) ? 'agenda-weekend' : 'bg-paper'}`} key={day}>
                <Link aria-current={day === today ? 'date' : undefined} aria-label={label} className={`block w-fit no-underline after:absolute after:inset-0 ${outside ? 'text-muted' : 'text-ink'}`} to={link({ view: 'day', date: day })}>
                  <DayNumber day={day} today={today} />
                </Link>
                <div className="relative mt-1 grid gap-0.5">
                  {entries.slice(0, 3).map((entry) => (
                    <AgendaEntryLink className="agenda-chip" colour={agenda.colourOf(entry)} entry={entry} key={entryKey(entry)} onOpen={(target) => onPeek(entry, target)}>
                      {!entry.allDay && <span className="text-ink/80">{entryClock(entry.start)} </span>}
                      {entry.title}
                    </AgendaEntryLink>
                  ))}
                  {entries.length > 3 && (
                    <Link className="px-1 text-micro text-muted" to={link({ view: 'day', date: day })}>
                      +{entries.length - 3} more
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {phone && picked && agenda.data && (
          <Section action={<ButtonLink label="Open day" to={link({ view: 'day', date: picked })} />} title={capitalised(formatDate(picked))}>
            {pickedEntries.length > 0 ? (
              <ul className="panel-rows">
                {pickedEntries.map((entry) => (
                  <AgendaRow colour={agenda.colourOf(entry)} entry={entry} key={entryKey(entry)} onOpen={openCard(entry)} />
                ))}
              </ul>
            ) : (
              <Empty level={3} title="Nothing on this day" />
            )}
          </Section>
        )}
      </>
    ) : (
      grid(allDays, agenda.data ?? [])
    );
  return (
    <>
      {agenda.data ? body : <Placeholder label="Loading your agenda">{body}</Placeholder>}
      {overlays}
    </>
  );
}

function Agenda({ view }: { view: View }) {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const me = useResource<Pick<Me, 'weekStart' | 'weekendDays'>>('/me', true);
  const phone = usePhone();
  const [params] = useSearchParams();
  const today = profileDay();
  const anchor = params.get('date') ?? today;
  const [creating, setCreating] = useState<Draft>();
  const [sheet, setSheet] = useState<string>();
  const period = agendaPeriod(view, anchor, me.data?.weekStart ?? 0);
  const canCreate = Boolean(spaces.data?.some((space) => space.role !== 'viewer'));
  const link: ViewLink = (next) => {
    const date = next.date ?? params.get('date');
    return `/agenda/${next.view ?? view}${date ? `?date=${date}` : ''}`;
  };
  const shift = (direction: number) => {
    const date = new Date(`${anchor}T00:00:00`);
    navigate(
      link({
        date: view === 'month' ? dayKey(new Date(date.getFullYear(), date.getMonth() + direction, 1)) : addDays(anchor, direction * (view === 'list' ? 30 : period.days)),
      }),
    );
  };
  const goToday = () => navigate(link({ date: today }));

  useEffect(() => {
    try {
      localStorage.setItem(viewKey, view);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
  }, [view]);

  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="tablist"], [role="listbox"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') shift(event.key === 'ArrowLeft' ? -1 : 1);
      else if (event.key === 't' || event.key === 'T') goToday();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  });

  const gated = !me.data && (view === 'week' || view === 'month');

  return (
    <Page
      actions={
        <>
          <ActionsMenu items={[{ label: 'Calendars', href: '/agenda/calendars' }]} name="Agenda" />
          <Button disabled={!canCreate} icon="plus" label="New event" large onClick={() => setCreating({ startsOn: anchor })} primary />
        </>
      }
      tabs={(Object.keys(views) as View[]).map((option) => ({ active: view === option, href: link({ view: option }), label: views[option] }))}
      title="Agenda"
      toolbar={
        <PeriodNav
          current={{ label: 'Today', onSelect: goToday }}
          onShift={shift}
          title={
            view === 'month'
              ? formatDay(anchor, { month: 'long', year: 'numeric' })
              : view === 'day'
                ? formatDay(anchor, { weekday: 'long', day: 'numeric', month: 'long' })
                : formatRange(period.from, addDays(period.to, -1))
          }
          unit={view === 'list' ? 'period' : view}
        />
      }
    >
      {me.error && gated ? (
        <LoadError error={me.error} onRetry={me.reload} />
      ) : gated ? (
        <Placeholder label="Loading your agenda">
          <div className="h-96 rounded-panel border border-line" />
        </Placeholder>
      ) : (
        <Period
          anchor={anchor}
          key={`${period.from}/${period.days}`}
          link={link}
          onCreate={canCreate ? setCreating : undefined}
          openEvent={setSheet}
          period={period}
          phone={phone}
          today={today}
          view={view}
          weekendDays={me.data?.weekendDays ?? []}
        />
      )}

      {creating && (
        <Suspense fallback={null}>
          <EventEditor endTime={creating.endTime} onClose={() => setCreating(undefined)} onSaved={(event) => setSheet(event.id)} startTime={creating.startTime} startsOn={creating.startsOn} />
        </Suspense>
      )}
      {sheet && <EventSheet id={sheet} key={sheet} onClose={() => setSheet(undefined)} onOpen={setSheet} />}
    </Page>
  );
}

export function AgendaPage({ view }: { view?: View }) {
  const { search } = useLocation();
  if (view) return <Agenda view={view} />;
  const remembered = rememberedView();
  return (
    <>
      <Navigate replace to={`/agenda/${remembered}${search}`} />
      <Agenda view={remembered} />
    </>
  );
}
