import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon, useDismiss } from '@project-graphite/ui';

const ordinal = (day: number) => `${day}${day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'}`;

export function DayOfMonthField({
  defaultValue,
  emptyLabel,
  label,
  last,
  name,
  presets = [],
}: {
  defaultValue: string;
  emptyLabel: string;
  label: string;
  last: number;
  name: string;
  presets?: { label: string; value: string }[];
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, root, () => setOpen(false));
  useLayoutEffect(() => {
    if (!open) return;
    const box = trigger.current!.getBoundingClientRect();
    const below = window.innerHeight - box.bottom > 300;
    setPlace({ position: 'fixed', left: box.left, margin: 0, ...(below ? { top: box.bottom + 6 } : { bottom: window.innerHeight - box.top + 6, top: 'auto' }) });
    panel.current?.showPopover?.();
    panel.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [open]);
  const options = [{ label: emptyLabel, value: '' }, ...presets, ...Array.from({ length: last }, (_, index) => ({ label: ordinal(index + 1), value: String(index + 1) }))];
  const choose = (next: string) => {
    setValue(next);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="field-label" ref={root}>
      <span id={`${id}-label`}>{label}</span>
      <button aria-expanded={open} aria-haspopup="listbox" aria-labelledby={`${id}-label`} className="select-trigger field-control" onClick={() => setOpen(!open)} ref={trigger} type="button">
        <span className={value ? 'text-ink' : 'text-faint'}>{options.find((option) => option.value === value)?.label ?? emptyLabel}</span>
        <span className="chevron">
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      <input name={name} type="hidden" value={value} />
      <span aria-hidden="true" className="field-slot" />
      {open && (
        <div
          aria-labelledby={`${id}-label`}
          className="popover-panel grid-listbox"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
          popover="manual"
          ref={panel}
          role="listbox"
          style={{ ...place, '--grid-columns': 7 } as CSSProperties}
        >
          {[{ label: emptyLabel, value: '' }, ...presets].map((option) => (
            <button aria-selected={value === option.value} className="grid-option col-span-full" key={option.label} onClick={() => choose(option.value)} role="option" type="button">
              {option.label}
            </button>
          ))}
          <p className="eyebrow col-span-full mt-3 mb-1">Day of the month</p>
          {options.slice(presets.length + 1).map((option) => (
            <button aria-selected={value === option.value} className="grid-option" key={option.value} onClick={() => choose(option.value)} role="option" type="button">
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
