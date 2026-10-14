import { Component, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ConfirmDialog, Dialog, EmptyState, Icon, isAbortError, Menu, PageSkeleton, Select, Tabs, TextField, TimePicker, Toggle, type TagColor } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { uploadFile } from '../files';
import { FormDialog } from '../components/FormDialog';
import { HeaderButton, Page, Toolbar } from '../components/Page';
import { colorOptions, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { DashboardGrid } from './DashboardGrid';
import { gridColumns, inOrder, placed, sizeWidths } from './grid';
import { widgetKinds, type CardPadding, type PlacedWidget, type Widget, type WidgetType } from './widgets';
import { LoadError } from '../components/LoadError';

type Device = 'any' | 'phone' | 'desktop';

interface Background {
  colour?: TagColor;
  imageId?: string;
}

interface Layout {
  widgets: PlacedWidget[];
  background?: Background;
}

interface Dashboard {
  id: string;
  name: string;
  position: number;
  layout: { widgets: Widget[]; background?: Background };
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

const heights: [string, string][] = [
  ['', 'Fit content'],
  ['10', 'Short'],
  ['16', 'Medium'],
  ['24', 'Tall'],
];

const paddingOptions: { value: CardPadding; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'roomy', label: 'Roomy' },
];

const layoutOf = (dashboard: Dashboard): Layout => ({ ...dashboard.layout, widgets: placed(dashboard.layout.widgets) });
const cardTitle = (widget: Widget) => widget.title ?? widgetKinds[widget.type].title;

function useBackdrop(background?: Background) {
  const { request } = useAuth();
  const [image, setImage] = useState('');

  useEffect(() => {
    if (!background?.imageId) return;
    const controller = new AbortController();
    let created = '';
    void request<Blob>(`/files/${background.imageId}`, { signal: controller.signal }, readBlob).then(
      (blob) => {
        created = URL.createObjectURL(blob);
        setImage(created);
      },
      (reason: unknown) => {
        if (!isAbortError(reason)) throw reason;
      },
    );
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
      setImage('');
    };
  }, [background?.imageId, request]);

  return {
    className: background?.colour ? `dashboard-backdrop-colour tag-${background.colour}` : image ? 'dashboard-backdrop-image' : '',
    image: image && `url(${image})`,
  };
}

function PageBackdrop({ background }: { background?: Background }) {
  const { className, image } = useBackdrop(background);

  useEffect(() => {
    if (!className) return;
    const classes = className.split(' ');
    document.body.classList.add(...classes);
    if (image) document.body.style.setProperty('--backdrop-image', image);
    return () => {
      document.body.classList.remove(...classes);
      document.body.style.removeProperty('--backdrop-image');
    };
  }, [className, image]);

  return null;
}

class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p className="m-0 text-sm text-muted">This widget stopped working. Reload the page to try again.</p> : this.props.children;
  }
}

function swapWithNeighbour(widgets: PlacedWidget[], id: string, step: -1 | 1) {
  const ordered = inOrder(widgets);
  const index = ordered.findIndex((widget) => widget.id === id);
  const neighbour = ordered[index + step]!;
  const widget = ordered[index]!;
  return widgets.map((shown) =>
    shown.id === id
      ? { ...shown, x: Math.min(neighbour.x, gridColumns - shown.w), y: neighbour.y }
      : shown.id === neighbour.id
        ? { ...shown, x: Math.min(widget.x, gridColumns - shown.w), y: widget.y }
        : shown,
  );
}

const wallRefreshMs = 5 * 60_000;

