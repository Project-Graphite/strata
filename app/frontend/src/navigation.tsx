import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { IconName, ShellTab, SidebarSection } from '@project-graphite/ui';
import { appCatalogue, type AppEntry } from './apps';
import { SpaceMark, type Space } from './spaces';

interface Area {
  href: string;
  label: string;
  icon: IconName;
}

const home: Area = { href: '/', label: 'Home', icon: 'home' };

const otherAreas = ['/spaces', '/inbox', '/settings', '/admin', '/save', '/more'];

const phoneApps = (apps: AppEntry[]) => apps.filter((app) => app.phoneTab);

const inside = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function areaOf(pathname: string) {
  const space = /^\/spaces\/(?!invitations(?:\/|$))([^/]+)/.exec(pathname);
  if (space) return `/spaces/${space[1]}`;
  if (pathname === '/') return '/';
  const app = appCatalogue.find((candidate) => [candidate.href, ...(candidate.within ?? [])].some((href) => inside(pathname, href)));
  return app?.href ?? otherAreas.find((href) => inside(pathname, href)) ?? null;
}

function onNavigation(changed: () => void) {
  window.navigation?.addEventListener('currententrychange', changed);
  return () => window.navigation?.removeEventListener('currententrychange', changed);
}

export function useSlowNavigation(shown: string) {
  const latest = useSyncExternalStore(onNavigation, () => window.location.pathname);
  const [slow, setSlow] = useState<string>();
  useEffect(() => {
    if (latest === shown) {
      setSlow(undefined);
      return;
    }
    const timer = window.setTimeout(() => setSlow(latest), 300);
    return () => window.clearTimeout(timer);
  }, [latest, shown]);
  return latest !== shown && slow === latest;
}

export const AreaContext = createContext<{ setArea: (area: string | null) => void }>({ setArea: () => {} });

export function useInArea(area: string | null) {
  const { setArea } = useContext(AreaContext);
  useEffect(() => {
    setArea(area);
    return () => setArea(null);
  }, [area, setArea]);
}

const toItem = (area: Area, active: string | null) => ({ active: area.href === active, href: area.href, icon: area.icon, label: area.label });

export function sidebarSections(active: string | null, spaces: Space[] | undefined, apps: AppEntry[]): SidebarSection[] {
  return [
    { items: [home, ...apps].map((area) => toItem(area, active)) },
    {
      label: 'Spaces',
      items: [
        ...(spaces ?? []).map((space) => ({ active: active === `/spaces/${space.id}`, href: `/spaces/${space.id}`, icon: <SpaceMark space={space} />, label: space.name })),
        { active: active === '/spaces', href: '/spaces', icon: 'folder' as const, label: 'All spaces' },
      ],
    },
  ];
}

export function moreSections(active: string | null, apps: AppEntry[]): SidebarSection[] {
  const tabbed = phoneApps(apps);
  return [{ items: apps.filter((app) => !tabbed.includes(app)).map((app) => toItem(app, active)) }];
}

export function phoneTabBar(active: string | null, apps: AppEntry[]): ShellTab[] {
  const tab = (href: string, label: string, icon: IconName, current: boolean): ShellTab => ({ active: current, href, icon, label });
  const tabbed = phoneApps(apps);
  return [
    tab(home.href, home.label, home.icon, active === home.href),
    ...tabbed.map((app) => tab(app.href, app.label, app.icon, active === app.href)),
    tab('/spaces', 'Spaces', 'folder', Boolean(active?.startsWith('/spaces'))),
    tab(
      '/more',
      'More',
      'more',
      active !== null && active !== home.href && !active.startsWith('/spaces') && !tabbed.some((app) => app.href === active),
    ),
  ];
}

export function searchableAreas(apps: AppEntry[], admin: boolean): { href: string; label: string; hint?: string }[] {
  return [
    ...[home, ...apps].map((area) => ({ href: area.href, label: area.label })),
    ...[
      { app: 'agenda', href: '/agenda/calendars', label: 'Calendars', hint: 'Agenda' },
      { app: 'pages', href: '/pages/quick-notes', label: 'Quick notes', hint: 'Pages' },
      { app: 'spending', href: '/spending/recurring', label: 'Recurring', hint: 'Spending' },
      { app: 'spending', href: '/spending/budgets', label: 'Budgets', hint: 'Spending' },
      { app: 'spending', href: '/spending/net-worth', label: 'Net worth', hint: 'Spending' },
    ].filter((place) => apps.some((app) => app.key === place.app)),
    { href: '/spaces', label: 'Spaces' },
    { href: '/spaces/invitations', label: 'Invitations', hint: 'Spaces' },
    { href: '/inbox', label: 'Inbox' },
    { href: '/settings', label: 'Settings' },
    { href: '/settings/apps', label: 'Apps', hint: 'Settings' },
    { href: '/settings/security', label: 'Security', hint: 'Settings' },
    { href: '/settings/developer', label: 'Developer', hint: 'Settings' },
    { href: '/settings/data', label: 'Your data', hint: 'Settings' },
    { href: '/settings/trash', label: 'Trash', hint: 'Settings' },
    { href: '/settings/legal', label: 'Legal', hint: 'Settings' },
    ...(admin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];
}
