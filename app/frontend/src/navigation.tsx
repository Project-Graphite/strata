import type { SidebarSection } from '@project-graphite/ui';
import { featureCatalogue, type Feature } from './features';
import { SpaceMark, type Space } from './spaces';

export const moreAreas = [
  '/menu',
  '/pages',
  '/boards',
  '/bookmarks',
  '/journal',
  '/storage',
  '/spending',
  '/recurring',
  ...featureCatalogue.map((feature) => feature.href),
  '/inbox',
  '/invitations',
  '/trash',
  '/settings',
  '/admin',
];

export function areaSections(pathname: string, spaces: Space[] | undefined, unread: number, features: Feature[]): SidebarSection[] {
  return [
    {
      items: [
        { active: pathname === '/', href: '/', icon: 'home', label: 'Home' },
        { active: pathname === '/todo', href: '/todo', icon: 'check-mark', label: 'To-do' },
        {
          active: pathname === '/agenda' || pathname === '/today' || pathname.startsWith('/agenda/') || pathname.startsWith('/events/'),
          href: '/agenda',
          icon: 'calendar',
          label: 'Agenda',
        },
        { active: pathname === '/pages', href: '/pages', icon: 'library', label: 'Pages' },
        { active: pathname === '/boards', href: '/boards', icon: 'panel', label: 'Boards' },
        { active: pathname === '/bookmarks' || pathname.startsWith('/bookmarks/'), href: '/bookmarks', icon: 'compass', label: 'Bookmarks' },
        { active: pathname === '/journal', href: '/journal', icon: 'pencil', label: 'Journal' },
        { active: pathname === '/storage', href: '/storage', icon: 'file', label: 'Storage' },
        { active: pathname.startsWith('/spending') || pathname === '/recurring', href: '/spending', icon: 'wallet', label: 'Spending' },
      ],
    },
    ...(features.length
      ? [
          {
            label: 'Extra features',
            items: features.map((feature) => ({
              active: pathname === feature.href || pathname.startsWith(`${feature.href}/`),
              href: feature.href,
              icon: feature.icon,
              label: feature.label,
            })),
          },
        ]
      : []),
    {
      label: 'Spaces',
      items: [
        ...(spaces ?? []).map((space) => ({
          active: pathname === `/spaces/${space.id}` || pathname.startsWith(`/spaces/${space.id}/`),
          href: `/spaces/${space.id}`,
          icon: <SpaceMark space={space} />,
          label: space.name,
        })),
        { active: pathname === '/spaces', href: '/spaces', icon: 'folder', label: 'All spaces' },
      ],
    },
    {
      items: [
        { active: pathname === '/inbox', badge: unread || undefined, href: '/inbox', icon: 'bell', label: 'Inbox' },
        { active: pathname === '/invitations', href: '/invitations', icon: 'mail', label: 'Invitations' },
        { active: pathname === '/trash', href: '/trash', icon: 'trash', label: 'Trash' },
        { active: pathname.startsWith('/settings'), href: '/settings', icon: 'settings', label: 'Settings' },
      ],
    },
  ];
}
