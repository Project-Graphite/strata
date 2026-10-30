import { useRef, useState, type KeyboardEvent } from 'react';
import { Dialog, formatDay, IconButton, PickerField, Button as UiButton } from '@project-graphite/ui';
import { Button, TextButton } from './components/Button';
import { DialogActions } from './components/DialogActions';

let profileZone: string | undefined;

export function applyTimeZone(zone: string | undefined) {
  profileZone = zone;
}

export const zoneLabel = (zone: string) => (zone === (profileZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) ? '' : zone.replaceAll('_', ' '));

const dayFormats = new Map<string | undefined, Intl.DateTimeFormat>();

export function profileDay(at: Date | string = new Date()) {
  let format = dayFormats.get(profileZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: profileZone });
    dayFormats.set(profileZone, format);
  }
  return format.format(new Date(at));
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const daysAway = (day: string) => daysBetween(profileDay(), day);

const minuteFormats = new Map<string | undefined, Intl.DateTimeFormat>();

export function profileMinutes(at: Date | string) {
  let format = minuteFormats.get(profileZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: profileZone });
    minuteFormats.set(profileZone, format);
  }
  const [hours, minutes] = format.format(new Date(at)).split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

export const profileClock = (at: Date | string) => clockTime(new Date(at), profileZone);

export function formatDate(day: string, time?: string | null) {
  const away = daysAway(day);
  const label =
    away === 0
      ? 'today'
      : away === 1
        ? 'tomorrow'
        : away === -1
          ? 'yesterday'
          : away > 1 && away < 7
            ? formatDay(day, { weekday: 'short' })
            : formatDay(day, { day: 'numeric', month: 'short', ...(day.slice(0, 4) === profileDay().slice(0, 4) ? {} : { year: 'numeric' }) });
  return time ? `${label} ${clockTime(time)}` : label;
}

export function formatMoment(at: string) {
  const day = profileDay(at);
  return Math.abs(daysAway(day)) < 7 ? `${formatDate(day)} ${profileClock(at)}` : formatDate(day);
}

export const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const rangeFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const formatRange = (from: string, to: string) => rangeFormat.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatMonth = (day: string) => monthFormat.format(new Date(`${day.slice(0, 7)}-01T00:00:00Z`));

export const count = (value: number) => value.toLocaleString('en-EG');

export const usesTwelveHours = () => Boolean(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12);

export function clockTime(time: string | Date, timeZone?: string) {
  const at = typeof time === 'string' ? new Date(`2000-01-01T${time}`) : time;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone });
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
      <div className="mt-5 grid min-w-0 grid-cols-1 gap-6">
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
  const [own, setOwn] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const current = value ?? own;

  return (
    <>
      <PickerField
        aria-label={ariaLabel}
        disabled={disabled}
        haspopup="dialog"
        icon="clock"
        label={label}
        onOpen={() => setOpen(true)}
        open={open}
        value={current ? clockTime(current) : emptyLabel}
      />
      <input name={name} type="hidden" value={current} />
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
    </>
  );
}
