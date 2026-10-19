import type { ReactNode } from 'react';
import { Checkbox } from '@project-graphite/ui';
import { Button } from './Button';
import { RowText } from './RowText';

export function Choice({ checked, detail, disabled, label, onToggle }: { checked: boolean; detail: ReactNode; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <li>
      <label className="panel-row flex cursor-pointer items-center gap-3">
        <Checkbox checked={checked} disabled={disabled} onChange={onToggle} />
        <RowText detail={detail} title={label || 'Untitled'} />
      </label>
    </li>
  );
}

export function toggled(current: ReadonlySet<string>, id: string) {
  const next = new Set(current);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function SelectionBar({ children, label, onClear }: { children: ReactNode; label: string; onClear: () => void }) {
  return (
    <div className="sticky bottom-[calc(var(--tab-bar-height)+0.5rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-4 md:bottom-4">
      <span className="mono-sm text-faint">{label}</span>
      {children}
      <Button label="Clear" onClick={onClear} />
    </div>
  );
}
