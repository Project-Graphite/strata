import { Component, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ConfirmDialog, Icon, PageHeader, PageSkeleton, Tabs, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { FormDialog } from '../components/FormDialog';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { widgetKinds, type Widget, type WidgetSize, type WidgetType } from './widgets';
import { LoadError } from '../components/LoadError';

type Device = 'any' | 'phone' | 'desktop';

interface Dashboard {
  id: string;
  name: string;
  position: number;
  layout: { widgets: Widget[] };
  showFrom: number | null;
  showUntil: number | null;
  showOn: Device;
}

const chosenKey = 'strata-dashboard';

function rememberedDashboard() {
  try {
    return sessionStorage.getItem(chosenKey);
  } catch {
    return null;
  }
}

function rememberDashboard(id: string) {
  try {
    sessionStorage.setItem(chosenKey, id);
  } catch {
    return;
  }
}

export function automaticDashboard<T extends Pick<Dashboard, 'showFrom' | 'showUntil' | 'showOn'>>(dashboards: T[], now: Date, phone: boolean) {
  const minute = now.getHours() * 60 + now.getMinutes();
  const fits = dashboards.filter(
    ({ showFrom, showUntil, showOn }) =>
      (showFrom === null || showUntil === null || (showFrom < showUntil ? minute >= showFrom && minute < showUntil : minute >= showFrom || minute < showUntil)) &&
      (showOn === 'any' || showOn === (phone ? 'phone' : 'desktop')),
  );
  return fits.find((dashboard) => dashboard.showFrom !== null || dashboard.showOn !== 'any') ?? fits[0] ?? dashboards[0];
}

const clockTime = (minutes: number | null) => (minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
const minutesOf = (time: string) => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null);

const templates = [
  ['morning', 'Morning briefing', 'Clock, Today, Agenda, Renewals and spend, Inbox'],
  ['work', 'Work day', 'Today, Task list, Shortcuts, Clock'],
  ['student', 'Student', 'Today, Task list, Shortcuts'],
  ['travel', 'Travel', 'World clocks, Today, Shortcuts'],
  ['', 'Empty', 'Add widgets yourself'],
] as const;

const spans: Record<WidgetSize, string> = {
  small: 'lg:col-span-1',
  medium: 'lg:col-span-2',
  wide: 'lg:col-span-3',
  full: 'lg:col-span-4',
};

class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p className="m-0 text-sm text-muted">This widget stopped working. Reload the page to try again.</p> : this.props.children;
  }
}

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

const wallRefreshMs = 5 * 60_000;

