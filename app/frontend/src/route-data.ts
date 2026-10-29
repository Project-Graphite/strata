import { useEffect } from 'react';
import { apiRequest } from './api';
import { initialSession } from './auth';
import { routePage } from './route-pages';
import { storedSpace } from './spaces';
import { cachedRequest } from './useResource';

type Request = <T>(path: string) => Promise<T>;

export const taskPage = (path: string, number: number) => `${path}${path.includes('?') ? '&' : '?'}page=${number}`;

const pages = import.meta.glob(['./pages/*.tsx', './pages/spaces/SpacesPage.tsx', './dashboard/Dashboard.tsx', '!./pages/HomePage.tsx', '!./pages/LoginPage.tsx']);

const firstData: Record<string, (personal?: string) => string[]> = {
  '/tasks': () => ['/me', '/me/lists', taskPage('/me/tasks', 1)],
  '/spending': (personal) => ['/me', ...(personal ? ['spending', 'accounts', 'captures', 'spending-categories'].map((part) => `/spaces/${personal}/${part}`) : [])],
};

function prefetchData(pathname: string, userId: string, request: Request) {
  const paths = firstData[pathname];
  if (!paths) return;
  for (const path of ['/spaces', ...paths(storedSpace('personal', userId))]) cachedRequest(request, userId, path, storedSpace('active', userId))?.catch(() => undefined);
}

export function prefetchRoute(href: string, viewer?: { id: string; request: Request }) {
  const { origin, pathname, search } = new URL(href, window.location.origin);
  if (origin !== window.location.origin) return;
  const page = routePage(pathname);
  if (page) pages[`./${page}.tsx`]?.().catch(() => undefined);
  if (viewer && !search) prefetchData(pathname, viewer.id, viewer.request);
}

export function usePrefetchRoutes(hrefs: string[] | undefined) {
  const key = hrefs?.join(' ');
  useEffect(() => {
    if (!key) return;
    const prefetch = () => key.split(' ').forEach((href) => prefetchRoute(href));
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(prefetch);
      else prefetch();
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [key]);
}

void initialSession.then((session) => {
  if (session && !window.location.search) prefetchData(window.location.pathname, session.user.id, (path) => apiRequest(path, {}, session.accessToken));
}, () => undefined);
