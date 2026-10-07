import { useState } from 'react';
import { FormSkeleton, TextField, Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, emailAddress, required, useFormErrors } from '../../validation';
import { SettingsRow, SettingsRows, SettingsSection, type Me, type TwoStepStatus } from './SettingsLayout';

export function ProfileSettings() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const currencies = useResource<{ currencies: string[] }>('/exchange-rates', true);
  const profile = useAction();
  const email = useAction();
  const notifications = useAction();
  const profileForm = useFormErrors();
  const emailForm = useFormErrors();
  const [changingEmail, setChangingEmail] = useState(false);

  if (me.error) return <LoadError error={me.error} onRetry={me.reload} />;
  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!me.data || !twoStep.data) return <FormSkeleton fields={3} />;
  const current = me.data;
  const zones = [...new Set([current.timeZone, ...Intl.supportedValuesOf('timeZone')])];

  return (
    <div className="fade-in grid max-w-3xl gap-10">
      <SettingsSection title="Profile">
        <form
          className="grid gap-4"
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
                  homeCurrency: String(values.get('homeCurrency')) || null,
                }),
              });
              me.mutate(() => next);
              auth.updateUser({ displayName: next.displayName, timeZone: next.timeZone });
              return 'Saved.';
            }, 'Could not save your profile');
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
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
            <label className="field-label">
              Home currency
              <select defaultValue={current.homeCurrency ?? ''} key={currencies.data ? 'loaded' : 'loading'} name="homeCurrency">
                <option value="">None, keep each currency separate</option>
                {[...new Set([...(current.homeCurrency ? [current.homeCurrency] : []), ...(currencies.data?.currencies ?? [])])].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary-button inline-flex w-fit" disabled={profile.busy} type="submit">
            {profile.busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRows>
          <SettingsRow
            action={
              <button className="secondary-button px-3 py-2 text-sm" onClick={() => setChangingEmail(true)} type="button">
                Change
              </button>
            }
            label="Email"
          >
            {current.email}
          </SettingsRow>
          <SettingsRow label="Handle">@{current.handle}</SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection title="Notifications">
        <Toggle
          checked={current.tidySummary}
          description="Mondays at 09:00, only when Tidy finds something."
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
        <Toggle
          checked={current.weeklyReview}
          description="Sundays at 18:00, with a link that writes the review page for you."
          disabled={notifications.busy}
          label="Weekly review reminder"
          onChange={(weeklyReview) =>
            void notifications.run(async () => {
              const next = await auth.request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ weeklyReview }) });
              me.mutate(() => next);
              return weeklyReview ? 'You will be reminded on Sundays.' : 'Weekly review reminders are off.';
            }, 'Could not change the setting')
          }
        />
      </SettingsSection>

      {changingEmail && (
        <FormDialog
          busy={email.busy}
          busyLabel="Sending…"
          onClose={() => setChangingEmail(false)}
          onSubmit={(target) => {
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
              .then((sent) => sent && setChangingEmail(false));
          }}
          submitLabel="Send link"
          title="Change email"
        >
          <p className="m-0 text-sm text-muted">The new address takes over once you open the link we send to it.</p>
          <TextField autoComplete="email" autoFocus inputMode="email" label="New email" type="email" {...emailForm.field('email')} />
          <ProofFields form={emailForm} twoStep={twoStep.data.enabled} />
        </FormDialog>
      )}
    </div>
  );
}