function WallDisplay({ dashboard }: { dashboard: Dashboard }) {
  const navigate = useNavigate();
  const [round, setRound] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [mayDim, setMayDim] = useState(false);

  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const keepAwake = () => {
      if (document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator)) {
        setMayDim(true);
        return;
      }
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          lock = sentinel;
          setMayDim(false);
        },
        () => setMayDim(true),
      );
    };
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate(`/?d=${dashboard.id}`);
    };
    const refresh = setInterval(() => setRound((current) => current + 1), wallRefreshMs);
    const tick = setInterval(() => setNow(new Date()), 15_000);
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    window.addEventListener('keydown', leave);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', keepAwake);
      window.removeEventListener('keydown', leave);
      void lock?.release();
    };
  }, [dashboard.id, navigate]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-sm text-muted">{dashboard.name}</p>
          <p className="m-0 text-5xl text-ink">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="mono-sm m-0 mt-1 text-faint">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link className="secondary-button px-3 py-2 text-sm no-underline" to={`/?d=${dashboard.id}`}>
          Exit
        </Link>
      </header>
      {mayDim && <p className="mono-sm mt-4 mb-0 text-faint">This browser may still let the screen turn itself off.</p>}
      <div className="mt-8 grid grid-cols-1 gap-6 text-lg lg:grid-cols-4" key={round}>
        {dashboard.layout.widgets.map((widget) => {
          const kind = widgetKinds[widget.type];
          return (
            <article aria-label={kind.title} className={`grid content-start gap-3 rounded-xl border border-line bg-surface p-6 ${spans[widget.size]}`} key={widget.id}>
              <h2 className="m-0 text-sm font-medium text-muted">{kind.title}</h2>
              <WidgetBoundary>
                <kind.View settings={widget.settings} />
              </WidgetBoundary>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardHome() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dashboards = useResource<Dashboard[]>('/me/dashboards', true);
  const saving = useAction();
  const [draft, setDraft] = useState<Widget[]>();
  const [history, setHistory] = useState<Widget[][]>([]);
  const [settingsOpen, setSettingsOpen] = useState<string>();
  const [dragging, setDragging] = useState<number>();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [schedule, setSchedule] = useState({ from: '', until: '', on: 'any' as Device });
  const addForm = useFormErrors();
  const chosen = params.get('d');

  useEffect(() => {
    if (chosen) rememberDashboard(chosen);
  }, [chosen]);

  if (dashboards.error) return <LoadError error={dashboards.error} onRetry={dashboards.reload} />;
  if (!dashboards.data) return <PageSkeleton label="Loading your dashboard" />;
  const picked = chosen ?? rememberedDashboard();
  const current =
    dashboards.data.find((dashboard) => dashboard.id === picked) ??
    automaticDashboard(dashboards.data, new Date(), window.matchMedia('(max-width: 767px)').matches)!;
  const widgets = draft ?? current.layout.widgets;
  const editing = draft !== undefined;
  if (params.get('display') === 'wall' && !editing) return <WallDisplay dashboard={current} />;

  function change(next: Widget[]) {
    setHistory((past) => [...past, widgets]);
    setDraft(next);
  }

  function finish(save: boolean) {
    if (!save) {
      setDraft(undefined);
      setHistory([]);
      setSettingsOpen(undefined);
      return;
    }
    void saving
      .run(async () => {
        if (Boolean(schedule.from) !== Boolean(schedule.until)) throw new Error('Set both times, or neither.');
        const showFrom = minutesOf(schedule.from);
        const showUntil = minutesOf(schedule.until);
        const saved = await auth.request<Dashboard>(`/me/dashboards/${current.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            layout: { widgets },
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(showFrom !== current.showFrom || showUntil !== current.showUntil ? { showFrom, showUntil } : {}),
            ...(schedule.on !== current.showOn ? { showOn: schedule.on } : {}),
          }),
        });
        dashboards.mutate((all) => all.map((dashboard) => (dashboard.id === saved.id ? saved : dashboard)));
        return '';
      }, 'Could not save the dashboard')
      .then((done) => done && finish(false));
  }

  return (
    <section className="page-enter">
      <PageHeader
        actions={
          editing ? (
            <>
              <button
                className="secondary-button px-3 py-2 text-sm"
                disabled={history.length === 0}
                onClick={() => {
                  setDraft(history.at(-1));
                  setHistory((past) => past.slice(0, -1));
                }}
                type="button"
              >
                Undo
              </button>
              <button className="secondary-button px-3 py-2 text-sm" onClick={() => finish(false)} type="button">
                Cancel
              </button>
              <button className="primary-button px-3 py-2 text-sm" disabled={saving.busy} onClick={() => finish(true)} type="button">
                {saving.busy ? 'Saving…' : 'Done'}
              </button>
            </>
          ) : (
            <>
              <button aria-label="New dashboard" className="icon-button" onClick={() => setAdding(true)} title="New dashboard" type="button">
                <Icon name="plus" />
              </button>
              <Link aria-label="Wall display" className="icon-button" title="Wall display" to={`/?d=${current.id}&display=wall`}>
                <Icon name="monitor" />
              </Link>
              <button
                className="secondary-button px-3 py-2 text-sm"
                onClick={() => {
                  setName(current.name);
                  setSchedule({ from: clockTime(current.showFrom), until: clockTime(current.showUntil), on: current.showOn });
                  setDraft(current.layout.widgets);
                }}
                type="button"
              >
                <Icon name="pencil" size={16} />
                Edit
              </button>
            </>
          )
        }
        title={current.name}
      />
      {dashboards.data.length > 1 && (
        <div className="mt-6">
          <Tabs
            items={dashboards.data.map((dashboard) => ({ active: dashboard.id === current.id, href: `/?d=${dashboard.id}`, label: dashboard.name }))}
            label="Dashboards"
          />
        </div>
      )}
      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="field-label">
            Name
            <input maxLength={40} onChange={(event) => setName(event.currentTarget.value)} value={name} />
          </label>
          <fieldset className="m-0 flex flex-wrap items-end gap-3 border-0 p-0">
            <legend className="field-label mb-1.5 p-0">Opens by itself</legend>
            <label className="field-label">
              From
              <input onChange={(event) => setSchedule({ ...schedule, from: event.currentTarget.value })} type="time" value={schedule.from} />
            </label>
            <label className="field-label">
              Until
              <input onChange={(event) => setSchedule({ ...schedule, until: event.currentTarget.value })} type="time" value={schedule.until} />
            </label>
            <label className="field-label">
              On
              <select onChange={(event) => setSchedule({ ...schedule, on: event.currentTarget.value as Device })} value={schedule.on}>
                <option value="any">Any device</option>
                <option value="phone">Phones</option>
                <option value="desktop">Computers</option>
              </select>
            </label>
          </fieldset>
          {dashboards.data.length > 1 && (
            <button className="secondary-button px-3 py-2 text-sm" onClick={() => setDeleting(true)} type="button">
              Delete this dashboard
            </button>
          )}
        </div>
      )}
      {editing && (
        <label className="field-label mt-4 max-w-xs">
          Add a widget
          <select
            onChange={(event) => {
              const type = event.currentTarget.value as WidgetType;
              event.currentTarget.value = '';
              if (type) change([...widgets, { id: crypto.randomUUID(), type, size: widgetKinds[type].size, settings: widgetKinds[type].settings }]);
            }}
            value=""
          >
            <option value="">Choose…</option>
            {(Object.keys(widgetKinds) as WidgetType[]).map((type) => (
              <option key={type} value={type}>
                {widgetKinds[type].title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        {widgets.length === 0 && (
          <p className="m-0 text-muted lg:col-span-4">This dashboard is empty. Choose Edit dashboard to add widgets.</p>
        )}
        {widgets.map((widget, index) => {
          const kind = widgetKinds[widget.type];
          return (
            <article
              aria-label={kind.title}
              className={`grid content-start gap-3 rounded-xl border bg-surface p-4 ${spans[widget.size]} ${editing ? 'border-dashed border-line' : 'border-line'} ${dragging === index ? 'opacity-50' : ''}`}
              draggable={editing}
              key={widget.id}
              onDragOver={(event) => editing && event.preventDefault()}
              onDragStart={() => setDragging(index)}
              onDragEnd={() => setDragging(undefined)}
              onDrop={() => {
                if (dragging !== undefined && dragging !== index) change(move(widgets, dragging, index));
                setDragging(undefined);
              }}
            >
              <header className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-medium text-muted">{kind.title}</h2>
                {editing && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button aria-label={`Move ${kind.title} earlier`} className="text-button mono-sm" disabled={index === 0} onClick={() => change(move(widgets, index, index - 1))} type="button">
                      ↑
                    </button>
                    <button aria-label={`Move ${kind.title} later`} className="text-button mono-sm" disabled={index === widgets.length - 1} onClick={() => change(move(widgets, index, index + 1))} type="button">
                      ↓
                    </button>
                    <select
                      aria-label={`Size of ${kind.title}`}
                      onChange={(event) => change(widgets.map((shown) => (shown.id === widget.id ? { ...shown, size: event.currentTarget.value as WidgetSize } : shown)))}
                      value={widget.size}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="wide">Wide</option>
                      <option value="full">Full</option>
                    </select>
                    {kind.Settings && (
                      <button className="text-button mono-sm" onClick={() => setSettingsOpen(settingsOpen === widget.id ? undefined : widget.id)} type="button">
                        Settings
                      </button>
                    )}
                    <button className="text-button mono-sm" onClick={() => change(widgets.filter((shown) => shown.id !== widget.id))} type="button">
                      Remove
                    </button>
                  </div>
                )}
              </header>
              {editing && settingsOpen === widget.id && kind.Settings && (
                <kind.Settings
                  onChange={(settings) => change(widgets.map((shown) => (shown.id === widget.id ? { ...shown, settings } : shown)))}
                  settings={widget.settings}
                />
              )}
              <WidgetBoundary>
                <kind.View settings={widget.settings} />
              </WidgetBoundary>
            </article>
          );
        })}
      </div>
      {adding && (
        <FormDialog
          busy={saving.busy}
          busyLabel="Adding…"
          onClose={() => setAdding(false)}
          onSubmit={(target) => {
            if (!addForm.check(target, { name: [required('Name the dashboard.'), atMost(40, 'Use at most 40 characters.')] })) return;
            const values = new FormData(target);
            const template = String(values.get('template'));
            void saving
              .run(async () => {
                const created = await auth.request<Dashboard>('/me/dashboards', {
                  method: 'POST',
                  body: JSON.stringify({ name: String(values.get('name')).trim(), ...(template ? { template } : {}) }),
                });
                dashboards.mutate((all) => [...all, created]);
                navigate(`/?d=${created.id}`);
                return '';
              }, 'Could not add the dashboard')
              .then((added) => added && setAdding(false));
          }}
          submitLabel="Add dashboard"
          title="New dashboard"
        >
          <TextField autoFocus defaultValue="Morning briefing" label="Name" maxLength={40} {...addForm.field('name')} />
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="field-label mb-2">Start from</legend>
            {templates.map(([value, label, contents]) => (
              <label className="choice-card" key={label}>
                <input
                  defaultChecked={value === 'morning'}
                  name="template"
                  onChange={(event) => {
                    const field = event.currentTarget.form?.elements.namedItem('name');
                    if (field instanceof HTMLInputElement && templates.some(([, known]) => known === field.value)) field.value = label;
                  }}
                  type="radio"
                  value={value}
                />
                <span className="grid gap-0.5">
                  <span className="text-ink">{label}</span>
                  <span className="text-xs text-faint">{contents}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </FormDialog>
      )}
      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete dashboard"
          errorFallback="Could not delete the dashboard"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await auth.request(`/me/dashboards/${current.id}`, { method: 'DELETE' });
            dashboards.mutate((all) => all.filter((dashboard) => dashboard.id !== current.id));
            finish(false);
            navigate('/');
          }}
          title={`Delete ${current.name}?`}
        >
          Its layout is removed. Nothing in your spaces is touched.
        </ConfirmDialog>
      )}
    </section>
  );
}
