import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState, Icon, timeAgo, type IconName } from '@project-graphite/ui';
import { noteHref, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { ButtonLink } from '../components/Button';
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
        <Icon name={icon} size={18} />
      </span>
      <h2 className="m-0 min-w-0 flex-1 truncate text-h3 text-ink">{title}</h2>
      {children}
    </header>
  );
}

export function WidgetEmpty({ action, icon, title }: { action?: ReactNode; icon: IconName; title: string }) {
  return <EmptyState action={action} icon={icon} title={title} variant="widget" />;
}

export function useWide() {
  const query = '(min-width: 64rem)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

export const useListRows = (rows: number) => (useWide() ? rows : Math.min(rows, 5));

export function ShowAll({ count, href }: { count: number; href: string }) {
  return <ButtonLink label={`Show all ${count}`} to={href} />;
}

export interface SettingsProps extends WidgetProps {
  onChange: (settings: Record<string, unknown>) => void;
}

export function LinkRowsSkeleton({ className, rows }: { className: string; rows: number }) {
  return (
    <div aria-hidden="true" className={`grid ${className}`}>
      {rowsOf(rows).map((row) => (
        <div className="text-body" key={row}>
          <SkeletonLine width={row % 2 ? 'w-1/2' : 'w-4/5'} />
          <SkeletonLine className="text-small" width="w-24" />
        </div>
      ))}
    </div>
  );
}

export function PageLinksSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="grid gap-1">
      <SkeletonLine className="text-h3" width="w-24" />
      <LinkRowsSkeleton className="gap-1.5" rows={rows} />
    </div>
  );
}

export function SplitRowsSkeleton({ className = '', rows }: { className?: string; rows: number }) {
  return (
    <div aria-hidden="true" className={`grid ${className}`}>
      {rowsOf(rows).map((row) => (
        <div className="flex justify-between gap-3 text-body" key={row}>
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
          <li className="text-body" key={page.id}>
            <Link className="text-ink no-underline hover:underline" to={noteHref(page)}>
              {page.icon ? `${page.icon} ` : ''}
              {page.title || 'Untitled'}
            </Link>
            <span className="block text-small text-muted">
              {[spaces.data?.find((space) => space.id === page.spaceId)?.name, timeAgo(page.updatedAt)].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
