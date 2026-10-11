import { Component, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ConfirmDialog, Dialog, EmptyState, Icon, Menu, PageSkeleton, Select, Tabs, TextField, TimePicker } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { FormDialog } from '../components/FormDialog';
import { HeaderButton, Page, Toolbar } from '../components/Page';
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

const sizes: [WidgetSize, string][] = [
  ['small', 'small'],
  ['medium', 'medium'],
  ['wide', 'wide'],
  ['full', 'full width'],
];

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
            <article aria-label={kind.title} className={`grid min-w-0 grid-cols-1 content-start gap-3 rounded-xl border border-line bg-surface p-6 ${spans[widget.size]}`} key={widget.id}>
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
  const [configuring, setConfiguring] = useState(false);
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
    <Page
      actions={
        editing ? (
          <>
            <HeaderButton
              disabled={history.length === 0}
              label="Undo"
              onClick={() => {
                setDraft(history.at(-1));
                setHistory((past) => past.slice(0, -1));
              }}
            />
            <HeaderButton label="Cancel" onClick={() => finish(false)} />
            <HeaderButton disabled={saving.busy} label={saving.busy ? 'Saving…' : 'Done'} onClick={() => finish(true)} primary />
          </>
        ) : (
          <>
            <Link className="secondary-button px-3 py-2 text-sm no-underline" to={`/?d=${current.id}&display=wall`}>
              <Icon name="monitor" size={16} />
              Wall display
            </Link>
            <HeaderButton
              icon="pencil"
              label="Edit"
              onClick={() => {
                setName(current.name);
                setSchedule({ from: clockTime(current.showFrom), until: clockTime(current.showUntil), on: current.showOn });
                setDraft(current.layout.widgets);
              }}
            />
            <HeaderButton icon="plus" label="New dashboard" onClick={() => setAdding(true)} primary />
          </>
        )
      }
      title={editing ? name.trim() || current.name : current.name}
      wide
    >
      {dashboards.data.length > 1 && (
        <Tabs
          items={dashboards.data.map((dashboard) => ({ active: dashboard.id === current.id, href: `/?d=${dashboard.id}`, label: dashboard.name }))}
          label="Dashboards"
        />
      )}
      {editing && (
        <Toolbar
          actions={
            <>
              <HeaderButton icon="settings" label="Dashboard settings" onClick={() => setConfiguring(true)} />
              <Menu
                items={(Object.keys(widgetKinds) as WidgetType[]).map((type) => ({
                  label: widgetKinds[type].title,
                  onSelect: () => change([...widgets, { id: crypto.randomUUID(), type, size: widgetKinds[type].size, settings: widgetKinds[type].settings }]),
                }))}
                label="Widgets"
                trigger={
                  <>
                    <Icon name="plus" size={16} />
                    Add widget
                  </>
                }
                triggerClassName="primary-button px-3 py-2 text-sm"
                triggerLabel="Add widget"
              />
            </>
          }
        >
          <p className="m-0 text-sm text-muted">Drag widgets to reorder them, or use each widget’s menu.</p>
        </Toolbar>
      )}
      {widgets.length === 0 ? (
        <EmptyState title="This dashboard is empty">
          <p className="mt-2 mb-0 text-sm text-muted">{editing ? 'Add a widget to start.' : 'Choose Edit to add widgets.'}</p>
        </EmptyState>
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-1 items-start gap-4 lg:grid-cols-4">
          {widgets.map((widget, index) => {
            const kind = widgetKinds[widget.type];
            return (
              <article
                aria-label={kind.title}
                className={`grid min-w-0 grid-cols-1 content-start gap-3 rounded-xl border bg-surface p-4 ${spans[widget.size]} ${editing ? 'cursor-grab border-dashed border-line' : 'border-line'} ${dragging === index ? 'opacity-50' : ''}`}
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
                <header className="flex min-h-8 items-center justify-between gap-2">
                  <h2 className="m-0 text-sm font-medium text-muted">{kind.title}</h2>
                  {editing && (
                    <Menu
                      items={[
                        ...(kind.Settings ? [{ label: settingsOpen === widget.id ? 'Close settings' : 'Settings', onSelect: () => setSettingsOpen(settingsOpen === widget.id ? undefined : widget.id) }] : []),
                        ...(index > 0 ? [{ label: 'Move earlier', onSelect: () => change(move(widgets, index, index - 1)) }] : []),
                        ...(index < widgets.length - 1 ? [{ label: 'Move later', onSelect: () => change(move(widgets, index, index + 1)) }] : []),
                        ...sizes
                          .filter(([size]) => size !== widget.size)
                          .map(([size, label], at) => ({
                            label: `Make it ${label}`,
                            separated: at === 0,
                            onSelect: () => change(widgets.map((shown) => (shown.id === widget.id ? { ...shown, size } : shown))),
                          })),
                        { label: 'Remove', separated: true, onSelect: () => change(widgets.filter((shown) => shown.id !== widget.id)) },
                      ]}
                      label={`${kind.title} actions`}
                      trigger={<Icon name="more" size={18} />}
                      triggerClassName="icon-button"
                      triggerLabel={`Actions for ${kind.title}`}
                    />
                  )}
                </header>
                {editing && settingsOpen === widget.id && kind.Settings && (
                  <div className="rounded-lg border border-line-soft p-3">
                    <kind.Settings
                      onChange={(settings) => change(widgets.map((shown) => (shown.id === widget.id ? { ...shown, settings } : shown)))}
                      settings={widget.settings}
                    />
                  </div>
                )}
                <WidgetBoundary>
                  <kind.View settings={widget.settings} />
                </WidgetBoundary>
              </article>
            );
          })}
        </div>
      )}
      {configuring && (
        <Dialog onClose={() => setConfiguring(false)} title="Dashboard settings">
          <div className="mt-5 grid gap-4">
            <TextField label="Name" maxLength={40} onChange={(event) => setName(event.currentTarget.value)} value={name} />
            <fieldset className="m-0 grid gap-x-4 border-0 p-0 sm:grid-cols-3">
              <legend className="field-label mb-1.5 p-0">Opens by itself</legend>
              <TimePicker emptyLabel="Any time" label="From" onChange={(from) => setSchedule({ ...schedule, from })} value={schedule.from} />
              <TimePicker emptyLabel="Any time" label="Until" onChange={(until) => setSchedule({ ...schedule, until })} value={schedule.until} />
              <Select
                label="On"
                onChange={(on: Device) => setSchedule({ ...schedule, on })}
                options={[
                  { value: 'any', label: 'Any device' },
                  { value: 'phone', label: 'Phones' },
                  { value: 'desktop', label: 'Computers' },
                ]}
                value={schedule.on}
              />
            </fieldset>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {dashboards.data.length > 1 && (
                <button
                  className="text-button mr-auto text-sm text-danger"
                  onClick={() => {
                    setConfiguring(false);
                    setDeleting(true);
                  }}
                  type="button"
                >
                  Delete this dashboard
                </button>
              )}
              <button className="primary-button" onClick={() => setConfiguring(false)} type="button">
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}
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
    </Page>
  );
}
