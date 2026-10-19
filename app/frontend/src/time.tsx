import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog, Icon, Button as UiButton } from '@project-graphite/ui';
import { Button, IconButton, TextButton } from './components/Button';
import { DialogActions } from './components/DialogActions';

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

export const zoneLabel = (zone: string) => (zone === Intl.DateTimeFormat().resolvedOptions().timeZone ? '' : zone.replaceAll('_', ' '));

export const usesTwelveHours = () => hour12 ?? Boolean(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12);

export function clockTime(time: string | Date, timeZone?: string) {
  const at = typeof time === 'string' ? new Date(`2000-01-01T${time}`) : time;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone, ...timeOptions() });
}

const pad = (value: number) => String(value).padStart(2, '0');

function Digits({ label, max, min, onChange, step, value }: { label: string; max: number; min: number; onChange: (value: number) => void; step: number; value: number }) {
  const typed = useRef('');
  const size = max - min + 1;
  const turn = (next: number) => onChange(((((next - min) % size) + size) % size) + min);
  const key = (event: KeyboardEvent) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      typed.current = '';
      turn(value + (event.key === 'ArrowUp' ? step : -step));
    } else if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const both = Number(`${typed.current}${event.key}`);
      typed.current = both >= min && both <= max && typed.current ? '' : event.key;
      const next = both >= min && both <= max ? both : Number(event.key);
      if (next >= min && next <= max) onChange(next);
    }
  };
  return (
    <div className="grid justify-items-center gap-1">
      <IconButton icon="chevron-up" label={`More ${label.toLowerCase()}`} onClick={() => turn(value + step)} />
      <span
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        className="clock-digits"
        onBlur={() => (typed.current = '')}
        onKeyDown={key}
        role="spinbutton"
        tabIndex={0}
      >
        {pad(value)}
      </span>
      <IconButton icon="chevron-down" label={`Less ${label.toLowerCase()}`} onClick={() => turn(value - step)} />
    </div>
  );
}

function ClockDialog({ initial, onClose, onSet, optional, title }: { initial: string; onClose: () => void; onSet: (time: string) => void; optional: boolean; title: string }) {
  const twelve = usesTwelveHours();
  const now = new Date();
  const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
  const [hours, setHours] = useState(initial ? Number(initial.slice(0, 2)) : Math.floor(rounded / 60) % 24);
  const [minutes, setMinutes] = useState(initial ? Number(initial.slice(3, 5)) : rounded % 60);
  const afternoon = hours >= 12;

  return (
    <Dialog onClose={onClose} title={title}>
      <div className="mt-5 grid gap-6">
        <div className="clock-face">
          {twelve ? (
            <Digits label="Hours" max={12} min={1} onChange={(next) => setHours((next % 12) + (afternoon ? 12 : 0))} step={1} value={hours % 12 || 12} />
          ) : (
            <Digits label="Hours" max={23} min={0} onChange={setHours} step={1} value={hours} />
          )}
          <span aria-hidden="true" className="clock-digits clock-colon">
            :
          </span>
          <Digits label="Minutes" max={59} min={0} onChange={setMinutes} step={5} value={minutes} />
          {twelve && (
            <div aria-label="Morning or afternoon" className="ml-2 grid gap-1" role="radiogroup">
              {(['AM', 'PM'] as const).map((half) => (
                <UiButton
                  aria-checked={(half === 'PM') === afternoon}
                  key={half}
                  onClick={() => setHours((hours % 12) + (half === 'PM' ? 12 : 0))}
                  role="radio"
                  size="small"
                  variant={(half === 'PM') === afternoon ? 'primary' : 'secondary'}
                >
                  {half}
                </UiButton>
              ))}
            </div>
          )}
        </div>
        <DialogActions start={optional && <TextButton label="Clear" onClick={() => onSet('')} />}>
          <Button label="Cancel" large onClick={onClose} />
          <Button label="Set time" large onClick={() => onSet(`${pad(hours)}:${pad(minutes)}`)} primary />
        </DialogActions>
      </div>
    </Dialog>
  );
}

export function TimeField({
  'aria-label': ariaLabel,
  defaultValue,
  disabled,
  emptyLabel = 'No time',
  label,
  name,
  onChange,
  optional = true,
  value,
}: {
  'aria-label'?: string;
  defaultValue?: string;
  disabled?: boolean;
  emptyLabel?: string;
  label?: string;
  name?: string;
  onChange?: (value: string) => void;
  optional?: boolean;
  value?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const current = value ?? own;

  return (
    <div className={label ? 'field-label' : ''}>
      {label && <span id={`${id}-label`}>{label}</span>}
      <button
        aria-label={ariaLabel ? `${ariaLabel}: ${current ? clockTime(current) : emptyLabel}` : undefined}
        aria-labelledby={ariaLabel ? undefined : `${id}-label ${id}-value`}
        className="select-trigger field-control"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className={`flex min-w-0 items-center gap-2 truncate ${current ? '' : 'text-faint'}`} id={`${id}-value`}>
          <Icon name="clock" size={16} />
          {current ? clockTime(current) : emptyLabel}
        </span>
      </button>
      <input name={name} type="hidden" value={current} />
      {label && <span aria-hidden="true" className="field-slot" />}
      {open && (
        <ClockDialog
          initial={current}
          onClose={() => setOpen(false)}
          onSet={(next) => {
            if (value === undefined) setOwn(next);
            if (next !== current) onChange?.(next);
            setOpen(false);
          }}
          optional={optional}
          title={label ?? ariaLabel ?? 'Time'}
        />
      )}
    </div>
  );
}
