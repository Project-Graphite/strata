import type { ReactNode } from 'react';
import { Checkbox, ListRow } from '@project-graphite/ui';
import { Button } from './Button';

export function Choice({ checked, detail, disabled, label, onToggle }: { checked: boolean; detail: ReactNode; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <ListRow
      lead={
        <span aria-hidden="true" className="pointer-events-none">
          <Checkbox checked={checked} disabled={disabled} readOnly tabIndex={-1} />
        </span>
      }
      meta={detail}
      onClick={disabled ? undefined : onToggle}
      selected={checked}
      title={label || 'Untitled'}
    />
  );
}

export function toggled(current: ReadonlySet<string>, id: string) {
  const next = new Set(current);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function SelectionBar({ children, label, onClear }: { children: ReactNode; label: string; onClear: () => void }) {
  return (
    <div className="selection-bar sticky bottom-[calc(var(--tab-bar-height)+0.5rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-4 shadow-(--shadow-popover) md:bottom-4">
      <span className="text-small text-muted tabular-nums">{label}</span>
      {children}
      <Button label="Clear" onClick={onClear} />
    </div>
  );
}
