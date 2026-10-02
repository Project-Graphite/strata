import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppShell,
  errorMessage,
  OutageGate,
  Sidebar,
  Skeleton,
  SnackbarProvider,
  type ShellTab,
} from '@project-graphite/ui';
import { onOutage } from '../api';
import { useAuth } from '../auth';
import { SpacesContext, type Space } from '../spaces';
import { useResource } from '../useResource';
import { AccountMenu } from './AccountMenu';
import { StrataMark } from './StrataMark';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link whitespace-nowrap no-underline ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`;

function SiteFooter() {
  return (
    <footer className="shell mono-sm mt-16 border-t border-line-soft py-8 text-faint">
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-3">
        <span>Your life, in layers.</span>
        <nav aria-label="About" className="flex gap-5">
          <Link className="text-faint no-underline hover:text-ink" to="/privacy">
            privacy
          </Link>
          <Link className="text-faint no-underline hover:text-ink" to="/terms">
            terms
          </Link>
        </nav>
      </div>
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

export function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [error, setError] = useState('');
  const spaces = useResource<Space[]>('/spaces', true);

  async function signOut() {
    setError('');
    try {
      await auth.logout();
      navigate('/');
    } catch (reason) {
      setError(errorMessage(reason, 'Could not sign out'));
    }
  }

  const tabs: ShellTab[] = [
    { href: '/', label: 'Home', icon: 'home', active: pathname === '/' },
    ...(auth.user
      ? [
          { href: '/spaces', label: 'Spaces', icon: 'library' as const, active: pathname.startsWith('/spaces') },
          { href: '/settings', label: 'Settings', icon: 'user' as const, active: pathname.startsWith('/settings') },
        ]
      : [{ href: '/login', label: 'Sign in', icon: 'user' as const, active: pathname === '/login', loading: !auth.ready }]),
  ];

  return (
    <SpacesContext.Provider value={spaces}>
      <SnackbarProvider>
        <ScrollToTop />
        <AppShell
          actions={
            !auth.ready ? (
              <Skeleton className="h-9 w-9 rounded-full" />
            ) : auth.user ? (
              <AccountMenu onSignOut={() => void signOut()} />
            ) : (
              <>
                <NavLink className={(state) => `${navClass(state)} mono-sm px-2`} to="/login">
                  sign in
                </NavLink>
                <Link className="primary-button hidden px-3 py-2 text-sm sm:inline-flex" to="/register">
                  Create account
                </Link>
              </>
            )
          }
          alert={
            error && (
              <p className="shell error-message mb-3" role="alert">
                {error}
              </p>
            )
          }
          brand={{ href: '/', mark: <StrataMark />, name: 'Strata' }}
          footer={<SiteFooter />}
          nav={[]}
          sidebar={
            auth.user && (
              <Sidebar
                label="Areas"
                sections={[
                  { items: [{ active: pathname === '/', href: '/', icon: 'home', label: 'Home' }] },
                  {
                    label: 'Spaces',
                    items: [
                      ...(spaces.data ?? []).map((space) => ({
                        active: pathname === `/spaces/${space.id}` || pathname.startsWith(`/spaces/${space.id}/`),
                        href: `/spaces/${space.id}`,
                        label: space.name,
                      })),
                      { active: pathname === '/spaces', href: '/spaces', icon: 'library', label: 'All spaces' },
                    ],
                  },
                  {
                    items: [
                      { active: pathname === '/invitations', href: '/invitations', label: 'Invitations' },
                      { active: pathname === '/trash', href: '/trash', label: 'Trash' },
                      { active: pathname.startsWith('/settings'), href: '/settings', icon: 'user', label: 'Settings' },
                    ],
                  },
                ]}
              />
            )
          }
          tabs={tabs}
        >
          <OutageGate
            healthUrl="/api/v1/health"
            offlineHint="Reconnect to the internet to carry on."
            productName="Strata"
            subscribe={onOutage}
          >
            <Outlet />
          </OutageGate>
        </AppShell>
      </SnackbarProvider>
    </SpacesContext.Provider>
  );
}
