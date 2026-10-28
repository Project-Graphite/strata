import { useContext, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { FilterChip, Icon, PageActionsRow, PageHeader, Placeholder, SectionHeading, Tabs, type TabItem } from '@project-graphite/ui';
import { Hint } from './Hint';
import { LoadError } from './LoadError';
import { IconButtonSkeleton, rowsOf, SkeletonLine } from './Skeletons';
import { HeaderTitleContext } from '../header-title';

export interface Back {
  to: string;
  label: string;
}

const baseTitle = document.title;

export function useDocumentTitle(title: string | undefined, heading?: { title?: string; back?: Back; tab?: TabItem }) {
  const { pathname } = useLocation();
  const setTitle = useContext(HeaderTitleContext)?.setTitle;
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Strata`;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', new URL(pathname, window.location.origin).href);
    setTitle?.({ pathname, title: heading?.title ?? title, back: heading?.back, tab: heading?.tab });
    return () => {
      document.title = baseTitle;
      setTitle?.((current) => current?.pathname === pathname ? undefined : current);
    };
  }, [title, pathname, setTitle, heading?.title, heading?.back?.to, heading?.back?.label, heading?.tab?.href, heading?.tab?.label]);
}

export function BackLink({ back }: { back: Back }) {
  return (
    <Link className="back-link" title={back.label} to={back.to}>
      <span className="shrink-0"><Icon name="chevron-left" size={14} /></span>
      <span className="min-w-0 truncate">{back.label}</span>
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
  variant = 'app',
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
  variant?: 'app' | 'panel';
}) {
  const named = documentTitle ?? (typeof title === 'string' ? title : undefined);
  const tab = tabs?.find((item) => item.active);
  const titleInHeader = Boolean(useContext(HeaderTitleContext)?.enabled && named) && variant === 'app';
  useDocumentTitle(tab && named && tab.label !== named ? `${tab.label} · ${named}` : named, { title: named, back, tab });
  if (variant === 'panel') {
    return (
      <section className="form-panel page-enter">
        <PageHeader eyebrow={back && <BackLink back={back} />} title={title}>
          {description}
        </PageHeader>
        {children}
      </section>
    );
  }
  const descriptionLine = description && <div className="max-w-2xl text-small text-muted">{description}</div>;
  return (
    <section className="page-enter grid grid-cols-1 content-start gap-8">
      {titleHidden ? (
        <h1 className="sr-only">{title}</h1>
      ) : titleInHeader ? (
        <>
          <PageActionsRow
            actions={actions}
            tabs={tabs}
            tabsLabel={named}
            title={title}
            toolbar={toolbar ?? (!tabs && descriptionLine)}
            toolbarEnd={toolbarEnd}
          />
          {(toolbar || tabs) && descriptionLine}
        </>
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

export function DetailState({
  actions = 0,
  back,
  children,
  description = <SkeletonLine width="w-80 max-w-full" />,
  resource,
  thing,
}: {
  actions?: number;
  back?: Back;
  children?: ReactNode;
  description?: ReactNode;
  resource: { error: string; status?: number; reload: () => void };
  thing: string;
}) {
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
    <Page
      actions={actions > 0 && rowsOf(actions).map((action) => <IconButtonSkeleton key={action} />)}
      back={back}
      description={description}
      documentTitle={thing}
      title={<SkeletonLine width="w-72 max-w-full" />}
    >
      <Placeholder className="grid gap-8" label={`Loading the ${thing.toLowerCase()}`}>
        {children}
      </Placeholder>
    </Page>
  );
}

export function Toolbar({ actions, children }: { actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-sm:basis-full">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FilterChips({ children, items, label }: { children?: ReactNode; items: { active: boolean; count?: number; href: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      {items.map((item) => (
        <FilterChip active={item.active} count={item.count} href={item.href} key={item.href} label={item.label} />
      ))}
      {children}
    </nav>
  );
}

export function Subheading({ children, level = 3 }: { children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading className="m-0 text-h3 text-ink">{children}</Heading>;
}

export function Section({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description?: ReactNode; title: string }) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3">
      <SectionHeading action={action} description={description} title={title} />
      {children}
    </section>
  );
}
