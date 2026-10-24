import { createContext } from 'react';
import type { Space } from './spaces';

export const ActiveSpaceContext = createContext<{
  space?: Space;
  choose(spaceId: string): void;
} | null>(null);

const scopedPaths = new Set([
  '/agenda', '/tasks/today', '/search', '/me/notes', '/me/pages', '/me/tasks', '/me/lists',
  '/me/bookmarks', '/me/goals', '/me/trips', '/me/people', '/me/recipes', '/me/habits',
  '/me/calendars', '/subscriptions/summary', '/me/storage', '/tidy/scan',
]);

export function isSpaceResource(path: string) {
  return scopedPaths.has(path.split('?')[0]!);
}

export function inActiveSpace(path: string, spaceId?: string) {
  if (!spaceId || !isSpaceResource(path)) return path;
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('spaceId', spaceId);
  return `${pathname}?${params}`;
}
