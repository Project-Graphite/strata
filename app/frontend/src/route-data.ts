import { useEffect } from 'react';
import { agendaPath, agendaPeriod, type AgendaView } from './agenda';
import { apiRequest } from './api';
import { initialSession } from './auth';
import { routePage } from './route-pages';
import { storedSpace } from './spaces';
import { applyTimePreferences, profileDay } from './time';
import { cachedRequest } from './useResource';

type Request = <T>(path: string) => Promise<T>;

export const taskPage = (path: string, number: number) => `${path}${path.includes('?') ? '&' : '?'}page=${number}`;

const pages = import.meta.glob(['./pages/*.tsx', './pages/spaces/SpacesPage.tsx', './pages/spaces/SpaceLayout.tsx', './dashboard/Dashboard.tsx', '!./pages/HomePage.tsx', '!./pages/LoginPage.tsx']);

function agendaData(view: AgendaView) {
  if (view === 'month' || view === 'week') return ['/me', '/me/calendars'];
  const { from, to } = agendaPeriod(view, profileDay(), 0);
  return ['/me', '/me/calendars', agendaPath(from, to)];
}

const firstData: [RegExp, (match: RegExpExecArray) => string[]][] = [
  [/^\/tasks$/, () => ['/me', '/me/lists', taskPage('/me/tasks', 1)]],
  [/^\/spending$/, () => ['/me', '/me/spending', '/me/accounts', '/me/captures', '/me/spending-categories']],
  [/^\/agenda\/(day|week|month|list)$/, ([, view]) => agendaData(view as AgendaView)],
  [/^\/(?:pages|boards)\/(?!quick-notes$|drafts$)([^/]+)$/, ([, id]) => [`/notes/${id}`]],
];

function prefetchData(pathname: string, userId: string, request: Request) {
  for (const [pattern, paths] of firstData) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    for (const path of ['/spaces', ...paths(match)]) cachedRequest(request, userId, path, storedSpace(userId))?.catch(() => undefined);
    return;
  }
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
  if (!session) return;
  const request: Request = (path) => apiRequest(path, {}, session.accessToken);
  for (const path of ['/me/dashboards', '/me/inbox/summary']) cachedRequest(request, session.user.id, path, undefined)?.catch(() => undefined);
  applyTimePreferences(session.user.timeZone, session.user.timeFormat);
  if (!window.location.search) prefetchData(window.location.pathname, session.user.id, request);
}, () => undefined);
