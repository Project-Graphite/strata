import type { SidebarSection } from '@project-graphite/ui';
import type { Space } from './spaces';

export const moreAreas = ['/menu', '/pages', '/boards', '/bookmarks', '/journal', '/recurring', '/tidy', '/inbox', '/invitations', '/trash', '/settings', '/admin'];

export function areaSections(pathname: string, spaces: Space[] | undefined, unread: number): SidebarSection[] {
  return [
    {
      items: [
        { active: pathname === '/', href: '/', icon: 'home', label: 'Home' },
        { active: pathname === '/today', href: '/today', icon: 'check', label: 'Today' },
        { active: pathname === '/agenda' || pathname.startsWith('/agenda/') || pathname.startsWith('/events/'), href: '/agenda', icon: 'calendar', label: 'Agenda' },
        { active: pathname === '/pages', href: '/pages', icon: 'library', label: 'Pages' },
        { active: pathname === '/boards', href: '/boards', icon: 'panel', label: 'Boards' },
        { active: pathname === '/bookmarks' || pathname.startsWith('/bookmarks/'), href: '/bookmarks', icon: 'compass', label: 'Bookmarks' },
        { active: pathname === '/journal', href: '/journal', icon: 'pencil', label: 'Journal' },
        { active: pathname === '/recurring', href: '/recurring', icon: 'repeat', label: 'Recurring' },
        { active: pathname === '/tidy', href: '/tidy', icon: 'sparkles', label: 'Tidy' },
      ],
    },
    {
      label: 'Spaces',
      items: [
        ...(spaces ?? []).map((space) => ({
          active: pathname === `/spaces/${space.id}` || pathname.startsWith(`/spaces/${space.id}/`),
          href: `/spaces/${space.id}`,
          icon: (
            <span aria-hidden="true" className={`tag-mark tag-${space.color}`}>
              {space.name.charAt(0).toUpperCase()}
            </span>
          ),
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
