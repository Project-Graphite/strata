import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, useDismiss } from '@project-graphite/ui';
import { allCurrencies, currencyName } from '../choices';

const famous = ['USD', 'EUR', 'EGP'];

export function CurrencyField({
  codes = allCurrencies,
  defaultValue,
  hint,
  label = 'Currency',
  name,
  noneLabel,
  onChange,
  value,
}: {
  codes?: string[];
  defaultValue?: string;
  hint?: string;
  label?: string;
  name?: string;
  noneLabel?: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultValue ?? '');
  const current = value ?? own;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>();
  useDismiss(open, root, () => setOpen(false));
  useLayoutEffect(() => {
    if (!open) return;
    const box = trigger.current!.getBoundingClientRect();
    setPlace({ position: 'fixed', top: box.bottom + 6, left: box.left, width: Math.max(box.width, 288), margin: 0 });
    panel.current?.showPopover?.();
    search.current?.focus();
  }, [open]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    if (!words) return [...(noneLabel ? [''] : []), ...new Set([...famous, ...(current ? [current] : [])])];
    const matches = codes.filter((code) => `${code} ${currencyName(code)}`.toLowerCase().includes(words));
    return [...matches.filter((code) => code.toLowerCase().startsWith(words)), ...matches.filter((code) => !code.toLowerCase().startsWith(words))];
  }, [codes, current, noneLabel, query]);

  function choose(next: string) {
    if (value === undefined) setOwn(next);
    if (next !== current) onChange?.(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.min(shown.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const code = shown[active];
      if (code !== undefined) choose(code);
    }
  }

  return (
    <div className="field-label" ref={root}>
      <span id={`${id}-label`}>{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        className="select-trigger field-control"
        onClick={() => {
          setQuery('');
          setActive(0);
          setOpen(!open);
        }}
        ref={trigger}
        role="combobox"
        type="button"
      >
        <span className={`truncate ${current || noneLabel ? '' : 'text-faint'}`}>{current ? `${current} · ${currencyName(current)}` : (noneLabel ?? 'Choose…')}</span>
        <span className="chevron">
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      <input name={name} type="hidden" value={current} />
      {hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : (
        <span aria-hidden="true" className="field-slot" />
      )}
      {open && (
        <div className="popover-panel listbox-panel" onKeyDown={onKey} popover="manual" ref={panel} style={place}>
          <div className="listbox-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Search currencies"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActive(0);
              }}
              placeholder="Search all currencies"
              ref={search}
              value={query}
            />
          </div>
          <div className="listbox-options" role="listbox">
            {shown.map((code, index) => (
              <div
                aria-selected={code === current}
                className="listbox-option"
                data-active={index === active}
                key={code || 'none'}
                onClick={() => choose(code)}
                onPointerMove={() => index !== active && setActive(index)}
                role="option"
              >
                <span className="min-w-0 flex-1 truncate">{code || noneLabel}</span>
                {code && <span className="listbox-hint">{currencyName(code)}</span>}
                {code === current && <Icon name="check-mark" size={16} />}
              </div>
            ))}
            {shown.length === 0 && <p className="listbox-empty">Nothing matches “{query}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