function WallDisplay({ dashboard }: { dashboard: Dashboard }) {
  const navigate = useNavigate();
  const [round, setRound] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [mayDim, setMayDim] = useState(false);
  const backdrop = useBackdrop(dashboard.layout.background);

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
    <div className={`fixed inset-0 z-50 overflow-y-auto bg-paper p-6 sm:p-10 ${backdrop.className}`} style={backdrop.image ? ({ '--backdrop-image': backdrop.image } as CSSProperties) : undefined}>
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
      <div className="mt-8 text-lg" key={round}>
        <DashboardGrid
          card={(widget) => {
            const kind = widgetKinds[widget.type];
            return (
              <>
                {!widget.hideTitle && <h2 className="m-0 text-sm font-medium text-muted">{cardTitle(widget)}</h2>}
                <WidgetBoundary>
                  <kind.View settings={widget.settings} />
                </WidgetBoundary>
              </>
            );
          }}
          label={cardTitle}
          widgets={placed(dashboard.layout.widgets)}
        />
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
  const spaces = useSpaces();
  const [draft, setDraft] = useState<Layout>();
  const [history, setHistory] = useState<Layout[]>([]);
  const [settingsOpen, setSettingsOpen] = useState<string>();
  const [customizing, setCustomizing] = useState<string>();
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
  const layout = draft ?? layoutOf(current);
  const { widgets } = layout;
  const editing = draft !== undefined;
  const customized = widgets.find((widget) => widget.id === customizing);
  const personal = spaces.data?.find((space) => space.kind === 'personal');
  if (params.get('display') === 'wall' && !editing) return <WallDisplay dashboard={current} />;

  function change(next: Partial<Layout>) {
    setHistory((past) => [...past, layout]);
    setDraft({ ...layout, ...next });
  }

  const update = (id: string, fields: Partial<PlacedWidget>) => change({ widgets: widgets.map((shown) => (shown.id === id ? { ...shown, ...fields } : shown)) });

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
            layout,
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
                setDraft(layoutOf(current));
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
                  onSelect: () =>
                    change({
                      widgets: [...widgets, { id: crypto.randomUUID(), type, x: 0, y: Math.max(0, ...widgets.map((widget) => widget.y + 1)), w: sizeWidths[widgetKinds[type].size], settings: widgetKinds[type].settings }],
                    }),
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
        />
      )}
      {widgets.length === 0 ? (
        <EmptyState title="This dashboard is empty">
          <p className="mt-2 mb-0 text-sm text-muted">{editing ? 'Add a widget to start.' : 'Choose Edit to add widgets.'}</p>
        </EmptyState>
      ) : (
        <DashboardGrid
          card={(widget) => {
            const kind = widgetKinds[widget.type];
            const index = inOrder(widgets).findIndex((shown) => shown.id === widget.id);
            return (
              <>
                {(editing || !widget.hideTitle) && (
                  <header className="flex min-h-8 items-center justify-between gap-2">
                    <h2 className={`m-0 text-sm font-medium ${widget.hideTitle ? 'text-faint line-through' : 'text-muted'}`}>{cardTitle(widget)}</h2>
                    {editing && (
                      <Menu
                        items={[
                          ...(kind.Settings ? [{ label: settingsOpen === widget.id ? 'Close settings' : 'Settings', onSelect: () => setSettingsOpen(settingsOpen === widget.id ? undefined : widget.id) }] : []),
                          { label: 'Customize card', onSelect: () => setCustomizing(widget.id) },
                          ...(index > 0 ? [{ label: 'Move earlier', separated: true, onSelect: () => change({ widgets: swapWithNeighbour(widgets, widget.id, -1) }) }] : []),
                          ...(index < widgets.length - 1 ? [{ label: 'Move later', separated: index === 0, onSelect: () => change({ widgets: swapWithNeighbour(widgets, widget.id, 1) }) }] : []),
                          ...(widget.x + widget.w < gridColumns ? [{ label: 'Wider', separated: true, onSelect: () => update(widget.id, { w: widget.w + 1 }) }] : []),
                          ...(widget.w > 1 ? [{ label: 'Narrower', separated: widget.x + widget.w >= gridColumns, onSelect: () => update(widget.id, { w: widget.w - 1 }) }] : []),
                          ...(widget.h ? [{ label: 'Fit height to content', onSelect: () => update(widget.id, { h: null }) }] : []),
                          { label: 'Remove', separated: true, onSelect: () => change({ widgets: widgets.filter((shown) => shown.id !== widget.id) }) },
                        ]}
                        label={`${cardTitle(widget)} actions`}
                        trigger={<Icon name="more" size={18} />}
                        triggerClassName="icon-button"
                        triggerLabel={`Actions for ${cardTitle(widget)}`}
                      />
                    )}
                  </header>
                )}
                {editing && settingsOpen === widget.id && kind.Settings && (
                  <div className="rounded-lg border border-line-soft p-3">
                    <kind.Settings onChange={(settings) => update(widget.id, { settings })} settings={widget.settings} />
                  </div>
                )}
                <WidgetBoundary>
                  <kind.View settings={widget.settings} />
                </WidgetBoundary>
              </>
            );
          }}
          editing={editing}
          label={cardTitle}
          onChange={(next) => change({ widgets: next })}
          widgets={widgets}
        />
      )}
      <PageBackdrop background={layout.background} />
      {customized && (
        <Dialog onClose={() => setCustomizing(undefined)} title="Customize card">
          <div className="mt-5 grid gap-4">
            <TextField
              label="Title"
              maxLength={40}
              onChange={(event) => update(customized.id, { title: event.currentTarget.value.trim() ? event.currentTarget.value : undefined })}
              placeholder={widgetKinds[customized.type].title}
              value={customized.title ?? ''}
            />
            <Toggle checked={!customized.hideTitle} label="Show the title" onChange={(shown) => update(customized.id, { hideTitle: shown ? undefined : true })} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Accent"
                onChange={(accent: string) => update(customized.id, { accent: (accent || undefined) as TagColor | undefined })}
                options={[{ value: '', label: 'None' }, ...colorOptions]}
                value={customized.accent ?? ''}
              />
              <Select label="Padding" onChange={(padding: CardPadding) => update(customized.id, { padding })} options={paddingOptions} value={customized.padding ?? 'normal'} />
              <Select
                label="Height"
                onChange={(rows: string) => update(customized.id, { h: rows ? Number(rows) : null })}
                options={[
                  ...heights.map(([value, label]) => ({ value, label })),
                  ...(customized.h && !heights.some(([value]) => value === String(customized.h)) ? [{ value: String(customized.h), label: 'Custom' }] : []),
                ]}
                value={customized.h ? String(customized.h) : ''}
              />
            </div>
            <div className="flex justify-end">
              <button className="primary-button" onClick={() => setCustomizing(undefined)} type="button">
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {configuring && (
        <Dialog onClose={() => setConfiguring(false)} title="Dashboard settings">
          <div className="mt-5 grid gap-4">
            <TextField label="Name" maxLength={40} onChange={(event) => setName(event.currentTarget.value)} value={name} />
            <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-3">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Background"
                onChange={(choice: string) => change({ background: choice === 'image' ? layout.background : choice ? { colour: choice as TagColor } : undefined })}
                options={[{ value: '', label: 'None' }, ...colorOptions, ...(layout.background?.imageId ? [{ value: 'image', label: 'Image' }] : [])]}
                value={layout.background?.colour ?? (layout.background?.imageId ? 'image' : '')}
              />
              {personal && (
                <label className="secondary-button self-end px-3 py-2 text-sm">
                  <Icon name="upload" size={16} />
                  {saving.busy ? 'Uploading…' : 'Use an image'}
                  <input
                    accept="image/*"
                    aria-label="Background image"
                    className="sr-only"
                    disabled={saving.busy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (!file) return;
                      void saving.run(async () => {
                        const uploaded = await uploadFile(auth.request, personal.id, file);
                        change({ background: { imageId: uploaded.id } });
                        return '';
                      }, 'Could not upload the image');
                    }}
                    type="file"
                  />
                </label>
              )}
            </div>
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
