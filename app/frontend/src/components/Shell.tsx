import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppShell,
  Icon,
  OutageGate,
  Sidebar,
  Skeleton,
  SnackbarProvider,
  type ShellTab,
  useCommandShortcut,
} from '@project-graphite/ui';
import { onOutage } from '../api';
import { useAuth } from '../auth';
import { InboxContext } from '../inbox';
import { SpacesContext, type Space } from '../spaces';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';
import { AccountMenu } from './AccountMenu';
import { CrashBoundary } from './CrashBoundary';
import { SearchPalette } from './SearchPalette';
import { UpdatePrompt } from './UpdatePrompt';
import { StrataMark } from './StrataMark';

const sessionHintKey = 'strata-signed-in';

function hadSession() {
  try {
    return localStorage.getItem(sessionHintKey) === '1';
  } catch {
    return false;
  }
}

function rememberSession(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(sessionHintKey, '1');
    else localStorage.removeItem(sessionHintKey);
  } catch {
    return;
  }
}

function SiteFooter() {
  return (
    <footer className="shell mono-sm mt-16 border-t border-line-soft py-8 text-faint">
      <nav aria-label="About" className="flex justify-end gap-5">
        <Link className="text-faint no-underline hover:text-ink" to="/privacy">
          Privacy
        </Link>
        <Link className="text-faint no-underline hover:text-ink" to="/terms">
          Terms
        </Link>
      </nav>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function ShellFrame({ inbox, spaces }: { inbox: Resource<{ unread: number }>; spaces: Resource<Space[]> }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const signingOut = useAction();
  const { reload: checkInbox } = inbox;
  const unread = inbox.data?.unread ?? 0;
  const [searching, setSearching] = useState(false);
  const [expectSession] = useState(hadSession);
  const signedIn = Boolean(auth.user);
  const openSearch = useCallback(() => signedIn && setSearching(true), [signedIn]);
  useCommandShortcut(openSearch);

  useEffect(() => {
    if (auth.ready) rememberSession(signedIn);
  }, [auth.ready, signedIn]);

  useEffect(() => {
    if (!auth.user) return;
    const timer = setInterval(checkInbox, 60_000);
    return () => clearInterval(timer);
  }, [auth.user, checkInbox]);

  const tabs: ShellTab[] = [
    { href: '/', label: 'Home', icon: 'home', active: pathname === '/' },
    ...(auth.user
      ? [
          { href: '/today', label: 'Today', icon: 'check' as const, active: pathname === '/today' },
          { href: '/agenda', label: 'Agenda', icon: 'calendar' as const, active: pathname === '/agenda' || pathname.startsWith('/events/') },
          { href: '/spaces', label: 'Spaces', icon: 'folder' as const, active: pathname.startsWith('/spaces') },
          { href: '/settings', label: 'Settings', icon: 'settings' as const, active: pathname.startsWith('/settings') },
        ]
      : [{ href: '/login', label: 'Sign in', icon: 'user' as const, active: pathname === '/login', loading: !auth.ready }]),
  ];
  const showSidebar = auth.user || (!auth.ready && expectSession);

  return (
    <>
      <ScrollToTop />
      <AppShell
        actions={
          !auth.ready ? (
            <Skeleton className="h-9 w-9 rounded-full" />
          ) : auth.user ? (
            <>
              <button aria-label="Search (Ctrl+K)" className="icon-button" onClick={openSearch} title="Search (Ctrl+K)" type="button">
                <Icon name="search" />
              </button>
              <Link aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'} className="icon-button relative" title="Inbox" to="/inbox">
                <Icon name="bell" />
                {unread > 0 && <span className="count-badge">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <AccountMenu
                onSignOut={() =>
                  void signingOut.run(async () => {
                    await auth.logout();
                    navigate('/');
                    return '';
                  }, 'Could not sign out')
                }
              />
            </>
          ) : (
            <>
              <Link className="secondary-button px-3 py-2 text-sm" to="/login">
                Sign in
              </Link>
              <Link className="primary-button hidden px-3 py-2 text-sm sm:inline-flex" to="/register">
                Create account
              </Link>
            </>
          )
        }
        brand={{ href: '/', mark: <StrataMark />, name: 'Strata' }}
        footer={<SiteFooter />}
        nav={[]}
        sidebar={
          showSidebar && (
            <Sidebar
              label="Areas"
              loading={!auth.user || spaces.loading}
              sections={[
                {
                  items: [
                    { active: pathname === '/', href: '/', icon: 'home', label: 'Home' },
                    { active: pathname === '/today', href: '/today', icon: 'check', label: 'Today' },
                    { active: pathname === '/agenda' || pathname.startsWith('/events/'), href: '/agenda', icon: 'calendar', label: 'Agenda' },
                    { active: pathname === '/recurring', href: '/recurring', icon: 'repeat', label: 'Recurring' },
                    { active: pathname === '/tidy', href: '/tidy', icon: 'sparkles', label: 'Tidy' },
                  ],
                },
                {
                  label: 'Spaces',
                  items: [
                    ...(spaces.data ?? []).map((space) => ({
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
              ]}
            />
          )
        }
        tabs={tabs}
      >
        <OutageGate healthUrl="/api/v1/health" offlineHint="Reconnect to the internet to carry on." productName="Strata" subscribe={onOutage}>
          <CrashBoundary key={pathname}>
            <Outlet />
          </CrashBoundary>
        </OutageGate>
      </AppShell>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      <UpdatePrompt />
    </>
  );
}

export function Shell() {
  const spaces = useResource<Space[]>('/spaces', true);
  const inbox = useResource<{ unread: number }>('/me/inbox/summary', true);

  return (
    <SpacesContext.Provider value={spaces}>
      <InboxContext.Provider value={inbox}>
        <SnackbarProvider>
          <ShellFrame inbox={inbox} spaces={spaces} />
        </SnackbarProvider>
      </InboxContext.Provider>
    </SpacesContext.Provider>
  );
}
