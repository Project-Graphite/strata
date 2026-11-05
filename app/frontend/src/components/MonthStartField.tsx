import { useEffect, useState } from 'react';
import { formatDay, SegmentedControl, TextField } from '@project-graphite/ui';
import { dayKey } from '../agenda';

type Mode = 'calendar' | 'payday';

const shortDay = (day: string) => formatDay(day, { day: 'numeric', month: 'short' });

function currentPeriod(startDay: number, today: string) {
  const [year, month, date] = today.split('-').map(Number) as [number, number, number];
  const startMonth = date >= startDay ? month - 1 : month - 2;
  const start = new Date(Date.UTC(year, startMonth, startDay));
  const end = new Date(Date.UTC(year, startMonth + 1, startDay - 1));
  return [start, end].map((day) => day.toISOString().slice(0, 10)) as [string, string];
}

export function MonthStartField({ defaultValue, name, onChange }: { defaultValue: number; name: string; onChange?: (startDay: number | null) => void }) {
  const [mode, setMode] = useState<Mode>(defaultValue === 1 ? 'calendar' : 'payday');
  const [payday, setPayday] = useState(String(defaultValue === 1 ? 25 : defaultValue));
  const day = Number(payday);
  const valid = /^\d{1,2}$/.test(payday.trim()) && day >= 1 && day <= 28;
  const startDay = mode === 'calendar' ? 1 : valid ? day : null;
  const period = startDay && currentPeriod(startDay, dayKey(new Date()));
  useEffect(() => onChange?.(startDay), [onChange, startDay]);

  return (
    <div className="grid gap-3">
      <SegmentedControl
        label="Spending month"
        onChange={setMode}
        options={[
          { value: 'calendar', label: 'Calendar month' },
          { value: 'payday', label: 'From payday' },
        ]}
        value={mode}
      />
      {mode === 'payday' && (
        <TextField
          className="max-w-32"
          error={valid ? undefined : 'Choose a day from 1 to 28.'}
          inputMode="numeric"
          label="Payday"
          maxLength={2}
          onChange={(event) => setPayday(event.target.value)}
          value={payday}
        />
      )}
      <input name={name} type="hidden" value={startDay ?? ''} />
      {period && <p className="m-0 text-small text-muted">Each month runs {shortDay(period[0])} to {shortDay(period[1])}.</p>}
    </div>
  );
}
