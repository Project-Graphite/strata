import { FormSkeleton, TextField, Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, emailAddress, required, useFormErrors } from '../../validation';
import { SettingsSection, type Me, type TwoStepStatus } from './SettingsLayout';

export function ProfileSettings() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const profile = useAction();
  const email = useAction();
  const notifications = useAction();
  const profileForm = useFormErrors();
  const emailForm = useFormErrors();

  if (me.error) return <p className="error-message">{me.error}</p>;
  if (!me.data || !twoStep.data) return <FormSkeleton fields={3} />;
  const current = me.data;
  const zones = [...new Set([current.timeZone, ...Intl.supportedValuesOf('timeZone')])];

  return (
    <div className="fade-in grid max-w-3xl gap-12">
      <SettingsSection description="How you appear to people in the spaces you share." title="Profile">
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            if (
              !profileForm.check(target, {
                displayName: [required('Enter a display name.'), atMost(80, 'Use at most 80 characters.')],
              })
            ) {
              return;
            }
            const values = new FormData(target);
            void profile.run(async () => {
              const next = await auth.request<Me>('/me', {
                method: 'PATCH',
                body: JSON.stringify({
                  displayName: String(values.get('displayName')).trim(),
                  timeZone: String(values.get('timeZone')),
                }),
              });
              me.mutate(() => next);
              auth.updateUser({ displayName: next.displayName, timeZone: next.timeZone });
              return 'Saved.';
            }, 'Could not save your profile');
          }}
        >
          <TextField
            autoComplete="name"
            defaultValue={current.displayName}
            label="Display name"
            maxLength={80}
            {...profileForm.field('displayName')}
          />
          <label className="field-label">
            Time zone
            <select defaultValue={current.timeZone} name="timeZone">
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <p className="mono-sm m-0 text-faint">@{current.handle} · handles cannot be changed</p>
          {profile.status}
          <button className="primary-button inline-flex w-fit" disabled={profile.busy} type="submit">
            {profile.busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection description="What Strata puts in your inbox on its own." title="Notifications">
        <div className="mt-5 grid gap-3">
          <Toggle
            checked={current.tidySummary}
            description="Every Monday at 09:00, if Tidy finds extra copies, old uploads or subscriptions to check. Nothing is sent when there is nothing to tidy."
            disabled={notifications.busy}
            label="Weekly Tidy summary"
            onChange={(tidySummary) =>
              void notifications.run(async () => {
                const next = await auth.request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ tidySummary }) });
                me.mutate(() => next);
                return tidySummary ? 'You will get a Tidy summary on Mondays.' : 'Weekly Tidy summaries are off.';
              }, 'Could not change the setting')
            }
          />
          {notifications.status}
        </div>
      </SettingsSection>

      <SettingsSection
        description={`Signed in as ${current.email}. A new address takes over once you open the link sent to it, and your current address is told about the change.`}
        title="Email"
      >
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            if (
              !emailForm.check(target, {
                email: [required('Enter the new email address.'), emailAddress],
                password: [required('Enter your password to confirm.')],
                ...(twoStep.data?.enabled ? { code: [required('Enter a code to confirm.')] } : {}),
              })
            ) {
              return;
            }
            const values = new FormData(target);
            void email
              .run(async () => {
                await auth.request('/me/email', {
                  method: 'POST',
                  body: JSON.stringify({ email: String(values.get('email')).trim(), ...proofFrom(target) }),
                });
                return 'Check the new inbox for a confirmation link.';
              }, 'Could not start the email change')
              .then((changed) => changed && target.reset());
          }}
        >
          <TextField autoComplete="email" inputMode="email" label="New email" type="email" {...emailForm.field('email')} />
          <ProofFields form={emailForm} twoStep={twoStep.data.enabled} />
          {email.status}
          <button className="secondary-button inline-flex w-fit" disabled={email.busy} type="submit">
            {email.busy ? 'Sending…' : 'Change email'}
          </button>
        </form>
      </SettingsSection>
    </div>
  );
}
