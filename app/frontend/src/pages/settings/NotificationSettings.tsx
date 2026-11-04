import { Placeholder } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { DevicePush } from '../../components/DevicePush';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { ToggleSkeleton } from '../../components/Skeletons';
import { Toggle } from '../../components/Toggle';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import type { Me } from './SettingsLayout';

const emailKinds: [kind: string, label: string][] = [
  ['task_assigned', 'Tasks assigned to you'],
  ['task_due', 'Tasks that are due'],
  ['comment', 'Comments and mentions'],
  ['watching', 'Changes to things you watch'],
  ['event_soon', 'Events starting soon'],
  ['birthday', 'Birthdays'],
  ['subscription_due', 'Subscriptions that are due'],
  ['payment_due', 'Payments that are due'],
  ['budget_alert', 'Budget alerts'],
  ['member_joined', 'People joining your spaces'],
  ['role_changed', 'Your role in a space changing'],
  ['removed_from_space', 'Being removed from a space'],
  ['weekly_review', 'Weekly review'],
  ['tidy_summary', 'Tidy summaries'],
];

function EmailNotifications() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const saving = useAction();

  if (me.error) return <LoadError compact error={me.error} onRetry={me.reload} />;
  if (!me.data) {
    return (
      <Placeholder label="Loading email notifications">
        <div className="panel-rows">
          <ToggleSkeleton />
          <ToggleSkeleton />
          <ToggleSkeleton />
        </div>
      </Placeholder>
    );
  }
  const chosen = me.data.emailKinds;
  return (
    <div className="panel-rows">
      {emailKinds.map(([kind, label]) => (
        <Toggle
          checked={chosen.includes(kind)}
          disabled={saving.busy}
          key={kind}
          label={label}
          onChange={(on) =>
            void saving.run(async () => {
              const next = await auth.request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ emailKinds: on ? [...chosen, kind] : chosen.filter((other) => other !== kind) }) });
              me.mutate(() => next);
              return on ? `${label} now also reach your email.` : `${label} no longer reach your email.`;
            }, 'Could not change the email notifications')
          }
        />
      ))}
    </div>
  );
}

export function NotificationSettings() {
  return (
    <>
      <Section description="Strata keeps every notification in the bell. Choose what also reaches this device." title="This device">
        <DevicePush />
      </Section>
      <Section description="Choose what also reaches your email. Notifications that arrive close together come in one email, and anything you have already read in Strata is left out." title="Email">
        <EmailNotifications />
      </Section>
    </>
  );
}
