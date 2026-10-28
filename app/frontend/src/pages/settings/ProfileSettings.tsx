import { useState } from 'react';
import { Placeholder, Select, TextField, Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { timeZoneOptions } from '../../choices';
import { DevicePush, DevicePushSkeleton } from '../../components/DevicePush';
import { FormDialog } from '../../components/FormDialog';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { clockTime, timeFormatOptions, type TimeFormat } from '../../time';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, emailAddress, required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { ButtonSkeleton, FieldSkeleton, ToggleSkeleton } from '../../components/Skeletons';
import { SettingsRow, SettingsRowSkeleton, SettingsRows, type Me, type TwoStepStatus } from './SettingsLayout';
import { CurrencyField } from '../../components/CurrencyField';
import { Button } from '../../components/Button';

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
  if (!me.data || !twoStep.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading your profile">
        <Section title="Profile">
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton hint />
            </div>
            <ButtonSkeleton width="w-16" />
          </div>
        </Section>
        <Section title="Account">
          <SettingsRows>
            <SettingsRowSkeleton action={<ButtonSkeleton width="w-18" />} />
            <SettingsRowSkeleton row={1} />
          </SettingsRows>
        </Section>
        <Section title="Notifications">
          <div className="panel-rows">
            {auth.user?.features.includes('tidy') && <ToggleSkeleton description />}
            <ToggleSkeleton description />
          </div>
          <DevicePushSkeleton />
        </Section>
      </Placeholder>
    );
  }
  const current = me.data;

  return (
    <>
      <Section title="Profile">
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
                  timeFormat: String(values.get('timeFormat')),
                  homeCurrency: String(values.get('homeCurrency')) || null,
                }),
              });
              me.mutate(() => next);
              auth.updateUser({ displayName: next.displayName, timeZone: next.timeZone, timeFormat: next.timeFormat });
              return 'Saved your profile.';
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
            <Select
              defaultValue={current.timeZone}
              label="Time zone"
              name="timeZone"
              options={timeZoneOptions(current.timeZone)}
              placeholder="Choose a time zone"
              searchable
            />
            <Select<TimeFormat> defaultValue={current.timeFormat} label="Time format" name="timeFormat" options={timeFormatOptions} />
            <CurrencyField
              codes={currencies.data?.currencies}
              defaultValue={current.homeCurrency ?? ''}
              hint="Spending, Recurring and net worth totals are shown in it."
              label="Home currency"
              name="homeCurrency"
              noneLabel="None, keep each currency separate"
            />
          </div>
          <Button disabled={profile.busy} label={profile.busy ? 'Saving…' : 'Save'} primary submit />
        </form>
      </Section>

      <Section title="Account">
        <SettingsRows>
          <SettingsRow
            action={
              <Button label="Change" onClick={() => setChangingEmail(true)} />
            }
            label="Email"
          >
            {current.email}
          </SettingsRow>
          <SettingsRow label="Handle">@{current.handle}</SettingsRow>
        </SettingsRows>
      </Section>

      <Section title="Notifications">
        <div className="panel-rows">
          {auth.user?.features.includes('tidy') && (
            <Toggle
              checked={current.tidySummary}
              description={`Mondays at ${clockTime('09:00')}, only when Tidy finds something.`}
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
          )}
          <Toggle
            checked={current.weeklyReview}
            description={`Sundays at ${clockTime('18:00')}, with a link that writes the review page for you.`}
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
        </div>
        <DevicePush />
      </Section>

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
          <Hint>The new address takes over once you open the link we send to it.</Hint>
          <TextField autoComplete="email" autoFocus inputMode="email" label="New email" type="email" {...emailForm.field('email')} />
          <ProofFields form={emailForm} twoStep={twoStep.data.enabled} />
        </FormDialog>
      )}
    </>
  );
}
