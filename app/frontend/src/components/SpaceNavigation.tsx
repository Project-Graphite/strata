import { Fragment, useContext } from 'react';
import { Icon, Menu, Skeleton } from '@project-graphite/ui';
import { Link, useLocation, useNavigate } from 'react-router';
import { appCatalogue } from '../apps';
import { collapseCrumbs } from '../breadcrumbs';
import { HeaderTitleContext } from '../header-title';
import { areaOf } from '../navigation';
import { noteHref, noteTitle } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { SpaceMark, useAllSpaces, useChosenSpace, type Space } from '../spaces';

const areaNames: Record<string, string> = { '/': 'Home', '/spaces': 'Spaces', '/inbox': 'Inbox', '/settings': 'Settings', '/admin': 'Admin', '/save': 'Save', '/more': 'More' };
const spaceFrame = 'relative inline-flex min-h-9 max-w-full min-w-0 items-center rounded-field border border-line px-2';
const spaceName = (space: Space) => <span className="inline-flex min-w-0 max-w-full items-center gap-1 md:gap-2"><span className="hidden md:inline-flex"><SpaceMark space={space} /></span><span className="min-w-0 truncate" title={space.name}>{space.name}</span></span>;

export function SpaceNavigation({ active }: { active: string | null }) {
  const spaces = useAllSpaces();
  const { space, choose } = useChosenSpace();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const heading = useContext(HeaderTitleContext)?.title;
  const [currentPage] = usePageNavigation();
  const page = currentPage && pathname === noteHref(currentPage) ? currentPage : undefined;
  const root = appCatalogue.find((app) => app.href === active) ?? { href: active ?? '/', label: areaNames[active ?? '/'] ?? 'Overview' };
  const current = heading?.pathname === pathname ? heading : undefined;
  const parents = page?.path.map((parent) => ({ href: `/notes/${parent.id}`, label: parent.title || 'Untitled' })) ?? (current?.back && current.back.to !== root.href ? [{ href: current.back.to, label: current.back.label }] : []);
  const title = page ? noteTitle(page) : /^\/(?:notes|boards)\//.test(pathname) ? undefined : current?.title !== root.label && current?.title !== space?.name ? current?.title : undefined;
  const tab = !page && current?.tab && current.tab.href !== root.href && current.tab.label !== title ? current.tab : undefined;
  const personal = active === '/spending' ? spaces.data?.find((candidate) => candidate.kind === 'personal') : undefined;
  const { shown, hidden } = collapseCrumbs([root, ...parents, ...(title ? [{ label: title }] : []), ...(tab ? [tab] : [])]);
  const currentCrumb = shown.at(-1)!;
  if (!space) return spaces.loading ? <nav aria-label="Breadcrumb" className="space-navigation"><Skeleton className="h-8 w-36 max-w-full rounded-field" /></nav> : null;
  return (
    <nav aria-label="Breadcrumb" className="space-navigation min-w-0 flex-1 text-small text-muted">
      <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0">
        <li className="min-w-0 max-w-[50%] shrink-0 md:max-w-[30%]">
          {personal ? <span className={spaceFrame}>{spaceName(personal)}</span> : <Menu
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
            trigger={spaceName(space)}
            triggerClassName={`${spaceFrame} transition-colors after:absolute after:inset-x-0 after:-inset-y-1 hover:border-muted aria-expanded:border-muted`}
            triggerLabel={`Switch space: ${space.name}`}
          />}
        </li>
        {shown.map((crumb, index) => (
          <Fragment key={`${index}-${crumb.label}`}>
            {index === 1 && hidden.length > 0 && <li className="hidden shrink-0 items-center gap-2 md:flex">
              <span aria-hidden="true" className="shrink-0"><Icon name="chevron-right" size={14} /></span>
              <Menu items={hidden.map((parent) => ({ label: parent.label, onSelect: () => navigate(parent.href!) }))} label="Breadcrumb navigation" trigger="…" triggerLabel="Show parent pages" triggerClassName="min-h-11 min-w-8 px-1" />
            </li>}
            <li className={crumb === currentCrumb ? 'flex min-w-0 items-center gap-2' : 'hidden min-w-0 max-w-40 shrink-[2] items-center gap-2 md:flex'}>
              <span aria-hidden="true" className="hidden shrink-0 md:inline-flex"><Icon name="chevron-right" size={14} /></span>
              {crumb === currentCrumb ? (
                <span aria-current="page" className="truncate text-ink" title={crumb.label}>{crumb.label}</span>
              ) : crumb.href ? (
                <Link className="truncate text-muted no-underline hover:underline" title={crumb.label} to={crumb.href}>{crumb.label}</Link>
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
