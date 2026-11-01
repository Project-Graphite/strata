import useMediaQuery from '@mui/material/useMediaQuery';
import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppShell,
  ErrorState,
  IconButton,
  OutageGate,
  PageSkeleton,
  PageTransition,
  Sidebar,
  Skeleton,
  SnackbarProvider,
  useCommandShortcut,
} from '@project-graphite/ui';
import { onOutage } from '../api';
import { apiUrl } from '../native-capture';
import { watchChanges } from '../changes';
import { useAuth } from '../auth';
import { InboxContext } from '../inbox';
import { enabledApps } from '../apps';
import { AreaContext, areaOf, phoneTabBar, sidebarSections, useSlowNavigation } from '../navigation';
import { ActiveSpaceProvider, SpacesContext, useChosenSpace, type Space } from '../spaces';
import { PageNavigationProvider } from '../page-navigation';
import { pageScroller } from '../page-scroll';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';
import { AboutLinks } from './AboutLinks';
import { AccountMenu } from './AccountMenu';
import { ButtonLink, IconLink } from './Button';
import { CrashBoundary } from './CrashBoundary';
import { PageTree } from './PageTree';
import { UpdatePrompt } from './UpdatePrompt';
import { StrataMark } from './StrataMark';
import { SiteBackdrop } from '../dashboard/backdrop';
import { SpaceNavigation } from './SpaceNavigation';
import { HeaderTitleProvider } from '../header-title';

const SearchPalette = lazy(() => import('./SearchPalette').then((module) => ({ default: module.SearchPalette })));
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
  const area = /^\/(?:spaces\/[^/]+|settings|spending|agenda|pages|recipes|tidy)(?=\/|$)/.exec(pathname)?.[0] ?? pathname;
  useLayoutEffect(() => {
    pageScroller().scrollTo({ top: 0, behavior: 'instant' });
  }, [area]);
  return null;
}

function ShellFrame({ inbox, spaces }: { inbox: Resource<{ unread: number }>; spaces: Resource<Space[]> }) {
  const auth = useAuth();
  const { spaceId } = useChosenSpace();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const signingOut = useAction();
  const pageRoute = /^\/(?:(?:pages|boards|share)\/[^/]+|pages)\/?$/.test(pathname);
  const subscribeToOutage = useCallback((listener: () => void) => pageRoute ? () => {} : onOutage(listener), [pageRoute]);
  const unread = inbox.data?.unread ?? 0;
  const [searching, setSearching] = useState(false);
  const [expectSession] = useState(hadSession);
  const [areaOverride, setArea] = useState<string | null>(null);
  const areaContext = useMemo(() => ({ setArea }), []);
  const active = areaOverride ?? areaOf(pathname);
  const signedIn = Boolean(auth.user);
  const transitions = useMediaQuery('(min-width: 64rem) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  const apps = enabledApps(auth.user?.features);
  const openSearch = useCallback(() => signedIn && setSearching(true), [signedIn]);
  useCommandShortcut(openSearch);

  useEffect(() => {
    if (auth.ready) rememberSession(signedIn);
  }, [auth.ready, signedIn]);

  useEffect(() => (signedIn ? watchChanges(auth.request) : undefined), [auth.request, signedIn]);

  const showSidebar = auth.user || (!auth.ready && expectSession);
  const slowNavigation = useSlowNavigation(pathname);
  const content = useMemo(
    () => (
      <CrashBoundary key={spaceId}>
        <Suspense fallback={<PageSkeleton label="Loading page" />}>
          {transitions ? <PageTransition page={pathname}><Outlet /></PageTransition> : <Fragment key={pathname}><Outlet /></Fragment>}
        </Suspense>
      </CrashBoundary>
    ),
    [pathname, spaceId, transitions],
  );

  return (
    <>
      <ScrollToTop />
      <AppShell
        actions={
          !auth.ready ? (
            <Skeleton className="h-9 w-9 rounded-full" />
          ) : auth.user ? (
            <>
              <SpaceNavigation active={active} />
              <div className="shell-account-actions ml-auto flex shrink-0 items-center gap-2">
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
              </div>
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
              footer={auth.user && <PageTree key={spaceId} />}
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
        <OutageGate healthUrl={apiUrl('/health')} key={pageRoute ? 'page' : 'app'} offlineHint="Reconnect to the internet to carry on." productName="Strata" subscribe={subscribeToOutage}>
          {auth.restoreError ? (
            <ErrorState onRetry={() => window.location.reload()} title="Your session could not be restored">
              {auth.restoreError}
            </ErrorState>
          ) : (
            <AreaContext.Provider value={areaContext}>
              {slowNavigation ? <PageSkeleton label="Loading page" /> : content}
            </AreaContext.Provider>
          )}
        </OutageGate>
      </AppShell>
      {searching && (
        <Suspense fallback={null}>
          <SearchPalette key={spaceId} onClose={() => setSearching(false)} />
        </Suspense>
      )}
      <UpdatePrompt />
    </>
  );
}

export function Shell() {
  const auth = useAuth();
  const spaces = useResource<Space[]>('/spaces', true);
  const inbox = useResource<{ unread: number }>('/me/inbox/summary', true, { live: ['inbox'] });

  return (
    <SpacesContext.Provider value={spaces}>
      <InboxContext.Provider value={inbox}>
        <SnackbarProvider>
          <ActiveSpaceProvider key={auth.user?.id}><SiteBackdrop>
            <HeaderTitleProvider enabled={Boolean(auth.user)}><PageNavigationProvider key={auth.user?.id}><ShellFrame inbox={inbox} spaces={spaces} /></PageNavigationProvider></HeaderTitleProvider>
          </SiteBackdrop></ActiveSpaceProvider>
        </SnackbarProvider>
      </InboxContext.Provider>
    </SpacesContext.Provider>
  );
}
