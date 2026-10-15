import { useMemo } from 'react';
import { Select } from '@project-graphite/ui';

export type TimeFormat = 'auto' | '12h' | '24h';

export const timeFormatOptions: { value: TimeFormat; label: string }[] = [
  { value: 'auto', label: 'Same as this device' },
  { value: '12h', label: '12-hour (1:30 PM)' },
  { value: '24h', label: '24-hour (13:30)' },
];

let hour12: boolean | undefined;

export function applyTimeFormat(format: TimeFormat | undefined) {
  hour12 = format === '12h' ? true : format === '24h' ? false : undefined;
}

export const timeOptions = (): Intl.DateTimeFormatOptions => (hour12 === undefined ? {} : { hour12 });

export function clockTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...timeOptions() });
}

const everyStep = (step: number) =>
  Array.from({ length: (24 * 60) / step }, (_, index) => `${String(Math.floor((index * step) / 60)).padStart(2, '0')}:${String((index * step) % 60).padStart(2, '0')}`);

export function TimeField({
  'aria-label': ariaLabel,
  defaultValue,
  disabled,
  emptyLabel = 'No time',
  label,
  name,
  onChange,
  step = 15,
  value,
}: {
  'aria-label'?: string;
  defaultValue?: string;
  disabled?: boolean;
  emptyLabel?: string;
  label?: string;
  name?: string;
  onChange?: (value: string) => void;
  step?: number;
  value?: string;
}) {
  const extra = value ?? defaultValue ?? '';
  const format = hour12;
  const options = useMemo(() => {
    const times = everyStep(step);
    if (extra && !times.includes(extra)) times.push(extra);
    return [{ value: '', label: emptyLabel }, ...times.sort().map((time) => ({ value: time, label: clockTime(time) }))];
  }, [emptyLabel, extra, format, step]);
  return (
    <Select
      aria-label={ariaLabel}
      defaultValue={defaultValue}
      disabled={disabled}
      label={label}
      name={name}
      onChange={onChange}
      options={options}
      placeholder={emptyLabel}
      searchable
      value={value}
    />
  );
}
