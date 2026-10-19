import Alert from '@mui/material/Alert';
import { useEffect, useState } from 'react';
import { Link, useLocation, type Location } from 'react-router';
import { IconButton, Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Section } from '../../components/Page';
import { appCatalogue, enabledApps } from '../../apps';
import { useAction } from '../../useAction';
import { SettingsRow, SettingsRows } from './SettingsLayout';

type Direction = 'up' | 'down';

export function AppsSettings() {
  const auth = useAuth();
  const saving = useAction();
  const location = useLocation();
  const state = location.state as { app: string; from: Location } | null;
  const asked = appCatalogue.find((app) => app.key === state?.app);
  const chosen = enabledApps(auth.user?.features);
  const keys = chosen.map((app) => app.key);
  const [moved, setMoved] = useState<{ key: string; direction: Direction }>();

  useEffect(() => {
    if (!moved || saving.busy) return;
    const button = (direction: Direction) => document.getElementById(`move-${moved.key}-${direction}`) as HTMLButtonElement | null;
    const preferred = button(moved.direction);
    (preferred && !preferred.disabled ? preferred : button(moved.direction === 'up' ? 'down' : 'up'))?.focus();
    setMoved(undefined);
  }, [moved, saving.busy]);

  function save(features: string[], done: string) {
    void saving.run(async () => {
      const saved = await auth.request<{ features: string[] }>('/me', { method: 'PATCH', body: JSON.stringify({ features }) });
      auth.updateUser({ features: saved.features });
      return done;
    }, 'Could not change your apps');
  }

  function change(key: string, on: boolean) {
    save(on ? [...keys, key] : keys.filter((shown) => shown !== key), `Turned ${on ? 'on' : 'off'} ${appCatalogue.find((app) => app.key === key)!.label}.`);
  }

  function move(index: number, direction: Direction) {
    const next = [...keys];
    const other = direction === 'up' ? index - 1 : index + 1;
    [next[index], next[other]] = [next[other], next[index]];
    setMoved({ key: keys[index], direction });
    save(next, `Moved ${chosen[index].label} ${direction}.`);
  }

  return (
    <>
      <Section description="The ones you turn on appear in your menu. Turning one off hides it and keeps everything in it." title="Apps">
        {asked &&
          (keys.includes(asked.key) ? (
            <Alert className="m-0" severity="info">
              <Link to={`${state!.from.pathname}${state!.from.search}`}>Open {asked.label}</Link>
            </Alert>
          ) : (
            <Alert className="m-0" severity="info">Turn on {asked.label} to open it.</Alert>
          ))}
        <SettingsRows>
          {appCatalogue.map((app) => (
            <Toggle
              checked={keys.includes(app.key)}
              description={app.description}
              disabled={saving.busy}
              key={app.key}
              label={app.label}
              onChange={(on) => change(app.key, on)}
            />
          ))}
        </SettingsRows>
      </Section>
      {chosen.length > 1 && (
        <Section description="Your menu lists the apps you turned on in this order, after Home." title="Order">
          <SettingsRows>
            {chosen.map((app, index) => (
              <SettingsRow
                action={
                  <>
                    <IconButton
                      disabled={saving.busy || index === 0}
                      icon="chevron-up"
                      id={`move-${app.key}-up`}
                      label={`Move ${app.label} up`}
                      onClick={() => move(index, 'up')}
                    />
                    <IconButton
                      disabled={saving.busy || index === chosen.length - 1}
                      icon="chevron-down"
                      id={`move-${app.key}-down`}
                      label={`Move ${app.label} down`}
                      onClick={() => move(index, 'down')}
                    />
                  </>
                }
                key={app.key}
                label={app.label}
              />
            ))}
          </SettingsRows>
        </Section>
      )}
    </>
  );
}
