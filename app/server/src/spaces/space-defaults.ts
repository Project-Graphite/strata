import type { Prisma } from '@prisma/client';

export interface SpaceDefaults {
  page: { icon: string | null; narrow: boolean; template: string | null };
  board: { icon: string | null; template: string | null };
  task: { type: string; priority: number; assignee: 'creator' | 'none'; status: 'open' | 'in_progress'; listId: string | null; view: 'list' | 'board' };
  access: { inviteRole: 'editor' | 'viewer'; inviters: 'owners' | 'editors'; sharers: 'owners' | 'editors'; linkDays: number | null };
}

type Stored = { [Kind in keyof SpaceDefaults]?: Partial<SpaceDefaults[Kind]> };

export function spaceDefaults(stored: Prisma.JsonValue | undefined): SpaceDefaults {
  const saved = (stored ?? {}) as Stored;
  return {
    page: { icon: null, narrow: false, template: null, ...saved.page },
    board: { icon: null, template: null, ...saved.board },
    task: { type: 'task', priority: 0, assignee: 'creator', status: 'open', listId: null, view: 'board', ...saved.task },
    access: { inviteRole: 'editor', inviters: 'owners', sharers: 'editors', linkDays: 30, ...saved.access },
  };
}

const given = <T extends object>(values: T | undefined) => Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value !== undefined)) as Partial<T>;

export function mergedDefaults(stored: Prisma.JsonValue, change: Stored): SpaceDefaults {
  const current = spaceDefaults(stored);
  return {
    page: { ...current.page, ...given(change.page) },
    board: { ...current.board, ...given(change.board) },
    task: { ...current.task, ...given(change.task) },
    access: { ...current.access, ...given(change.access) },
  };
}
