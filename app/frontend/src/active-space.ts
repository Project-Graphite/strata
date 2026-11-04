import { createContext } from 'react';
import type { Space } from './spaces';

export const ActiveSpaceContext = createContext<{
  space?: Space;
  choose(spaceId: string | null): void;
} | null>(null);

const scopedPaths = new Set(['/tasks/today', '/search', '/me/notes', '/me/pages', '/me/tasks', '/me/lists', '/tidy/scan']);

export function isSpaceResource(path: string) {
  return scopedPaths.has(path.split('?')[0]!);
}

export function inActiveSpace(path: string, spaceId?: string) {
  if (!isSpaceResource(path)) return path;
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query);
  if (params.get('home') === 'account') return path;
  if (spaceId) params.set('spaceId', spaceId);
  else {
    params.delete('spaceId');
    params.set('home', 'account');
  }
  return `${pathname}?${params}`;
}
