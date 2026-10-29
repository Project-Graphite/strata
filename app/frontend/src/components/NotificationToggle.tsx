import { Placeholder, Toggle } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Me } from '../pages/settings/SettingsLayout';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';
import { Section } from './Page';
import { ToggleSkeleton } from './Skeletons';

export function NotificationToggle({
  description,
  field,
  label,
  offMessage,
  onMessage,
}: {
  description: string;
  field: 'weeklyReview' | 'tidySummary';
  label: string;
  offMessage: string;
  onMessage: string;
}) {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const saving = useAction();

  return (
    <Section title="Notifications">
      {me.error ? (
        <LoadError compact error={me.error} onRetry={me.reload} />
      ) : (
        <div className="panel-rows">
          {me.data ? (
            <Toggle
              checked={me.data[field]}
              description={description}
              disabled={saving.busy}
              label={label}
              onChange={(on) =>
                void saving.run(async () => {
                  const next = await auth.request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ [field]: on }) });
                  me.mutate(() => next);
                  return on ? onMessage : offMessage;
                }, 'Could not change the setting')
              }
            />
          ) : (
            <Placeholder label="Loading the setting">
              <ToggleSkeleton description />
            </Placeholder>
          )}
        </div>
      )}
    </Section>
  );
}
