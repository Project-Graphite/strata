import { useState } from 'react';
import { Fieldset, FilterChip, Placeholder, Select } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { timeZoneOptions } from '../../choices';
import { timeFormatOptions, type TimeFormat } from '../../time';
import { CurrencyField } from '../../components/CurrencyField';
import { LoadError } from '../../components/LoadError';
import { MonthStartField } from '../../components/MonthStartField';
import { Section } from '../../components/Page';
import { SavedForm } from '../../components/SavedForm';
import { ChipsSkeleton, FieldSkeleton } from '../../components/Skeletons';
import { Toggle } from '../../components/Toggle';
import { useResource } from '../../useResource';
import type { Me } from './SettingsLayout';

const weekDays = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day))));

type Preferences = Pick<Me, 'timeZone' | 'weekendDays' | 'budgetsEnabled'> & { timeFormat: TimeFormat; homeCurrency: string; weekStart: string; monthStartDay: number | null };

function preferencesOf(me: Me): Preferences {
  return {
    timeZone: me.timeZone,
    timeFormat: me.timeFormat,
    homeCurrency: me.homeCurrency ?? '',
    weekStart: String(me.weekStart),
    weekendDays: [...me.weekendDays].sort(),
    monthStartDay: me.monthStartDay,
    budgetsEnabled: me.budgetsEnabled,
  };
}

export function PreferencesSettings() {
  const auth = useAuth();
  const me = useResource<Me>('/me', true);
  const currencies = useResource<{ currencies: string[] }>('/exchange-rates', true);
  const [changes, setChanges] = useState<Partial<Preferences>>({});

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
      </Placeholder>
    );
  }
  const initial = preferencesOf(me.data);
  const values = { ...initial, ...changes };
  const change = (next: Partial<Preferences>) => setChanges((current) => ({ ...current, ...next }));

  return (
    <SavedForm
      className="grid gap-8"
      initial={initial}
      invalid={values.monthStartDay === null}
      label="Preferences"
      onSave={async () => {
        const next = await auth.request<Me>('/me', {
          method: 'PATCH',
          body: JSON.stringify({ ...values, homeCurrency: values.homeCurrency || null, weekStart: Number(values.weekStart) }),
        });
        me.mutate(() => next);
        auth.updateUser({ timeZone: next.timeZone, timeFormat: next.timeFormat });
        setChanges({});
      }}
      values={values}
    >
      <Section title="Time and calendar">
        <div className="grid gap-4">
          <Select label="Time zone" onChange={(timeZone) => change({ timeZone })} options={timeZoneOptions(initial.timeZone)} placeholder="Choose a time zone" searchable value={values.timeZone} />
          <Select<TimeFormat> label="Time format" onChange={(timeFormat) => change({ timeFormat })} options={timeFormatOptions} value={values.timeFormat} />
          <Select label="Week starts on" onChange={(weekStart) => change({ weekStart })} options={weekDays.map((label, day) => ({ value: String(day), label }))} value={values.weekStart} />
          <Fieldset legend="Weekend days">
            <div className="flex flex-wrap gap-2">
              {weekDays.map((label, day) => (
                <FilterChip
                  active={values.weekendDays.includes(day)}
                  key={label}
                  label={label}
                  onClick={() => change({ weekendDays: (values.weekendDays.includes(day) ? values.weekendDays.filter((other) => other !== day) : [...values.weekendDays, day]).sort() })}
                />
              ))}
            </div>
          </Fieldset>
        </div>
      </Section>
      <Section title="Money">
        <div className="grid gap-4">
          <CurrencyField codes={currencies.data?.currencies} label="Home currency" noneLabel="None, keep each currency separate" onChange={(homeCurrency) => change({ homeCurrency })} value={values.homeCurrency} />
          <MonthStartField defaultValue={initial.monthStartDay ?? 1} key={initial.monthStartDay} name="monthStartDay" onChange={(monthStartDay) => monthStartDay !== values.monthStartDay && change({ monthStartDay })} />
          <div className="panel-rows">
            <Toggle checked={values.budgetsEnabled} description="Shows the Budgets tab and what is left to spend this month." label="Use budgets" onChange={(budgetsEnabled) => change({ budgetsEnabled })} />
          </div>
        </div>
      </Section>
    </SavedForm>
  );
}
