import type { ReactNode } from 'react';
import { IconButton } from '@project-graphite/ui';

export function PeriodNav({
  disabled,
  last = false,
  onShift,
  title,
  unit,
}: {
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
      <h2 className="m-0 text-h2">{title}</h2>
    </div>
  );
}
