import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppShell,
  ErrorState,
  IconButton,
  OutageGate,
  Sidebar,
  Skeleton,
  SnackbarProvider,
  useCommandShortcut,
} from '@project-graphite/ui';
import { onOutage } from '../api';
import { watchChanges } from '../changes';
import { useAuth } from '../auth';
import { InboxContext } from '../inbox';
import { enabledApps } from '../apps';
import { AreaContext, areaOf, phoneTabBar, sidebarSections } from '../navigation';
import { SpacesContext, type Space } from '../spaces';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';
import { AboutLinks } from './AboutLinks';
import { AccountMenu } from './AccountMenu';
import { ButtonLink, IconLink } from './Button';
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

function SiteFooter() {
  return (
    <footer className="shell mt-16 border-t border-line-soft py-8">
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
  const [areaOverride, setArea] = useState<string | null>(null);
  const areaContext = useMemo(() => ({ setArea }), []);
  const active = areaOverride ?? areaOf(pathname);
  const signedIn = Boolean(auth.user);
  const apps = enabledApps(auth.user?.features);
  const openSearch = useCallback(() => signedIn && setSearching(true), [signedIn]);
  useCommandShortcut(openSearch);

  useEffect(() => {
    if (auth.ready) rememberSession(signedIn);
  }, [auth.ready, signedIn]);

  useEffect(() => (signedIn ? watchChanges(auth.request) : undefined), [auth.request, signedIn]);

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
              <IconLink badge={unread} icon="bell" label={unread ? `Inbox, ${unread} unread` : 'Inbox'} to="/inbox" />
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
        footer={auth.ready && !signedIn && <SiteFooter />}
        nav={[]}
        sidebar={
          showSidebar && (
            <Sidebar
              footer={auth.user && <PageTree />}
              label="Areas"
              loading={!auth.user || spaces.loading}
              sections={sidebarSections(active, spaces.data, apps)}
            />
          )
        }
        tabs={
          auth.user
            ? phoneTabBar(active, apps)
            : [
                { href: '/', label: 'Home', icon: 'home', active: pathname === '/' },
                { href: '/login', label: 'Sign in', icon: 'user', active: pathname === '/login', loading: !auth.ready },
              ]
        }
      >
        <OutageGate healthUrl="/api/v1/health" offlineHint="Reconnect to the internet to carry on." productName="Strata" subscribe={onOutage}>
          {auth.restoreError ? (
            <ErrorState onRetry={() => window.location.reload()} title="Your session could not be restored">
              {auth.restoreError}
            </ErrorState>
          ) : (
            <AreaContext.Provider value={areaContext}>
              <CrashBoundary key={pathname}>
                <Outlet />
              </CrashBoundary>
            </AreaContext.Provider>
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
