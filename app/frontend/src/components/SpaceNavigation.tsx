import { Fragment, useContext } from 'react';
import { Icon, Menu, Skeleton, useLink } from '@project-graphite/ui';
import { useLocation, useNavigate } from 'react-router';
import { appCatalogue } from '../apps';
import { collapseCrumbs } from '../breadcrumbs';
import { HeaderTitleContext } from '../header-title';
import { noteAddress, noteHref, noteTitle, pageHref } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { findSpace, spaceHref, useAllSpaces, useCurrentSpace } from '../spaces';

const areaNames: Record<string, string> = { '/': 'Home', '/spaces': 'Spaces', '/inbox': 'Inbox', '/settings': 'Settings', '/admin': 'Admin', '/save': 'Save', '/more': 'More' };

export function SpaceNavigation({ active }: { active: string | null }) {
  const spaces = useAllSpaces();
  const { space } = useCurrentSpace();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const CrumbLink = useLink();
  const heading =useContext(HeaderTitleContext)?.title;
  const [currentPage] = usePageNavigation();
  const page = currentPage && pathname === noteHref(currentPage) ? currentPage : undefined;
  const home = space ?? findSpace(spaces.data, page?.spaceId ?? undefined);
  const root = home ? { href: spaceHref(home), label: home.name } : (appCatalogue.find((app) => app.href === active) ?? { href: active ?? '/', label: areaNames[active ?? '/'] ?? 'Overview' });
  const current = heading?.pathname === pathname ? heading : undefined;
  const parents = page?.path.map((parent) => ({ href: pageHref(noteAddress(parent)), label: parent.title || 'Untitled' })) ?? (current?.back && current.back.to !== root.href ? [{ href: current.back.to, label: current.back.label }] : []);
  const title = page ? noteTitle(page) : /^\/(?:pages\/(?!quick-notes$|journal$)|boards\/)[^/]+$/.test(pathname) ? undefined : current?.title !== root.label && current?.title !== space?.name ? current?.title : undefined;
  const tab = !page && current?.tab && current.tab.href !== root.href && current.tab.label !== title ? current.tab : undefined;
  const { shown, hidden } = collapseCrumbs([root, ...parents, ...(title ? [{ label: title }] : []), ...(tab ? [tab] : []), ...(current?.subpage ? [{ label: current.subpage }] : [])]);
  const currentCrumb = shown.at(-1)!;
  if (spaces.loading) return <nav aria-label="Breadcrumb" className="space-navigation"><Skeleton className="h-8 w-36 max-w-full rounded-field" /></nav>;
  return (
    <nav aria-label="Breadcrumb" className="space-navigation min-w-0 flex-1 text-small text-muted">
      <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0">
        {shown.map((crumb, index) => (
          <Fragment key={`${index}-${crumb.label}`}>
            {index === 1 && hidden.length > 0 && <li className="hidden shrink-0 items-center gap-2 md:flex">
              <span aria-hidden="true" className="shrink-0"><Icon name="chevron-right" size={16} /></span>
              <Menu items={hidden.map((parent) => ({ label: parent.label, onSelect: () => navigate(parent.href!) }))} label="Breadcrumb navigation" trigger="…" triggerLabel="Show parent pages" triggerClassName="min-h-11 min-w-8 px-1" />
            </li>}
            <li className={crumb === currentCrumb ? 'flex min-w-0 items-center gap-2' : 'hidden min-w-0 max-w-40 shrink-[2] items-center gap-2 md:flex'}>
              {index > 0 && <span aria-hidden="true" className="hidden shrink-0 md:inline-flex"><Icon name="chevron-right" size={16} /></span>}
              {crumb === currentCrumb ? (
                <span aria-current="page" className="truncate text-ink" title={crumb.label}>{crumb.label}</span>
              ) : crumb.href ? (
                <CrumbLink className="truncate text-muted no-underline hover:underline" href={crumb.href} title={crumb.label}>{crumb.label}</CrumbLink>
              ) : (
                <span className="truncate" title={crumb.label}>{crumb.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
