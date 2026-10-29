import { Link, useLocation, type Location } from 'react-router';
import { Banner, Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Section } from '../../components/Page';
import { appCatalogue, enabledApps } from '../../apps';
import { useAction } from '../../useAction';

export function AppsSettings() {
  const auth = useAuth();
  const saving = useAction();
  const location = useLocation();
  const state = location.state as { app: string; from: Location } | null;
  const asked = appCatalogue.find((app) => app.key === state?.app);
  const keys = enabledApps(auth.user?.features).map((app) => app.key);

  function toggle(key: string, label: string, on: boolean) {
    void saving.run(async () => {
      const saved = await auth.request<{ features: string[] }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ features: on ? [...keys, key] : keys.filter((shown) => shown !== key) }),
      });
      auth.updateUser({ features: saved.features });
      return `Turned ${on ? 'on' : 'off'} ${label}.`;
    }, 'Could not change your apps');
  }

  return (
    <Section description="Turning an app off hides it and keeps everything in it." title="Apps">
      {asked &&
        (keys.includes(asked.key) ? (
          <Banner>
            <Link to={`${state!.from.pathname}${state!.from.search}`}>Open {asked.label}</Link>
          </Banner>
        ) : (
          <Banner>Turn on {asked.label} to open it.</Banner>
        ))}
      <div className="panel-rows">
        {appCatalogue.map((app) => (
          <Toggle
            checked={keys.includes(app.key)}
            description={app.description}
            disabled={saving.busy}
            key={app.key}
            label={app.label}
            onChange={(on) => toggle(app.key, app.label, on)}
          />
        ))}
      </div>
    </Section>
  );
}
