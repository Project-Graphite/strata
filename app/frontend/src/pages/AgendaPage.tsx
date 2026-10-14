import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, ListSkeleton, Tabs } from '@project-graphite/ui';
import { addDays, clock, dayKey, entryDay, monthDays, useAgenda, type AgendaEntry } from '../agenda';
import { AgendaCard, AgendaEntryLink } from '../components/AgendaEntryLink';
import { EventEditor } from '../components/EventEditor';
import { TimeGrid } from '../components/TimeGrid';
import { useSpaces } from '../spaces';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page } from '../components/Page';

type View = 'list' | 'day' | 'week' | 'month';

const views: Record<View, string> = { list: 'List', day: 'Day', week: 'Week', month: 'Month' };

export const agendaTabs = (active: View | 'today', link: (view: View) => string) => [
  { active: active === 'today', href: '/today', label: 'Today' },
  ...(Object.keys(views) as View[]).map((option) => ({ active: active === option, href: link(option), label: views[option] })),
];

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

export function AgendaPage() {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const view = Object.hasOwn(views, params.get('view') ?? '') ? (params.get('view') as View) : 'list';
  const today = dayKey(new Date());
  const anchor = params.get('date') ?? today;
  const { from, to, days } = range(view, anchor);
  const agenda = useAgenda(from, to);
  const [creating, setCreating] = useState(false);
  const link = (next: { view?: View; date?: string }) => `/agenda?view=${next.view ?? view}&date=${next.date ?? anchor}`;
  const step = view === 'list' ? 30 : view === 'week' ? 7 : 1;
  const shift = (direction: number) => {
    if (view !== 'month') return addDays(anchor, direction * step);
    const date = new Date(`${anchor}T00:00:00`);
    return dayKey(new Date(date.getFullYear(), date.getMonth() + direction, 1));
  };
  const byDay = new Map<string, AgendaEntry[]>();
  for (const entry of agenda.data ?? []) {
    const day = entryDay(entry);
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const allDays = Array.from({ length: days }, (_, index) => addDays(from, index));
  const month = new Date(`${anchor}T00:00:00`).getMonth();
  const entryKey = (entry: AgendaEntry) => `${entry.kind}-${entry.itemId}-${entry.start}`;

  return (
    <Page
      actions={
        <>
          <Link className="secondary-button px-3 py-2 text-sm no-underline" to="/agenda/calendars">
            <Icon name="calendar" size={16} />
            Calendars
          </Link>
          <HeaderButton disabled={!spaces.data?.some((space) => space.role !== 'viewer')} icon="plus" label="New event" onClick={() => setCreating(true)} primary />
        </>
      }
      title="Agenda"
    >
      <Tabs items={agendaTabs(view, (option) => link({ view: option }))} label="Agenda view" />
      <div className="flex flex-wrap items-center gap-2">
        <Link aria-label="Earlier" className="icon-button" title="Earlier" to={link({ date: shift(-1) })}>
          <Icon name="chevron-left" size={18} />
        </Link>
        <Link aria-label="Later" className="icon-button" title="Later" to={link({ date: shift(1) })}>
          <Icon name="chevron-right" size={18} />
        </Link>
        <Link className="secondary-button px-3 py-2 text-sm no-underline" to={link({ date: today })}>
          Today
        </Link>
        <h2 className="m-0 ml-2 text-lg font-medium">
          {view === 'month'
            ? new Date(`${anchor}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : view === 'day'
              ? new Date(`${anchor}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
                  new Date(`${from}T00:00:00`),
                  new Date(`${addDays(to, -1)}T00:00:00`),
                )}
        </h2>
      </div>

      {agenda.error ? (
        <LoadError error={agenda.error} onRetry={agenda.reload} />
      ) : !agenda.data ? (
        <ListSkeleton label="Loading your agenda" rows={6} />
      ) : view === 'list' ? (
        agenda.data.length === 0 ? (
          <p className="m-0 text-muted">Nothing in the next 30 days.</p>
        ) : (
          <div className="grid max-w-3xl gap-5">
            {allDays
              .filter((day) => byDay.has(day))
              .map((day) => (
                <section key={day}>
                  <h2 className="m-0 text-sm font-medium text-muted">
                    <Link className="text-muted no-underline hover:underline" to={link({ view: 'day', date: day })}>
                      {day === today ? 'Today · ' : ''}
                      {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Link>
                    {day <= today && (
                      <Link className="mono-sm ml-3 font-normal text-faint" to={`/journal/${day}`}>
                        Journal
                      </Link>
                    )}
                  </h2>
                  <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
                    {byDay.get(day)!.map((entry) => (
                      <li key={entryKey(entry)}>
                        <AgendaCard colour={agenda.colourOf(entry)} entry={entry} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        )
      ) : view === 'month' ? (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {allDays.slice(0, 7).map((day) => (
            <p className="m-0 bg-paper px-2 py-1 text-xs text-faint" key={`head-${day}`}>
              {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
            </p>
          ))}
          {allDays.map((day) => {
            const entries = byDay.get(day) ?? [];
            const outside = new Date(`${day}T00:00:00`).getMonth() !== month;
            return (
              <div className={`min-h-24 min-w-0 bg-paper p-1.5 ${outside ? 'opacity-50' : ''}`} key={day}>
                <button
                  aria-label={new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={`mono-sm m-0 grid size-6 cursor-pointer place-items-center rounded-full border-0 p-0 ${day === today ? 'bg-ink font-medium text-paper' : 'bg-transparent text-faint'}`}
                  onClick={() => navigate(link({ view: 'day', date: day }))}
                  type="button"
                >
                  {new Date(`${day}T00:00:00`).getDate()}
                </button>
                <div className="mt-1 grid gap-0.5">
                  {entries.slice(0, 3).map((entry) => (
                    <AgendaEntryLink className="agenda-chip" colour={agenda.colourOf(entry)} entry={entry} key={entryKey(entry)}>
                      {!entry.allDay && <span className="text-muted">{clock(entry.start)} </span>}
                      {entry.title}
                    </AgendaEntryLink>
                  ))}
                  {entries.length > 3 && (
                    <Link className="mono-sm px-1 text-xs text-faint" to={link({ view: 'day', date: day })}>
                      +{entries.length - 3} more
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <TimeGrid colourOf={agenda.colourOf} dayHref={(day) => link({ view: 'day', date: day })} days={allDays} entries={agenda.data} today={today} />
      )}

      {creating && (
        <EventEditor
          onClose={() => setCreating(false)}
          onSaved={(event) => {
            agenda.reload();
            navigate(`/events/${event.id}`);
          }}
          startsOn={anchor}
        />
      )}
    </Page>
  );
}
