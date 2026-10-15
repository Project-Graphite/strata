import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { HeaderButton } from './Page';

export function PeriodNav({
  current,
  disabled,
  last = false,
  onShift,
  title,
  unit,
}: {
  current?: { label: string; onSelect: () => void };
  disabled?: boolean;
  last?: boolean;
  onShift: (step: number) => void;
  title: ReactNode;
  unit: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconButton disabled={disabled} icon="chevron-left" label={`Previous ${unit}`} onClick={() => onShift(-1)} />
      <IconButton disabled={disabled || last} icon="chevron-right" label={`Next ${unit}`} onClick={() => onShift(1)} />
      {current && <HeaderButton label={current.label} onClick={current.onSelect} />}
      <h2 className="m-0 ml-2 text-lg font-medium">{title}</h2>
    </div>
  );
}
