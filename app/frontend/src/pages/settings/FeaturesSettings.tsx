import { useLocation } from 'react-router';
import { Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Section } from '../../components/Page';
import { featureCatalogue } from '../../features';
import { useAction } from '../../useAction';
import { SettingsRows } from './SettingsLayout';

export function FeaturesSettings() {
  const auth = useAuth();
  const saving = useAction();
  const location = useLocation();
  const asked = featureCatalogue.find((feature) => feature.key === (location.state as { feature?: string } | null)?.feature);
  const chosen = auth.user?.features ?? [];

  function change(key: string, on: boolean) {
    const features = on ? [...chosen, key] : chosen.filter((shown) => shown !== key);
    void saving.run(async () => {
      const saved = await auth.request<{ features: string[] }>('/me', { method: 'PATCH', body: JSON.stringify({ features }) });
      auth.updateUser({ features: saved.features });
      return '';
    }, 'Could not change your features');
  }

  return (
    <Section
      description="The ones you turn on appear in the sidebar. Turning one off hides it and keeps everything in it."
      title="Features"
    >
      {asked && !chosen.includes(asked.key) && <p className="notice m-0">Turn on {asked.label} to open it.</p>}
      <SettingsRows>
        {featureCatalogue.map((feature) => (
          <Toggle
            checked={chosen.includes(feature.key)}
            description={feature.description}
            disabled={saving.busy}
            key={feature.key}
            label={feature.label}
            onChange={(on) => change(feature.key, on)}
          />
        ))}
      </SettingsRows>
    </Section>
  );
}
