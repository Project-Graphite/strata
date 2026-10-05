import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, ListSkeleton, PageHeader, Tabs } from '@project-graphite/ui';
import { addDays, dayKey, entryDay, entryLink, entryTime, kindLabels, monthDays, type AgendaEntry } from '../agenda';
import { EventEditor } from '../components/EventEditor';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';
import { LoadError } from '../components/LoadError';

type View = 'list' | 'week' | 'month';

function range(view: View, anchor: string) {
  if (view === 'list') return { from: anchor, to: addDays(anchor, 30), days: 30 };
  const date = new Date(`${anchor}T00:00:00`);
  if (view === 'week') {
    const from = addDays(anchor, -((date.getDay() + 6) % 7));
    return { from, to: addDays(from, 7), days: 7 };
  }
  return monthDays(anchor);
}

function EntryLine({ entry, compact = false }: { entry: AgendaEntry; compact?: boolean }) {
  return (
    <Link
      className={`block truncate text-ink no-underline hover:underline ${compact ? 'text-xs' : 'text-sm'}`}
      title={entry.title}
      to={entryLink(entry)}
    >
      <span className="mono-sm text-faint">{compact ? (entry.allDay ? '' : `${entryTime(entry)} `) : `${entryTime(entry)} · ${kindLabels[entry.kind]} · `}</span>
      {entry.title}
    </Link>
  );
}

export function AgendaPage() {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const view = (['list', 'week', 'month'].includes(params.get('view') ?? '') ? params.get('view') : 'list') as View;
  const today = dayKey(new Date());
  const anchor = params.get('date') ?? today;
  const { from, to, days } = range(view, anchor);
  const agenda = useResource<AgendaEntry[]>(`/agenda?from=${from}&to=${to}`, true);
  const [creating, setCreating] = useState(false);
  const link = (next: { view?: View; date?: string }) => `/agenda?view=${next.view ?? view}&date=${next.date ?? anchor}`;
  const step = view === 'list' ? 30 : view === 'week' ? 7 : 0;
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

  return (
    <section className="page-enter grid gap-6">
      <PageHeader
        actions={
          <button className="primary-button px-3 py-2 text-sm" disabled={!spaces.data?.some((space) => space.role !== 'viewer')} onClick={() => setCreating(true)} type="button">
            <Icon name="plus" size={16} />
            New event
          </button>
        }
        title="Agenda"
      />
      <Tabs
        items={(['list', 'week', 'month'] as const).map((option) => ({
          active: view === option,
          href: link({ view: option }),
          label: option === 'list' ? 'List' : option === 'week' ? 'Week' : 'Month',
        }))}
        label="Agenda view"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link className="secondary-button px-3 py-2 text-sm no-underline" to={link({ date: shift(-1) })}>
          ← Earlier
        </Link>
        <Link className="secondary-button px-3 py-2 text-sm no-underline" to={link({ date: today })}>
          Today
        </Link>
        <Link className="secondary-button px-3 py-2 text-sm no-underline" to={link({ date: shift(1) })}>
          Later →
        </Link>
        <span className="mono-sm text-faint">
          {view === 'month'
            ? new Date(`${anchor}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : `${new Date(`${from}T00:00:00`).toLocaleDateString()} – ${new Date(`${addDays(to, -1)}T00:00:00`).toLocaleDateString()}`}
        </span>
      </div>

      {agenda.error ? (
        <LoadError error={agenda.error} onRetry={agenda.reload} />
      ) : !agenda.data ? (
        <ListSkeleton label="Loading your agenda" rows={6} />
      ) : view === 'list' ? (
        agenda.data.length === 0 ? (
          <p className="m-0 text-muted">Nothing in the next 30 days. Events, due tasks and renewals appear here.</p>
        ) : (
          <div className="grid max-w-3xl gap-5">
            {allDays
              .filter((day) => byDay.has(day))
              .map((day) => (
                <section key={day}>
                  <h2 className="m-0 text-sm font-medium text-muted">
                    {day === today ? 'Today · ' : ''}
                    {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h2>
                  <div className="mt-2 grid gap-1 border-l border-line pl-3">
                    {byDay.get(day)!.map((entry) => (
                      <EntryLine entry={entry} key={`${entry.kind}-${entry.itemId}-${entry.start}`} />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )
      ) : (
        <div className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line ${view === 'week' ? 'grid-cols-1 sm:grid-cols-7' : 'grid-cols-7'}`}>
          {view === 'month' &&
            allDays.slice(0, 7).map((day) => (
              <p className="m-0 bg-paper px-2 py-1 text-xs text-faint" key={`head-${day}`}>
                {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
            ))}
          {allDays.map((day) => {
            const entries = byDay.get(day) ?? [];
            const outside = view === 'month' && new Date(`${day}T00:00:00`).getMonth() !== month;
            return (
              <div
                className={`min-h-24 bg-paper p-2 ${outside ? 'opacity-50' : ''} ${view === 'week' ? 'sm:min-h-64' : ''}`}
                key={day}
              >
                <button
                  className={`mono-sm m-0 cursor-pointer border-0 bg-transparent p-0 ${day === today ? 'font-medium text-ink' : 'text-faint'}`}
                  onClick={() => navigate(link({ view: 'list', date: day }))}
                  type="button"
                >
                  {view === 'week'
                    ? new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
                    : new Date(`${day}T00:00:00`).getDate()}
                </button>
                <div className="mt-1 grid gap-0.5">
                  {entries.slice(0, view === 'month' ? 3 : 12).map((entry) => (
                    <EntryLine compact entry={entry} key={`${entry.kind}-${entry.itemId}-${entry.start}`} />
                  ))}
                  {view === 'month' && entries.length > 3 && <span className="mono-sm text-faint">+{entries.length - 3} more</span>}
                </div>
              </div>
            );
          })}
        </div>
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
    </section>
  );
}
