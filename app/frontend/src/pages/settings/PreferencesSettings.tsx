import { useState } from 'react';
import { Fieldset, FilterChip, Placeholder, Select } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { timeZoneOptions } from '../../choices';
import { timeFormatOptions, type TimeFormat } from '../../time';
import { Button } from '../../components/Button';
import { CurrencyField } from '../../components/CurrencyField';
import { LoadError } from '../../components/LoadError';
import { MonthStartField } from '../../components/MonthStartField';
import { Section } from '../../components/Page';
import { ButtonSkeleton, ChipsSkeleton, FieldSkeleton } from '../../components/Skeletons';
import { Toggle } from '../../components/Toggle';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import type { Me } from './SettingsLayout';

const weekDays = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day))));

export function PreferencesSettings() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const currencies = useResource<{ currencies: string[] }>('/exchange-rates', true);
  const saving = useAction();
  const form = useFormErrors();
  const [weekend, setWeekend] = useState<number[]>();
  const [budgets, setBudgets] = useState<boolean>();

  if (me.error) return <LoadError error={me.error} onRetry={me.reload} />;
  if (!me.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading your preferences">
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
        <ButtonSkeleton large width="w-32" />
      </Placeholder>
    );
  }
  const current = me.data;
  const weekendDays = weekend ?? current.weekendDays;
  const budgetsEnabled = budgets ?? current.budgetsEnabled;

  return (
    <form
      className="grid gap-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const target = event.currentTarget;
        if (!form.check(target, { monthStartDay: [required('Choose a payday from 1 to 28.')] })) return;
        const values = new FormData(target);
        void saving.run(async () => {
          const next = await auth.request<Me>('/me', {
            method: 'PATCH',
            body: JSON.stringify({
              timeZone: String(values.get('timeZone')),
              timeFormat: String(values.get('timeFormat')),
              homeCurrency: String(values.get('homeCurrency')) || null,
              weekStart: Number(values.get('weekStart')),
              weekendDays,
              monthStartDay: Number(values.get('monthStartDay')),
              budgetsEnabled,
            }),
          });
          me.mutate(() => next);
          auth.updateUser({ timeZone: next.timeZone, timeFormat: next.timeFormat });
          return 'Saved your preferences.';
        }, 'Could not save your preferences');
      }}
    >
      <Section title="Time and calendar">
        <div className="grid gap-4">
          <Select defaultValue={current.timeZone} label="Time zone" name="timeZone" options={timeZoneOptions(current.timeZone)} placeholder="Choose a time zone" searchable />
          <Select<TimeFormat> defaultValue={current.timeFormat} label="Time format" name="timeFormat" options={timeFormatOptions} />
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
          <CurrencyField codes={currencies.data?.currencies} defaultValue={current.homeCurrency ?? ''} label="Home currency" name="homeCurrency" noneLabel="None, keep each currency separate" />
          <MonthStartField defaultValue={current.monthStartDay} name="monthStartDay" />
          <div className="panel-rows">
            <Toggle checked={budgetsEnabled} description="Shows the Budgets tab and what is left to spend this month." label="Use budgets" onChange={setBudgets} />
          </div>
        </div>
      </Section>
      <div>
        <Button disabled={saving.busy} label={saving.busy ? 'Saving…' : 'Save changes'} large primary submit />
      </div>
    </form>
  );
}
