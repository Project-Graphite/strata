import { useContext } from 'react';
import { Icon, Menu, Skeleton } from '@project-graphite/ui';
import { Link, useLocation, useNavigate } from 'react-router';
import { appCatalogue } from '../apps';
import { HeaderTitleContext } from '../header-title';
import { areaOf } from '../navigation';
import { noteTitle } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { SpaceMark, useAllSpaces, useChosenSpace } from '../spaces';

const areaNames: Record<string, string> = { '/': 'Home', '/spaces': 'Spaces', '/inbox': 'Inbox', '/settings': 'Settings', '/admin': 'Admin', '/save': 'Save', '/more': 'More' };

export function SpaceNavigation({ active }: { active: string | null }) {
  const spaces = useAllSpaces();
  const { space, choose } = useChosenSpace();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const heading = useContext(HeaderTitleContext)?.title;
  const [currentPage] = usePageNavigation();
  const page = currentPage && pathname === `/notes/${currentPage.id}` ? currentPage : undefined;
  const root = appCatalogue.find((app) => app.href === active) ?? { href: active ?? '/', label: areaNames[active ?? '/'] ?? 'Overview' };
  const current = heading?.pathname === pathname ? heading : undefined;
  const parents = page?.path.map((parent) => ({ href: `/notes/${parent.id}`, label: parent.title || 'Untitled' })) ?? (current?.back && current.back.to !== root.href ? [{ href: current.back.to, label: current.back.label }] : []);
  const title = page ? noteTitle(page) : pathname.startsWith('/notes/') ? undefined : current?.title !== root.label && current?.title !== space?.name ? current?.title : undefined;
  const tab = !page && current?.tab && current.tab.href !== root.href && current.tab.label !== title ? current.tab : undefined;
  if (!space) return spaces.loading ? <nav aria-label="Breadcrumb" className="space-navigation"><Skeleton className="h-8 w-36 max-w-full rounded-field" /></nav> : null;
  return (
    <nav aria-label="Breadcrumb" className="space-navigation min-w-0 flex-1 text-sm text-muted">
      <ol className="m-0 flex min-w-0 list-none items-center gap-1 p-0 sm:gap-2">
        <li className="min-w-0 max-w-[35%] shrink-0 sm:max-w-[45%]">
          <Menu
            items={[
              ...(spaces.data ?? []).map((candidate) => ({
                label: candidate.name,
                icon: <SpaceMark space={candidate} />,
                onSelect: () => {
                  choose(candidate.id);
                  navigate(pathname.startsWith('/spaces') ? `/spaces/${candidate.id}` : active ?? areaOf(pathname) ?? '/');
                },
              })),
              { label: 'Manage spaces', separated: true, onSelect: () => navigate('/spaces') },
            ]}
            label="Switch space"
            trigger={<span className="inline-flex min-w-0 max-w-full items-center gap-1 sm:gap-2"><span className="hidden sm:inline-flex"><SpaceMark space={space} /></span><span className="min-w-0 truncate">{space.name}</span><span className="shrink-0"><Icon name="chevron-down" size={14} /></span></span>}
            triggerClassName="min-h-11 max-w-full min-w-0 px-1"
            triggerLabel={`Switch space: ${space.name}`}
          />
        </li>
        <li className={`${title || tab ? 'hidden sm:flex' : 'flex'} min-w-0 max-w-24 shrink-0 items-center gap-1 sm:max-w-48 sm:gap-2`}>
          <span aria-hidden="true" className="shrink-0"><Icon name="chevron-right" size={14} /></span>
          {title || tab || parents.length > 0 ? <Link className="truncate text-muted no-underline hover:underline" title={root.label} to={root.href}>{root.label}</Link> : <span aria-current="page" className="truncate text-ink" title={root.label}>{root.label}</span>}
        </li>
        {(title || tab || parents.length > 0) && <li className={`flex shrink-0 items-center gap-1 sm:gap-2 ${parents.length > 1 ? '' : parents.length === 1 ? 'lg:hidden' : 'sm:hidden'}`}>
          <span aria-hidden="true"><Icon name="chevron-right" size={14} /></span>
          <Menu items={[root, ...parents].map((parent) => ({ label: parent.label, onSelect: () => navigate(parent.href) }))} label="Breadcrumb navigation" trigger="…" triggerLabel="Show parent pages" triggerClassName="min-h-11 min-w-8 px-1" />
        </li>}
        {parents.length > 0 && <li className="hidden min-w-0 max-w-40 items-center gap-2 lg:flex">
          <span aria-hidden="true" className="shrink-0"><Icon name="chevron-right" size={14} /></span>
          <Link className="truncate text-muted no-underline hover:underline" title={parents.at(-1)!.label} to={parents.at(-1)!.href}>{parents.at(-1)!.label}</Link>
        </li>}
        {title && <li className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span aria-hidden="true" className="shrink-0"><Icon name="chevron-right" size={14} /></span>
          <span aria-current={tab ? undefined : 'page'} className="truncate text-ink" title={title}>{title}</span>
        </li>}
        {tab && <li className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span aria-hidden="true" className="shrink-0"><Icon name="chevron-right" size={14} /></span>
          <span aria-current="page" className="truncate text-ink" title={tab.label}>{tab.label}</span>
        </li>}
      </ol>
    </nav>
  );
}
