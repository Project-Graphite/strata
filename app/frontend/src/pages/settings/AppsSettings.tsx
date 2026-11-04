import { Link, useLocation, type Location } from 'react-router';
import { Banner, Icon, ListRow, TextLink } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Section } from '../../components/Page';
import { appCatalogue, enabledApps, type AppEntry } from '../../apps';
import { androidReleasesPageUrl, isNativeAndroid } from '../../native-capture';
import { useAction } from '../../useAction';

const groups: { scope: AppEntry['scope']; title: string; description: string }[] = [
  { scope: 'account', title: 'Yours', description: 'Only you see these, whichever space you are in.' },
  { scope: 'space', title: 'In spaces', description: 'These follow the space you are in and are shared with its members.' },
];

export function AppsSettings() {
  const auth = useAuth();
  const saving = useAction();
  const location = useLocation();
  const state = location.state as { app: string; from: Location } | null;
  const asked = appCatalogue.find((app) => app.key === state?.app);
  const keys = enabledApps(auth.user?.features).map((app) => app.key);

  function toggle(app: AppEntry) {
    const on = !keys.includes(app.key);
    void saving.run(async () => {
      const saved = await auth.request<{ features: string[] }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ features: on ? [...keys, app.key] : keys.filter((shown) => shown !== app.key) }),
      });
      auth.updateUser({ features: saved.features });
      return `Turned ${on ? 'on' : 'off'} ${app.label}.`;
    }, 'Could not change your apps');
  }

  return (
    <>
      <Section description="Tap an app to turn it on or off. Turning one off hides it and keeps everything in it." title="Apps">
        {asked &&
          (keys.includes(asked.key) ? (
            <Banner>
              <Link to={`${state!.from.pathname}${state!.from.search}`}>Open {asked.label}</Link>
            </Banner>
          ) : (
            <Banner>Turn on {asked.label} to open it.</Banner>
          ))}
        <div className="grid gap-6">
          {groups.map((group) => (
            <div className="grid gap-3" key={group.scope}>
              <p className="m-0 text-small text-muted">
                <span className="font-medium text-ink">{group.title}</span> · {group.description}
              </p>
              <ul aria-label={`${group.title} apps`} className="app-tiles">
                {appCatalogue
                  .filter((app) => app.scope === group.scope)
                  .map((app) => {
                    const on = keys.includes(app.key);
                    return (
                      <li className={`app-tile ${on ? '' : 'app-tile-off'}`} key={app.key}>
                        <button aria-describedby={`app-${app.key}-about`} aria-pressed={on} disabled={saving.busy} onClick={() => toggle(app)} title={app.description} type="button">
                          <span className="app-tile-icon">
                            <Icon name={app.icon} size={18} />
                          </span>
                          <span className="app-tile-label">{app.label}</span>
                          <span className="sr-only" id={`app-${app.key}-about`}>
                            {app.description}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
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
