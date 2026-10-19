import Chip from '@mui/material/Chip';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, LinesSkeleton, PageHeader, Skeleton, Tabs, type TabItem } from '@project-graphite/ui';
import { Hint } from './Hint';
import { LoadError } from './LoadError';

export interface Back {
  to: string;
  label: string;
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Strata`;
    return () => {
      document.title = 'Strata';
    };
  }, [title]);
}

export function BackLink({ back }: { back: Back }) {
  return (
    <Link className="back-link" to={back.to}>
      <Icon name="chevron-left" size={14} />
      {back.label}
    </Link>
  );
}

export function Page({
  actions,
  back,
  children,
  description,
  documentTitle,
  tabs,
  title,
  titleHidden = false,
  toolbar,
  toolbarEnd,
}: {
  actions?: ReactNode;
  back?: Back;
  children: ReactNode;
  description?: ReactNode;
  documentTitle?: string;
  tabs?: TabItem[];
  title: ReactNode;
  titleHidden?: boolean;
  toolbar?: ReactNode;
  toolbarEnd?: ReactNode;
}) {
  const named = documentTitle ?? (typeof title === 'string' ? title : undefined);
  const tab = tabs?.find((item) => item.active);
  useDocumentTitle(tab && named && tab.label !== named ? `${tab.label} · ${named}` : named);
  return (
    <section className="page-enter grid grid-cols-1 content-start gap-8">
      {titleHidden ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <div className="grid gap-6">
          <PageHeader actions={actions} eyebrow={back && <BackLink back={back} />} title={title}>
            {description}
          </PageHeader>
          {tabs && <Tabs items={tabs} label={named ?? 'Sections'} />}
          {(toolbar || toolbarEnd) && <Toolbar actions={toolbarEnd}>{toolbar}</Toolbar>}
        </div>
      )}
      {children}
    </section>
  );
}

export function DetailState({ back, resource, thing }: { back?: Back; resource: { error: string; status?: number; reload: () => void }; thing: string }) {
  if (resource.status === 404) {
    return (
      <Page back={back} title={`${thing} not found`}>
        <Hint>It may have been deleted, or you’re not a member of its space.</Hint>
      </Page>
    );
  }
  if (resource.error) {
    return (
      <Page back={back} title={thing}>
        <LoadError error={resource.error} onRetry={resource.reload} />
      </Page>
    );
  }
  return (
    <Page back={back} documentTitle={thing} title={<Skeleton className="block h-9 w-72 max-w-full" />}>
      <LinesSkeleton label={`Loading the ${thing.toLowerCase()}`} />
    </Page>
  );
}

export function Toolbar({ actions, children }: { actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FilterChips({ children, items, label }: { children?: ReactNode; items: { active: boolean; count?: number; href: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <Chip
          aria-current={item.active ? 'page' : undefined}
          clickable
          component={Link}
          key={item.href}
          label={
            <>
              {item.label}
              {item.count !== undefined && <span className="ml-1.5 text-faint">{item.count}</span>}
            </>
          }
          to={item.href}
          variant={item.active ? 'filled' : 'outlined'}
        />
      ))}
      {children}
    </nav>
  );
}

export function Subheading({ children, level = 3 }: { children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading className="m-0 text-sm font-medium text-muted">{children}</Heading>;
}

export function Section({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description?: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-medium">{title}</h2>
          {description && <p className="m-0 mt-1 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
