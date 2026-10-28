import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { ListRow, Skeleton } from '@project-graphite/ui';
import { Stat, Stats } from './Stats';

const titleWidths = ['w-3/5', 'w-2/5', 'w-1/2', 'w-1/3'];
const detailWidths = ['w-1/3', 'w-1/4', 'w-2/5'];

export const rowsOf = (count: number) => Array.from({ length: count }, (_, index) => index);

export function useRememberedShape<Shape extends number[] | []>(key: string, shape: Shape | undefined, fallback: Shape): Shape {
  const storageKey = `strata:shape:${key}`;
  const known = shape?.join(',');
  useEffect(() => {
    if (known !== undefined) localStorage.setItem(storageKey, known);
  }, [known, storageKey]);
  if (shape) return shape;
  const stored = localStorage.getItem(storageKey);
  return (stored === null ? fallback : stored === '' ? [] : stored.split(',').map(Number)) as Shape;
}

export function SkeletonLine({ className = '', width }: { className?: string; width: string }) {
  return (
    <span aria-hidden="true" className={`flex h-lh items-center ${className}`}>
      <Skeleton className={`h-[0.7em] ${width}`} />
    </span>
  );
}

export function CodeLineSkeleton({ width }: { width: string }) {
  return (
    <span aria-hidden="true" className="block">
      <span className="mono-sm">{'​'}</span>
      <Skeleton className={`inline-block h-[0.7em] align-middle ${width}`} />
    </span>
  );
}

export function RowSkeleton({ below, detail = true, lead, row = 0, trail }: { below?: ReactNode; detail?: boolean; lead?: ReactNode; row?: number; trail?: ReactNode }) {
  return (
    <ListRow
      lead={lead}
      meta={detail && <SkeletonLine width={detailWidths[row % detailWidths.length]!} />}
      title={<SkeletonLine width={titleWidths[row % titleWidths.length]!} />}
      trail={trail}
    >
      {below}
    </ListRow>
  );
}

export function RowsSkeleton({
  below,
  belowRows = Infinity,
  detail,
  lead,
  rows,
  trail,
}: {
  below?: ReactNode;
  belowRows?: number;
  detail?: boolean;
  lead?: ReactNode;
  rows: number;
  trail?: ReactNode;
}) {
  return (
    <ul aria-hidden="true" className="panel-rows">
      {rowsOf(rows).map((row) => (
        <RowSkeleton below={row < belowRows && below} detail={detail} key={row} lead={lead} row={row} trail={trail} />
      ))}
    </ul>
  );
}

export function TaskRowsSkeleton({ detailed = Infinity, rows }: { detailed?: number; rows: number }) {
  return (
    <ul aria-hidden="true" className="panel-rows">
      {rowsOf(rows).map((row) => (
        <li className="flex min-w-0 items-center gap-3 panel-row" key={row}>
          <span className="grid size-9.5 shrink-0 place-items-center">
            <Skeleton className="size-4.5 rounded-mark" />
          </span>
          <span className="min-w-0 flex-1">
            <SkeletonLine width={titleWidths[row % titleWidths.length]!} />
            {row < detailed && <SkeletonLine className="mono-sm mt-0.5" width={detailWidths[row % detailWidths.length]!} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AvatarSkeleton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <Skeleton className={`shrink-0 rounded-full ${size === 'sm' ? 'size-7' : 'size-9'}`} />;
}

export function IconSkeleton() {
  return (
    <span className="grid size-5 shrink-0 place-items-center">
      <Skeleton className="size-4.5" />
    </span>
  );
}

export function SpaceMarkSkeleton({ large = false }: { large?: boolean }) {
  return <Skeleton className={large ? 'space-mark-large' : 'size-4.5 shrink-0 rounded-mark'} />;
}

export function HintSkeleton() {
  return <SkeletonLine className="text-sm" width="w-56 max-w-full" />;
}

export function ButtonSkeleton({ large = false, width = 'w-28' }: { large?: boolean; width?: string }) {
  return <Skeleton className={`shrink-0 rounded-field ${large ? 'h-[2.28125rem]' : 'h-[1.921875rem]'} ${width}`} />;
}

export function IconButtonSkeleton() {
  return (
    <span aria-hidden="true" className="grid size-8.5 shrink-0 place-items-center">
      <Skeleton className="size-4.5 rounded-mark" />
    </span>
  );
}

export function FieldSkeleton({ hint = false }: { hint?: boolean }) {
  return (
    <div aria-hidden="true" className="grid">
      <Skeleton className="h-14 rounded-field" />
      {hint && <SkeletonLine className="mx-3.5 mt-0.75 text-xs leading-[1.66]" width="w-3/4" />}
    </div>
  );
}

export function ToggleSkeleton({ description = false }: { description?: boolean }) {
  return (
    <div aria-hidden="true" className="toggle-row">
      <span className="min-w-0 flex-1">
        <SkeletonLine className="font-medium" width="w-44" />
        {description && <SkeletonLine width="w-80 max-w-full" />}
      </span>
      <span className="-mr-3 grid h-9.5 w-14.5 shrink-0 place-items-center">
        <Skeleton className="h-3.5 w-8.5 rounded-full" />
      </span>
    </div>
  );
}

export function AmountRowsSkeleton({ detailed = Infinity, metered = 0, rows, trail }: { detailed?: number; metered?: number; rows: number; trail?: ReactNode }) {
  return (
    <ul aria-hidden="true" className="panel-rows">
      {rowsOf(rows).map((row) => (
        <ListRow
          key={row}
          meta={row < detailed && <SkeletonLine width={detailWidths[row % detailWidths.length]!} />}
          title={<SkeletonLine width={titleWidths[row % titleWidths.length]!} />}
          trail={
            <>
              <SkeletonLine className="shrink-0" width="w-16" />
              {trail}
            </>
          }
        >
          {row < metered && <Skeleton className="h-1.5 rounded-full" />}
        </ListRow>
      ))}
    </ul>
  );
}

export function AgendaCardsSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className="m-0 grid list-none gap-1.5 p-0">
      {rowsOf(rows).map((row) => (
        <li className="agenda-card" key={row} style={{ '--entry-color': 'var(--color-line)' } as CSSProperties}>
          <SkeletonLine className="text-sm" width={titleWidths[row % titleWidths.length]!} />
          <SkeletonLine className="mono-sm" width="w-24" />
        </li>
      ))}
    </ul>
  );
}

export function HabitRowSkeleton({ row }: { row: number }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <Skeleton className="habit-check rounded-full" />
      <div className="min-w-0 flex-1">
        <SkeletonLine width={titleWidths[row % titleWidths.length]!} />
        <SkeletonLine className="mono-sm mt-0.5" width="w-28" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {rowsOf(7).map((day) => (
          <span className="habit-day" key={day} />
        ))}
      </div>
    </div>
  );
}

export function ChipsSkeleton({ count }: { count: number }) {
  return (
    <span aria-hidden="true" className="flex flex-wrap items-center gap-2">
      {rowsOf(count).map((chip) => (
        <Skeleton className={`h-8 rounded-full ${chip % 2 ? 'w-16' : 'w-24'}`} key={chip} />
      ))}
    </span>
  );
}

export function StatsSkeleton({ count = 1, detail = true }: { count?: number; detail?: boolean }) {
  return (
    <Stats>
      {rowsOf(count).map((stat) => (
        <Stat
          detail={detail && <SkeletonLine width="w-40 max-w-full" />}
          key={stat}
          label={<SkeletonLine width="w-24" />}
          value={<SkeletonLine width="w-32" />}
        />
      ))}
    </Stats>
  );
}
