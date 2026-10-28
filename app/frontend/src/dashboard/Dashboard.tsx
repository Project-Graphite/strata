import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ColorSwatches, ConfirmDialog, Dialog, Fieldset, formatDay, Icon, IconButton, PageSkeleton, Radio, Select, TextField, Toggle, type TagColor } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { appCatalogue } from '../apps';
import { useAuth } from '../auth';
import { uploadFile } from '../files';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, ButtonLink, IconLink, TextButton } from '../components/Button';
import { DialogActions } from '../components/DialogActions';
import { FileButton } from '../components/FileButton';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { Page } from '../components/Page';
import { colorOptions, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { automaticDashboard, rememberDashboard, rememberedDashboard, ShowBackdrop, useBackdrop, type Background } from './backdrop';
import { DashboardGrid, useWide, type GridHandle } from './DashboardGrid';
import { WidgetGallery } from './WidgetGallery';
import { gridColumns, inOrder, placed, sizeWidths } from './grid';
import { WidgetEmpty, WidgetHeading } from './widget-parts';
import { widgetKinds, type CardPadding, type PlacedWidget, type Widget } from './widgets';
import { LoadError } from '../components/LoadError';
import { clockTime, TimeField } from '../time';

type Device = 'any' | 'phone' | 'desktop';

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

const fieldTime = (minutes: number | null) => (minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
const minutesOf = (time: string) => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null);

const templates = [
  ['morning', 'Morning briefing', 'Clock, Today, Agenda, Renewals and spend, Inbox'],
  ['work', 'Work day', 'Today, Tasks, Shortcuts, Clock'],
  ['student', 'Student', 'Today, Tasks, Shortcuts'],
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

function BackgroundPreview({ background }: { background: Background }) {
  const { image } = useBackdrop(background);
  return <span aria-label="Chosen image" className="h-10 w-16 rounded-field border border-line bg-cover bg-center" role="img" style={{ backgroundImage: image || undefined }} />;
}

class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <WidgetEmpty icon="alert" title="This widget stopped working, reload the page" />
    ) : (
      this.props.children
    );
  }
}

