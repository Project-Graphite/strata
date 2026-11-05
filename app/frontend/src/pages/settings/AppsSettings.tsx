import Switch from '@mui/material/Switch';
import { useId } from 'react';
import { Link, useLocation, type Location } from 'react-router';
import { Badge, Banner, Icon, ListRow, TextLink } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Section } from '../../components/Page';
import { appCatalogue, orderedApps, type AppEntry } from '../../apps';
import { phoneTabCount } from '../../navigation';
import { androidReleasesPageUrl, isNativeAndroid } from '../../native-capture';
import { useReorder } from '../../reorder';
import { useAction } from '../../useAction';

export function AppsSettings() {
  const auth = useAuth();
  const saving = useAction();
  const location = useLocation();
  const helpId = useId();
  const state = location.state as { app: string; from: Location } | null;
  const asked = appCatalogue.find((app) => app.key === state?.app);
  const features = auth.user?.features ?? [];
  const apps = orderedApps(auth.user?.appOrder);
  const tabbed = apps.filter((app) => features.includes(app.key)).slice(0, phoneTabCount);

  function save(changes: { appOrder?: string[]; features?: string[] }, message: string, fallback: string) {
    const before = { appOrder: auth.user?.appOrder, features };
    auth.updateUser(changes);
    const send = async (fields: typeof changes) => {
      const saved = await auth.request<{ appOrder: string[]; features: string[] }>('/me', { method: 'PATCH', body: JSON.stringify(fields) });
      auth.updateUser({ appOrder: saved.appOrder, features: saved.features });
    };
    void saving
      .run(async () => {
        await send(changes);
        return {
          message,
          undo: async () => {
            auth.updateUser(before);
            await send({ ...(changes.appOrder ? { appOrder: before.appOrder ?? [] } : {}), ...(changes.features ? { features: before.features } : {}) });
            return '';
          },
        };
      }, fallback)
      .then((done) => done || auth.updateUser(before));
  }

  const reorder = useReorder({
    keys: apps.map((app) => app.key),
    label: (key) => appCatalogue.find((app) => app.key === key)!.label,
    onCommit: (appOrder) => save({ appOrder }, 'Saved the order of your apps.', 'Could not save the order of your apps'),
  });
  const shown = reorder.order.map((key) => apps.find((app) => app.key === key)!);

  function toggle(app: AppEntry, on: boolean) {
    save({ features: on ? [...features, app.key] : features.filter((key) => key !== app.key) }, `Turned ${on ? 'on' : 'off'} ${app.label}.`, 'Could not change your apps');
  }

  return (
    <>
      <Section
        description="Turn apps on or off, and drag them into the order you want. The order sets your sidebar and search, and the first two apps become tabs on a phone. Turning an app off hides it and keeps everything in it."
        title="Apps"
      >
        {asked &&
          (features.includes(asked.key) ? (
            <Banner>
              <Link to={`${state!.from.pathname}${state!.from.search}`}>Open {asked.label}</Link>
            </Banner>
          ) : (
            <Banner>Turn on {asked.label} to open it.</Banner>
          ))}
        <p className="sr-only" id={helpId}>
          Press Space to pick up an app, the arrow keys to move it and Space again to drop it. Escape puts it back.
        </p>
        <ol aria-label="Your apps, in order" className="app-order">
          {shown.map((app, index) => (
            <AppRow
              app={app}
              busy={saving.busy}
              handle={{ ...reorder.handle(app.key), 'aria-describedby': helpId, 'aria-label': `Move ${app.label}, position ${index + 1} of ${shown.length}` }}
              item={reorder.item(app.key)}
              key={app.key}
              on={features.includes(app.key)}
              onToggle={(on) => toggle(app, on)}
              tab={tabbed.includes(app)}
            />
          ))}
        </ol>
        {reorder.status}
      </Section>
      {!isNativeAndroid() && (
        <Section title="On your phone">
          <ul className="panel-rows">
            <ListRow
              lead={<Icon name="download" size={18} />}
              meta="Installs like an app and records bank texts and payment notifications in Spending."
              title="Strata for Android"
              trail={
                <TextLink external href={androidReleasesPageUrl}>
                  Download
                </TextLink>
              }
            />
          </ul>
        </Section>
      )}
    </>
  );
}

function AppRow({
  app,
  busy,
  handle,
  item,
  on,
  onToggle,
  tab,
}: {
  app: AppEntry;
  busy: boolean;
  handle: ReturnType<ReturnType<typeof useReorder>['handle']> & { 'aria-describedby': string; 'aria-label': string };
  item: ReturnType<ReturnType<typeof useReorder>['item']>;
  on: boolean;
  onToggle: (on: boolean) => void;
  tab: boolean;
}) {
  const labelId = useId();
  return (
    <li className="app-order-item" data-off={!on || undefined} {...item}>
      <button className="reorder-handle" title="Drag to reorder, or press Space" type="button" {...handle}>
        <Icon name="grip" size={16} />
      </button>
      <span aria-hidden="true" className="app-tile-icon">
        <Icon name={app.icon} size={18} />
      </span>
      <span className="app-order-text">
        <span className="app-order-label" id={labelId}>
          <span className="truncate">{app.label}</span>
          {tab && <Badge tone="muted">Phone tab</Badge>}
        </span>
        <span className="app-order-about" title={app.description}>
          {app.description}
        </span>
      </span>
      <Switch checked={on} disabled={busy} edge="end" onChange={(event) => onToggle(event.target.checked)} slotProps={{ input: { 'aria-labelledby': labelId } }} />
    </li>
  );
}
