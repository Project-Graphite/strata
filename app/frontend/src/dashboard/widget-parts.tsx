import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, Skeleton, timeAgo, type IconName } from '@project-graphite/ui';
import type { Note } from '../notes';
import { useSpaces } from '../spaces';
import { Subheading } from '../components/Page';
import { rowsOf, SkeletonLine } from '../components/Skeletons';

export interface WidgetProps {
  settings: Record<string, unknown>;
  configure?: () => void;
}

export function WidgetHeading({ children, icon, title }: { children?: ReactNode; icon: IconName; title: string }) {
  return (
    <header className="widget-heading">
      <span aria-hidden="true" className="widget-icon">
        <Icon name={icon} size={15} />
      </span>
      <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</h2>
      {children}
    </header>
  );
}

export function WidgetEmpty({ action, children, icon, title }: { action?: ReactNode; children?: ReactNode; icon: IconName; title: string }) {
  return (
    <div className="widget-empty">
      <span aria-hidden="true" className="widget-empty-icon">
        <Icon name={icon} size={18} />
      </span>
      <p className="m-0 text-sm font-medium text-ink">{title}</p>
      {children && <p className="m-0 max-w-72 text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface SettingsProps extends WidgetProps {
  onChange: (settings: Record<string, unknown>) => void;
}

export function TaskRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className="panel-rows">
      {rowsOf(rows).map((row) => (
        <li className="flex items-center gap-3 panel-row" key={row}>
          <Skeleton className="size-[1.125rem] shrink-0 rounded-full" />
          <SkeletonLine className="flex-1" width={row % 2 ? 'w-1/2' : 'w-3/4'} />
        </li>
      ))}
    </ul>
  );
}

export function AgendaCardsSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="grid gap-1.5">
      {rowsOf(rows).map((row) => (
        <div className="agenda-card text-sm" key={row} style={{ '--entry-color': 'var(--color-line)' } as CSSProperties}>
          <SkeletonLine width={row % 2 ? 'w-1/2' : 'w-2/3'} />
          <SkeletonLine className="mono-sm" width="w-24" />
        </div>
      ))}
    </div>
  );
}

export function LinkRowsSkeleton({ className, rows }: { className: string; rows: number }) {
  return (
    <div aria-hidden="true" className={`grid ${className}`}>
      {rowsOf(rows).map((row) => (
        <div className="text-sm" key={row}>
          <SkeletonLine width={row % 2 ? 'w-1/2' : 'w-4/5'} />
          <SkeletonLine className="mono-sm" width="w-24" />
        </div>
      ))}
    </div>
  );
}

export function PageLinksSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="grid gap-1">
      <SkeletonLine className="text-sm" width="w-24" />
      <LinkRowsSkeleton className="gap-1.5" rows={rows} />
    </div>
  );
}

export function SplitRowsSkeleton({ className = '', rows }: { className?: string; rows: number }) {
  return (
    <div aria-hidden="true" className={`grid ${className}`}>
      {rowsOf(rows).map((row) => (
        <div className="flex justify-between gap-3 text-sm" key={row}>
          <SkeletonLine className="flex-1" width={row % 2 ? 'w-1/2' : 'w-2/3'} />
          <SkeletonLine width="w-12" />
        </div>
      ))}
    </div>
  );
}

export function PageLinks({ heading, pages }: { heading: string; pages: Note[] }) {
  const spaces = useSpaces();
  return (
    <section className="grid gap-1">
      <Subheading>{heading}</Subheading>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {pages.map((page) => (
          <li className="text-sm" key={page.id}>
            <Link className="text-ink no-underline hover:underline" to={`/notes/${page.id}`}>
              {page.icon ? `${page.icon} ` : ''}
              {page.title || 'Untitled'}
            </Link>
            <span className="mono-sm block text-faint">
              {[spaces.data?.find((space) => space.id === page.spaceId)?.name, timeAgo(page.updatedAt)].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
