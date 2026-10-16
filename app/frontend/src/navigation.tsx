import { createContext, useContext, useEffect } from 'react';
import type { IconName, ShellTab, SidebarSection } from '@project-graphite/ui';
import { featureCatalogue, type Feature } from './features';
import { SpaceMark, type Space } from './spaces';

export interface Area {
  href: string;
  label: string;
  icon: IconName;
  within?: string[];
}

export const mainAreas: Area[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/tasks', label: 'Tasks', icon: 'check-mark' },
  { href: '/agenda', label: 'Agenda', icon: 'calendar', within: ['/events'] },
  { href: '/pages', label: 'Pages', icon: 'file', within: ['/notes'] },
  { href: '/boards', label: 'Boards', icon: 'board' },
  { href: '/bookmarks', label: 'Bookmarks', icon: 'bookmark' },
  { href: '/journal', label: 'Journal', icon: 'pencil' },
  { href: '/files', label: 'Files', icon: 'library' },
  { href: '/spending', label: 'Spending', icon: 'wallet' },
];

const trash: Area = { href: '/trash', label: 'Trash', icon: 'trash' };

const otherAreas = ['/spaces', '/inbox', '/settings', '/admin', '/save', '/more'];

const phoneTabs = ['/', '/spending', '/agenda', '/spaces'];

const inside = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function areaOf(pathname: string) {
  const space = /^\/spaces\/(?!invitations(?:\/|$))([^/]+)/.exec(pathname);
  if (space) return `/spaces/${space[1]}`;
  if (pathname === '/') return '/';
  const area = ([...mainAreas, ...featureCatalogue, trash] as Area[]).find(
    (candidate) => candidate.href !== '/' && [candidate.href, ...(candidate.within ?? [])].some((href) => inside(pathname, href)),
  );
  return area?.href ?? otherAreas.find((href) => inside(pathname, href)) ?? null;
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

export function sidebarSections(active: string | null, spaces: Space[] | undefined, features: Feature[]): SidebarSection[] {
  return [
    { items: mainAreas.map((area) => toItem(area, active)) },
    ...(features.length ? [{ label: 'Features', items: features.map((feature) => toItem(feature, active)) }] : []),
    {
      label: 'Spaces',
      items: [
        ...(spaces ?? []).map((space) => ({ active: active === `/spaces/${space.id}`, href: `/spaces/${space.id}`, icon: <SpaceMark space={space} />, label: space.name })),
        { active: active === '/spaces', href: '/spaces', icon: 'folder' as const, label: 'All spaces' },
      ],
    },
    { items: [toItem(trash, active)] },
  ];
}

export function moreSections(active: string | null, features: Feature[]): SidebarSection[] {
  return [
    { items: mainAreas.filter((area) => !phoneTabs.includes(area.href)).map((area) => toItem(area, active)) },
    ...(features.length ? [{ label: 'Features', items: features.map((feature) => toItem(feature, active)) }] : []),
    { items: [toItem(trash, active)] },
  ];
}

export function phoneTabBar(active: string | null): ShellTab[] {
  const tab = (href: string, label: string, icon: IconName, current: boolean): ShellTab => ({ active: current, href, icon, label });
  return [
    tab('/', 'Home', 'home', active === '/'),
    tab('/spending', 'Spending', 'wallet', active === '/spending'),
    tab('/agenda', 'Agenda', 'calendar', active === '/agenda'),
    tab('/spaces', 'Spaces', 'folder', Boolean(active?.startsWith('/spaces'))),
    tab('/more', 'More', 'more', active !== null && !active.startsWith('/spaces') && !phoneTabs.includes(active)),
  ];
}

export function searchableAreas(features: Feature[], admin: boolean): { href: string; label: string; hint?: string }[] {
  return [
    ...mainAreas.map((area) => ({ href: area.href, label: area.label })),
    { href: '/agenda/calendars', label: 'Calendars', hint: 'Agenda' },
    { href: '/pages/quick-notes', label: 'Quick notes', hint: 'Pages' },
    { href: '/spending/recurring', label: 'Recurring', hint: 'Spending' },
    { href: '/spending/budgets', label: 'Budgets', hint: 'Spending' },
    { href: '/spending/net-worth', label: 'Net worth', hint: 'Spending' },
    ...features.map((feature) => ({ href: feature.href, label: feature.label })),
    { href: '/spaces', label: 'Spaces' },
    { href: '/spaces/invitations', label: 'Invitations', hint: 'Spaces' },
    { href: '/inbox', label: 'Inbox' },
    { href: '/trash', label: 'Trash' },
    { href: '/settings', label: 'Settings' },
    { href: '/settings/features', label: 'Features', hint: 'Settings' },
    { href: '/settings/security', label: 'Security', hint: 'Settings' },
    { href: '/settings/developer', label: 'Developer', hint: 'Settings' },
    { href: '/settings/data', label: 'Your data', hint: 'Settings' },
    ...(admin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];
}
