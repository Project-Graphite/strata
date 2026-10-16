import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppShell,
  ErrorState,
  OutageGate,
  Sidebar,
  Skeleton,
  SnackbarProvider,
  type ShellTab,
  useCommandShortcut,
} from '@project-graphite/ui';
import { onOutage } from '../api';
import { watchChanges } from '../changes';
import { useAuth } from '../auth';
import { InboxContext, unreadBadge } from '../inbox';
import { enabledFeatures } from '../features';
import { areaSections, moreAreas } from '../navigation';
import { SpacesContext, type Space } from '../spaces';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';
import { AboutLinks } from './AboutLinks';
import { AccountMenu } from './AccountMenu';
import { ButtonLink, IconButton, IconLink } from './Button';
import { CrashBoundary } from './CrashBoundary';
import { PageTree } from './PageTree';
import { SearchPalette } from './SearchPalette';
import { UpdatePrompt } from './UpdatePrompt';
import { StrataMark } from './StrataMark';
import { SiteBackdrop } from '../dashboard/backdrop';

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

function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className={`shell mt-16 border-t border-line-soft py-8 ${signedIn ? 'hidden md:block' : ''}`}>
      <AboutLinks className="justify-end" />
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
  const unread = inbox.data?.unread ?? 0;
  const [searching, setSearching] = useState(false);
  const [expectSession] = useState(hadSession);
  const signedIn = Boolean(auth.user);
  const openSearch = useCallback(() => signedIn && setSearching(true), [signedIn]);
  useCommandShortcut(openSearch);

  useEffect(() => {
    if (auth.ready) rememberSession(signedIn);
  }, [auth.ready, signedIn]);

  useEffect(() => (signedIn ? watchChanges(auth.request) : undefined), [auth.request, signedIn]);

  const tabs: ShellTab[] = [
    { href: '/', label: 'Home', icon: 'home', active: pathname === '/' },
    ...(auth.user
      ? [
          { href: '/spending', label: 'Spending', icon: 'wallet' as const, active: pathname.startsWith('/spending') || pathname === '/recurring' },
          { href: '/agenda', label: 'Agenda', icon: 'calendar' as const, active: pathname === '/agenda' || pathname === '/today' || pathname.startsWith('/agenda/') || pathname.startsWith('/events/') },
          { href: '/spaces', label: 'Spaces', icon: 'folder' as const, active: pathname.startsWith('/spaces') },
          { href: '/menu', label: 'More', icon: 'more' as const, active: moreAreas.some((area) => pathname === area || pathname.startsWith(`${area}/`)) },
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
              <IconButton icon="search" label="Search (Ctrl+K)" onClick={openSearch} />
              <IconLink icon="bell" label={unread ? `Inbox, ${unread} unread` : 'Inbox'} to="/inbox">
                {unread > 0 && <span className="count-badge">{unreadBadge(unread)}</span>}
              </IconLink>
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
              <ButtonLink label="Sign in" to="/login" />
              <span className="hidden sm:inline-flex">
                <ButtonLink label="Create account" primary to="/register" />
              </span>
            </>
          )
        }
        brand={{ href: '/', mark: <StrataMark />, name: 'Strata' }}
        footer={<SiteFooter signedIn={signedIn} />}
        nav={[]}
        sidebar={
          showSidebar && (
            <Sidebar
              footer={auth.user && <PageTree />}
              label="Areas"
              loading={!auth.user || spaces.loading}
              sections={areaSections(pathname, spaces.data, unread, enabledFeatures(auth.user?.features))}
            />
          )
        }
        tabs={tabs}
      >
        <OutageGate healthUrl="/api/v1/health" offlineHint="Reconnect to the internet to carry on." productName="Strata" subscribe={onOutage}>
          {auth.restoreError ? (
            <ErrorState onRetry={() => window.location.reload()} title="Your session could not be restored">
              {auth.restoreError}
            </ErrorState>
          ) : (
            <CrashBoundary key={pathname}>
              <Outlet />
            </CrashBoundary>
          )}
        </OutageGate>
      </AppShell>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      <UpdatePrompt />
    </>
  );
}

export function Shell() {
  const spaces = useResource<Space[]>('/spaces', true);
  const inbox = useResource<{ unread: number }>('/me/inbox/summary', true, { live: ['inbox'] });

  return (
    <SpacesContext.Provider value={spaces}>
      <InboxContext.Provider value={inbox}>
        <SnackbarProvider>
          <SiteBackdrop>
            <ShellFrame inbox={inbox} spaces={spaces} />
          </SiteBackdrop>
        </SnackbarProvider>
      </InboxContext.Provider>
    </SpacesContext.Provider>
  );
}
