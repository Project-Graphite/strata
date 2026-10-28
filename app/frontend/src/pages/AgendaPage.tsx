import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatDay, Placeholder } from '@project-graphite/ui';
import { addDays, dayKey, dayRange, entryClock, entryDay, monthDays, useAgenda, useTodaySchedule, type AgendaEntry } from '../agenda';
import { useAuth } from '../auth';
import { AgendaCard, AgendaEntryLink } from '../components/AgendaEntryLink';
import { Button, IconLink } from '../components/Button';
import { Empty } from '../components/Empty';
import { EventEditor } from '../components/EventEditor';
import { LoadError } from '../components/LoadError';
import { Page, Section, Subheading } from '../components/Page';
import { PeriodNav } from '../components/PeriodNav';
import { AgendaCardsSkeleton, SkeletonLine, TaskRowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { OpenTask } from '../components/OpenTask';
import { DayNumber, TimeGrid } from '../components/TimeGrid';
import { useSpaces } from '../spaces';
import { completeTask, taskDetails, TaskRow, type Task } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

type View = 'list' | 'day' | 'week' | 'month';

const views: Record<View, string> = { list: 'List', day: 'Day', week: 'Week', month: 'Month' };

type ViewLink = (next: { view?: View; date?: string }) => string;

const entryKey = (entry: AgendaEntry) => `${entry.kind}-${entry.itemId}-${entry.start}`;
const emptyToday = { title: 'Nothing today', hint: 'Today’s events, due tasks and renewals show up here.' };
const emptyPeriod = { title: 'Nothing in this period', hint: 'Events, due tasks, renewals and birthdays in these 30 days show up here.' };

function range(view: View, anchor: string) {
  if (view === 'list') return { from: anchor, to: addDays(anchor, 30), days: 30 };
  if (view === 'day') return { from: anchor, to: addDays(anchor, 1), days: 1 };
  const date = new Date(`${anchor}T00:00:00`);
  if (view === 'week') {
    const from = addDays(anchor, -((date.getDay() + 6) % 7));
    return { from, to: addDays(from, 7), days: 7 };
  }
  return monthDays(anchor);
}

function Today() {
  const auth = useAuth();
  const spaces = useSpaces();
  const tasks = useResource<Task[]>('/tasks/today', true);
  const schedule = useTodaySchedule();
  const action = useAction();
  const [opened, setOpened] = useState<Task>();
  const spaceOf = (task: Task) => spaces.data?.find((space) => space.id === task.spaceId);
  const [scheduleRows, dueRows, detailedRows] = useRememberedShape(
    'agenda-today',
    tasks.data && schedule.data && spaces.data && [schedule.data.length, tasks.data.length, tasks.data.filter((task) => taskDetails(task, spaceOf(task)?.name).length > 0).length],
    [2, 2, 2],
  );

  if (tasks.error || schedule.error) return <LoadError error={tasks.error || schedule.error} onRetry={tasks.error ? tasks.reload : schedule.reload} />;
  if (!tasks.data || !schedule.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading today">
        {scheduleRows > 0 && (
          <Section title="Schedule">
            <AgendaCardsSkeleton rows={scheduleRows} />
          </Section>
        )}
        {dueRows > 0 && (
          <Section title="Due">
            <TaskRowsSkeleton detailed={detailedRows} rows={dueRows} />
          </Section>
        )}
        {!scheduleRows && !dueRows && (
          <Empty loading title={emptyToday.title}>
            {emptyToday.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  if (tasks.data.length === 0 && schedule.data.length === 0) return <Empty title={emptyToday.title}>{emptyToday.hint}</Empty>;
  return (
    <>
      {schedule.data.length > 0 && (
        <Section title="Schedule">
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {schedule.data.map((entry) => (
              <li key={entryKey(entry)}>
                <AgendaCard colour={schedule.colourOf(entry)} entry={entry} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {tasks.data.length > 0 && (
        <Section title="Due">
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
        </Section>
      )}
      {opened && <OpenTask onChanged={tasks.reload} onClose={() => setOpened(undefined)} task={opened} />}
    </>
  );
}

function Period({ anchor, link, period: { days, from, to }, today, view }: { anchor: string; link: ViewLink; period: ReturnType<typeof range>; today: string; view: View }) {
  const agenda = useAgenda(from, to);
  const allDays = Array.from({ length: days }, (_, index) => addDays(from, index));
  const byDay = new Map<string, AgendaEntry[]>();
  for (const entry of agenda.data ?? []) {
    const spanned = entry.allDay ? allDays.filter((day) => entry.start <= day && (entry.end ?? entry.start) >= day) : [entryDay(entry)];
    for (const day of spanned) byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const month = new Date(`${anchor}T00:00:00`).getMonth();
  const listShape = useRememberedShape('agenda-list', agenda.data && view === 'list' ? allDays.flatMap((day) => byDay.get(day)?.length ?? []) : undefined, [2, 1, 3]);

  if (agenda.error) return <LoadError error={agenda.error} onRetry={agenda.reload} />;
  if (view === 'list') {
    if (!agenda.data) {
      return (
        <Placeholder className="grid gap-8" label="Loading your agenda">
          {listShape.length > 0 ? (
            listShape.map((rows, group) => (
              <div className="grid gap-2" key={group}>
                <SkeletonLine className="text-sm" width="w-48" />
                <AgendaCardsSkeleton rows={rows} />
              </div>
            ))
          ) : (
            <Empty loading title={emptyPeriod.title}>
              {emptyPeriod.hint}
            </Empty>
          )}
        </Placeholder>
      );
    }
    if (agenda.data.length === 0) return <Empty title={emptyPeriod.title}>{emptyPeriod.hint}</Empty>;
    return allDays
      .filter((day) => byDay.has(day))
      .map((day) => (
        <section className="grid gap-2" key={day}>
          <div className="flex flex-wrap items-baseline gap-3">
            <Subheading level={2}>
              <Link className="text-muted no-underline hover:underline" to={link({ view: 'day', date: day })}>
                {day === today ? 'Today · ' : ''}
                {formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Link>
            </Subheading>
            {day <= today && (
              <Link className="mono-sm text-faint" to="/journal">
                Journal
              </Link>
            )}
          </div>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {byDay.get(day)!.map((entry) => (
              <li key={entryKey(entry)}>
                <AgendaCard colour={agenda.colourOf(entry)} entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ));
  }
  const grid =
    view === 'month' ? (
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-panel border border-line bg-line">
        {allDays.slice(0, 7).map((day) => (
          <p className="m-0 bg-paper px-2 py-1 text-xs text-faint" key={`head-${day}`}>
            {formatDay(day, { weekday: 'short' })}
          </p>
        ))}
        {allDays.map((day) => {
          const entries = byDay.get(day) ?? [];
          return (
            <div className={`relative min-h-24 min-w-0 bg-paper p-1.5 ${new Date(`${day}T00:00:00`).getMonth() !== month ? 'opacity-50' : ''}`} key={day}>
              <Link
                aria-current={day === today ? 'date' : undefined}
                aria-label={formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}
                className="block w-fit text-faint no-underline after:absolute after:inset-0"
                to={link({ view: 'day', date: day })}
              >
                <DayNumber day={day} today={today} />
              </Link>
              <div className="relative mt-1 grid gap-0.5">
                {entries.slice(0, 3).map((entry) => (
                  <AgendaEntryLink className="agenda-chip" colour={agenda.colourOf(entry)} entry={entry} key={entryKey(entry)}>
                    {!entry.allDay && <span className="text-muted max-sm:hidden">{entryClock(entry.start)} </span>}
                    {entry.title}
                  </AgendaEntryLink>
                ))}
                {entries.length > 3 && (
                  <Link className="mono-sm px-1 text-faint" to={link({ view: 'day', date: day })}>
                    +{entries.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <TimeGrid colourOf={agenda.colourOf} dayHref={(day) => link({ view: 'day', date: day })} days={allDays} entries={agenda.data ?? []} today={today} />
    );
  return agenda.data ? grid : <Placeholder label="Loading your agenda">{grid}</Placeholder>;
}

export function AgendaPage({ view }: { view: View | 'today' }) {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const today = dayKey(new Date());
  const anchor = params.get('date') ?? today;
  const [creating, setCreating] = useState(false);
  const period = view === 'today' ? undefined : range(view, anchor);
  const link: ViewLink = (next) => {
    const date = next.date ?? params.get('date');
    return `/agenda/${next.view ?? view}${date ? `?date=${date}` : ''}`;
  };

  return (
    <Page
      actions={
        <>
          <IconLink icon="calendar" label="Calendars" to="/agenda/calendars" />
          <Button disabled={!spaces.data?.some((space) => space.role !== 'viewer')} icon="plus" label="New event" large onClick={() => setCreating(true)} primary />
        </>
      }
      tabs={[
        { active: view === 'today', href: '/agenda', label: 'Today' },
        ...(Object.keys(views) as View[]).map((option) => ({ active: view === option, href: link({ view: option }), label: views[option] })),
      ]}
      title="Agenda"
      toolbar={
        period && (
          <PeriodNav
            current={{ label: 'Today', onSelect: () => navigate(link({ date: today })) }}
            onShift={(direction) => {
              const date = new Date(`${anchor}T00:00:00`);
              navigate(
                link({
                  date:
                    view === 'month'
                      ? dayKey(new Date(date.getFullYear(), date.getMonth() + direction, 1))
                      : addDays(anchor, direction * (view === 'list' ? 30 : view === 'week' ? 7 : 1)),
                }),
              );
            }}
            title={
              view === 'month'
                ? formatDay(anchor, { month: 'long', year: 'numeric' })
                : view === 'day'
                  ? formatDay(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  : dayRange(period.from, addDays(period.to, -1))
            }
            unit={view === 'list' ? 'period' : view}
          />
        )
      }
    >
      {view === 'today' || !period ? <Today /> : <Period anchor={anchor} link={link} period={period} today={today} view={view} />}

      {creating && <EventEditor onClose={() => setCreating(false)} onSaved={(event) => navigate(`/events/${event.id}`)} startsOn={anchor} />}
    </Page>
  );
}