function WidgetSettings({ onChange, onClose, widget }: { onChange: (fields: Partial<PlacedWidget>) => void; onClose: () => void; widget: PlacedWidget }) {
  const { minH, Settings, title } = widgetKinds[widget.type];
  return (
    <Dialog onClose={onClose} title={`${cardTitle(widget)} settings`}>
      <div className="mt-5 grid gap-6">
        {Settings && <Settings onChange={(settings) => onChange({ settings })} settings={widget.settings} />}
        <Fieldset className="gap-4" legend="Card">
          <TextField
            label="Title"
            maxLength={40}
            onChange={(event) => onChange({ title: event.currentTarget.value.trim() ? event.currentTarget.value : undefined })}
            placeholder={title}
            value={widget.title ?? ''}
          />
          <Toggle checked={!widget.hideTitle} label="Show the title" onChange={(shown) => onChange({ hideTitle: shown ? undefined : true })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Accent"
              onChange={(accent: string) => onChange({ accent: (accent || undefined) as TagColor | undefined })}
              options={[{ value: '', label: 'None' }, ...colorOptions]}
              value={widget.accent ?? ''}
            />
            <Select label="Padding" onChange={(padding: CardPadding) => onChange({ padding })} options={paddingOptions} value={widget.padding ?? 'normal'} />
            <Select
              label="Height"
              onChange={(rows: string) => onChange({ h: rows ? Number(rows) : null })}
              options={[
                ...heights.filter(([value]) => !value || Number(value) >= minH).map(([value, label]) => ({ value, label })),
                ...(widget.h && !heights.some(([value]) => value === String(widget.h)) ? [{ value: String(widget.h), label: 'Custom' }] : []),
              ]}
              value={widget.h ? String(widget.h) : ''}
            />
          </div>
        </Fieldset>
        <DialogActions>
          <Button label="Done" large onClick={onClose} primary />
        </DialogActions>
      </div>
    </Dialog>
  );
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

function WallDisplay({ dashboard }: { dashboard: Dashboard }) {
  const navigate = useNavigate();
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
    const tick = setInterval(() => setNow(new Date()), 15_000);
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    window.addEventListener('keydown', leave);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', keepAwake);
      window.removeEventListener('keydown', leave);
      void lock?.release();
    };
  }, [dashboard.id, navigate]);

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto bg-paper [scrollbar-gutter:stable] p-6 sm:p-10 ${backdrop.className}`} style={backdrop.image ? ({ '--backdrop-image': backdrop.image } as CSSProperties) : undefined}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Hint>{dashboard.name}</Hint>
          <p className="m-0 text-5xl text-ink">{clockTime(now)}</p>
          <p className="mono-sm m-0 mt-1 text-faint">{formatDay(dayKey(now), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <ButtonLink label="Exit" to={`/?d=${dashboard.id}`} />
      </header>
      {mayDim && <p className="mt-4 mb-0 text-small text-muted">This browser may still let the screen turn itself off.</p>}
      <div className="mt-8 text-lg">
        <DashboardGrid
          card={(widget) => {
            const kind = widgetKinds[widget.type];
            return (
              <>
                {!widget.hideTitle && <WidgetHeading icon={kind.icon} title={cardTitle(widget)} />}
                <WidgetBoundary>
                  <kind.View settings={widget.settings} />
                </WidgetBoundary>
              </>
            );
          }}
          dashboard={dashboard.id}
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
  const dashboards = useResource<Dashboard[]>('/me/dashboards', true, { live: ['dashboards'] });
  const saving = useAction();
  const spaces = useSpaces();
  const wide = useWide();
  const [draft, setDraft] = useState<Layout>();
  const [history, setHistory] = useState<Layout[]>([]);
  const [settingsOpen, setSettingsOpen] = useState<string>();
  const grid = useRef<GridHandle>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [picking, setPicking] = useState(false);
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
  const unsaved =
    history.length > 0 ||
    name !== current.name ||
    schedule.from !== fieldTime(current.showFrom) ||
    schedule.until !== fieldTime(current.showUntil) ||
    schedule.on !== current.showOn;
  const configured = widgets.find((widget) => widget.id === settingsOpen);
  const personal = spaces.data?.find((space) => space.role !== 'viewer');
  const features = auth.user?.features ?? [];
  if (params.get('display') === 'wall' && !editing) return <WallDisplay dashboard={current} />;

  function startEditing() {
    setName(current.name);
    setSchedule({ from: fieldTime(current.showFrom), until: fieldTime(current.showUntil), on: current.showOn });
    setDraft(layoutOf(current));
  }

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
        return `Saved ${saved.name}.`;
      }, 'Could not save the dashboard')
      .then((done) => done && finish(false));
  }

  return (
    <Page
      actions={
        editing ? (
          <>
            <IconButton icon="settings" label="Dashboard settings" onClick={() => setConfiguring(true)} />
            <Button icon="plus" label="Add widget" large onClick={() => setPicking(true)} />
            {wide && widgets.length > 1 && <Button icon="panel" label="Organise" large onClick={() => grid.current?.organize()} />}
            <Button
              disabled={history.length === 0}
              label="Undo"
              large
              onClick={() => {
                setDraft(history.at(-1));
                setHistory((past) => past.slice(0, -1));
              }}
            />
            <Button label="Cancel" large onClick={() => (unsaved ? setDiscarding(true) : finish(false))} />
            <Button disabled={saving.busy} label={saving.busy ? 'Saving…' : 'Done'} large onClick={() => finish(true)} primary />
          </>
        ) : (
          <>
            <IconLink icon="monitor" label="Wall display" to={`/?d=${current.id}&display=wall`} />
            <IconButton icon="pencil" label="Edit" onClick={startEditing} />
            <IconButton icon="plus" label="New dashboard" onClick={() => setAdding(true)} />
          </>
        )
      }
      tabs={dashboards.data.length > 1 ? dashboards.data.map((dashboard) => ({ active: dashboard.id === current.id, href: `/?d=${dashboard.id}`, label: dashboard.name })) : undefined}
      title={editing ? name.trim() || current.name : current.name}
    >
      {widgets.length === 0 ? (
        <div className="dashboard-empty">
          <div aria-hidden="true" className="dashboard-empty-art">
            <span />
            <span />
            <span />
            <span />
          </div>
          <h2 className="m-0 text-h2 text-ink">Make this dashboard yours</h2>
          <p className="m-0 max-w-md text-small text-muted">Pick widgets for your day, your money, your notes and the world around you.</p>
          <div className="mt-3">
            <Button
              icon="plus"
              label="Add widgets"
              large
              onClick={() => {
                if (!editing) startEditing();
                setPicking(true);
              }}
              primary
            />
          </div>
        </div>
      ) : (
        <DashboardGrid
          card={(widget) => {
            const kind = widgetKinds[widget.type];
            const index = inOrder(widgets).findIndex((shown) => shown.id === widget.id);
            const app = appCatalogue.find((entry) => entry.key === kind.app);
            const menu = editing && (
              <ActionsMenu
                items={[
                  { label: 'Settings', onSelect: () => setSettingsOpen(widget.id) },
                  ...(index > 0 ? [{ label: 'Move earlier', separated: true, onSelect: () => change({ widgets: swapWithNeighbour(widgets, widget.id, -1) }) }] : []),
                  ...(index < widgets.length - 1 ? [{ label: 'Move later', separated: index === 0, onSelect: () => change({ widgets: swapWithNeighbour(widgets, widget.id, 1) }) }] : []),
                  ...(wide && widget.x + widget.w < gridColumns ? [{ label: 'Wider', separated: true, onSelect: () => update(widget.id, { w: widget.w + 1 }) }] : []),
                  ...(wide && widget.w > kind.minW ? [{ label: 'Narrower', separated: widget.x + widget.w >= gridColumns, onSelect: () => update(widget.id, { w: widget.w - 1 }) }] : []),
                  ...(wide && widget.h ? [{ label: 'Fit height to content', onSelect: () => update(widget.id, { h: null }) }] : []),
                  { label: 'Remove', separated: true, onSelect: () => change({ widgets: widgets.filter((shown) => shown.id !== widget.id) }) },
                ]}
                name={cardTitle(widget)}
              />
            );
            const open = !editing && kind.href && (!kind.app || features.includes(kind.app)) && (
              <Link aria-label={`Open ${app?.label ?? kind.title}`} className="widget-open" title={`Open ${app?.label ?? kind.title}`} to={kind.href}>
                <Icon name="chevron-right" size={16} />
              </Link>
            );
            return (
              <>
                {widget.hideTitle ? (
                  menu && <div className="absolute top-2 right-2 z-1 rounded-field bg-surface">{menu}</div>
                ) : (
                  <WidgetHeading icon={kind.icon} title={cardTitle(widget)}>
                    {menu || open}
                  </WidgetHeading>
                )}
                <WidgetBoundary>
                  <kind.View
                    configure={() => {
                      if (!editing) startEditing();
                      setSettingsOpen(widget.id);
                    }}
                    settings={widget.settings}
                  />
                </WidgetBoundary>
              </>
            );
          }}
          dashboard={current.id}
          editing={editing}
          key={current.id}
          label={cardTitle}
          onChange={(next, replace) => (replace ? setDraft({ ...layout, widgets: next }) : change({ widgets: next }))}
          ref={grid}
          widgets={widgets}
        />
      )}
      <ShowBackdrop background={layout.background} />
      {configured && (
        <WidgetSettings
          onChange={(fields) => update(configured.id, fields)}
          onClose={() => setSettingsOpen(undefined)}
          widget={configured}
        />
      )}
      {picking && (
        <WidgetGallery
          onAdd={(type) => {
            change({
              widgets: [...widgets, { id: crypto.randomUUID(), type, x: 0, y: Math.max(0, ...widgets.map((widget) => widget.y + 1)), w: sizeWidths[widgetKinds[type].size], settings: widgetKinds[type].settings }],
            });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {configuring && (
        <Dialog onClose={() => setConfiguring(false)} title="Dashboard settings">
          <div className="mt-5 grid gap-5">
            <TextField label="Name" maxLength={40} onChange={(event) => setName(event.currentTarget.value)} value={name} />
            <Fieldset className="gap-3" legend="Opens by itself">
              <div className="grid gap-4 sm:grid-cols-3">
                <TimeField emptyLabel="Any time" label="From" onChange={(from) => setSchedule({ ...schedule, from })} value={schedule.from} />
                <TimeField emptyLabel="Any time" label="Until" onChange={(until) => setSchedule({ ...schedule, until })} value={schedule.until} />
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
              </div>
            </Fieldset>
            <div className="grid gap-3">
              <ColorSwatches label="Background" name="background" onChange={(colour) => change({ background: { colour } })} value={layout.background?.colour ?? null} />
              <div className="flex flex-wrap items-center gap-3">
                {layout.background?.imageId && <BackgroundPreview background={layout.background} />}
                {personal && (
                  <FileButton
                    accept="image/*"
                    busy={saving.busy}
                    inputLabel="Background image"
                    label={saving.busy ? 'Uploading…' : layout.background?.imageId ? 'Change the image' : 'Use an image'}
                    onFiles={(files) =>
                      void saving.run(async () => {
                        const uploaded = await uploadFile(auth.request, personal.id, files[0]!);
                        change({ background: { imageId: uploaded.id } });
                        return '';
                      }, 'Could not upload the image')
                    }
                  />
                )}
                {layout.background && <TextButton label="No background" onClick={() => change({ background: undefined })} />}
              </div>
            </div>
            <DialogActions
              start={
                dashboards.data.length > 1 && (
                  <TextButton
                    danger
                    label="Delete dashboard"
                    onClick={() => {
                      setConfiguring(false);
                      setDeleting(true);
                    }}
                  />
                )
              }
            >
              <Button label="Done" large onClick={() => setConfiguring(false)} primary />
            </DialogActions>
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
                return `Added ${created.name}.`;
              }, 'Could not add the dashboard')
              .then((added) => added && setAdding(false));
          }}
          submitLabel="Add dashboard"
          title="New dashboard"
        >
          <TextField autoFocus defaultValue="Morning briefing" label="Name" maxLength={40} {...addForm.field('name')} />
          <Fieldset legend="Start from">
            {templates.map(([value, label, contents]) => (
              <Radio
                className="choice-card m-0"
                defaultChecked={value === 'morning'}
                key={label}
                label={
                  <span className="grid gap-0.5">
                    <span className="text-ink">{label}</span>
                    <span className="text-small text-muted">{contents}</span>
                  </span>
                }
                name="template"
                onChange={(event) => {
                  const field = event.currentTarget.form?.elements.namedItem('name');
                  if (field instanceof HTMLInputElement && templates.some(([, known]) => known === field.value)) field.value = label;
                }}
                value={value}
              />
            ))}
          </Fieldset>
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
            saving.report(`Deleted ${current.name}.`);
          }}
          title={`Delete ${current.name}?`}
          tone="danger"
        >
          Its layout is removed. Nothing in your spaces is touched.
        </ConfirmDialog>
      )}
      {discarding && (
        <ConfirmDialog
          cancelLabel="Keep editing"
          confirmLabel="Discard changes"
          onClose={() => setDiscarding(false)}
          onConfirm={async () => finish(false)}
          title="Discard your changes?"
          tone="danger"
        >
          The dashboard goes back to how it was before you started editing.
        </ConfirmDialog>
      )}
    </Page>
  );
}
