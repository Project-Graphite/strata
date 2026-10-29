import { useState } from 'react';
import { Fieldset, FilterChip, Placeholder, Select, TextField, Toggle } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { timeZoneOptions } from '../../choices';
import { DevicePush, DevicePushSkeleton } from '../../components/DevicePush';
import { FormDialog } from '../../components/FormDialog';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { ProofFields, proofFrom } from '../../components/ProofFields';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, emailAddress, required, useFormErrors } from '../../validation';
import { Section } from '../../components/Page';
import { ButtonSkeleton, ChipsSkeleton, FieldSkeleton } from '../../components/Skeletons';
import { SettingsRow, SettingsRowSkeleton, SettingsRows, type Me, type TwoStepStatus } from './SettingsLayout';
import { CurrencyField } from '../../components/CurrencyField';
import { Button } from '../../components/Button';

const weekDays = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day))));
const monthStartOptions = Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));

export function ProfileSettings() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const twoStep = useResource<TwoStepStatus>('/me/two-step', true);
  const currencies = useResource<{ currencies: string[] }>('/exchange-rates', true);
  const profile = useAction();
  const email = useAction();
  const profileForm = useFormErrors();
  const emailForm = useFormErrors();
  const [changingEmail, setChangingEmail] = useState(false);
  const [weekend, setWeekend] = useState<number[]>();
  const [budgets, setBudgets] = useState<boolean>();

  if (me.error) return <LoadError error={me.error} onRetry={me.reload} />;
  if (twoStep.error) return <LoadError error={twoStep.error} onRetry={twoStep.reload} />;
  if (!me.data || !twoStep.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading your profile">
        <Section title="Profile">
          <FieldSkeleton />
        </Section>
        <Section title="Time and calendar">
          <div className="grid gap-4">
            <FieldSkeleton />
            <FieldSkeleton />
            <ChipsSkeleton count={7} />
          </div>
        </Section>
        <Section title="Money">
          <div className="grid gap-4">
            <FieldSkeleton hint />
            <FieldSkeleton hint />
          </div>
        </Section>
        <ButtonSkeleton width="w-16" />
        <Section title="Account">
          <SettingsRows>
            <SettingsRowSkeleton action={<ButtonSkeleton width="w-18" />} />
            <SettingsRowSkeleton row={1} />
          </SettingsRows>
        </Section>
        <Section title="Notifications">
          <DevicePushSkeleton />
        </Section>
      </Placeholder>
    );
  }
  const current = me.data;
  const weekendDays = weekend ?? current.weekendDays;
  const budgetsEnabled = budgets ?? current.budgetsEnabled;

  return (
    <>
      <form
        className="grid gap-8"
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
                weekStart: Number(values.get('weekStart')),
                weekendDays,
                monthStartDay: Number(values.get('monthStartDay')),
                budgetsEnabled,
              }),
            });
            me.mutate(() => next);
            auth.updateUser({ displayName: next.displayName, timeZone: next.timeZone });
            return 'Saved your profile.';
          }, 'Could not save your profile');
        }}
      >
        <Section title="Profile">
          <TextField autoComplete="name" defaultValue={current.displayName} label="Display name" maxLength={80} {...profileForm.field('displayName')} />
        </Section>
        <Section title="Time and calendar">
          <div className="grid gap-4">
            <Select
              defaultValue={current.timeZone}
              label="Time zone"
              name="timeZone"
              options={timeZoneOptions(current.timeZone)}
              placeholder="Choose a time zone"
              searchable
            />
            <Select defaultValue={String(current.weekStart)} label="Week starts on" name="weekStart" options={weekDays.map((label, day) => ({ value: String(day), label }))} />
            <Fieldset legend="Weekend days">
              <div className="flex flex-wrap gap-2">
                {weekDays.map((label, day) => (
                  <FilterChip
                    active={weekendDays.includes(day)}
                    key={label}
                    label={label}
                    onClick={() => setWeekend(weekendDays.includes(day) ? weekendDays.filter((other) => other !== day) : [...weekendDays, day])}
                  />
                ))}
              </div>
            </Fieldset>
          </div>
        </Section>
        <Section title="Money">
          <div className="grid gap-4">
            <CurrencyField
              codes={currencies.data?.currencies}
              defaultValue={current.homeCurrency ?? ''}
              hint="Spending, Recurring and net worth totals are shown in it."
              label="Home currency"
              name="homeCurrency"
              noneLabel="None, keep each currency separate"
            />
            <Select
              defaultValue={String(current.monthStartDay)}
              hint="Spending months run from this day to the day before it in the next month."
              label="Spending month starts on day"
              name="monthStartDay"
              options={monthStartOptions}
            />
            <Toggle checked={budgetsEnabled} description="Shows the Budgets tab and what is left to spend this month." label="Use budgets" onChange={setBudgets} />
          </div>
        </Section>
        <div>
          <Button disabled={profile.busy} label={profile.busy ? 'Saving…' : 'Save'} primary submit />
        </div>
      </form>

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
