import type { Prisma } from '@prisma/client';

export interface SpaceDefaults {
  page: { icon: string | null; narrow: boolean };
  board: { icon: string | null };
  task: { type: string; priority: number; assignee: 'creator' | 'none' };
}

type Stored = { [Kind in keyof SpaceDefaults]?: Partial<SpaceDefaults[Kind]> };

export function spaceDefaults(stored: Prisma.JsonValue | undefined): SpaceDefaults {
  const saved = (stored ?? {}) as Stored;
  return {
    page: { icon: null, narrow: false, ...saved.page },
    board: { icon: null, ...saved.board },
    task: { type: 'task', priority: 0, assignee: 'creator', ...saved.task },
  };
}

const given = <T extends object>(values: T | undefined) => Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value !== undefined)) as Partial<T>;

export function mergedDefaults(stored: Prisma.JsonValue, change: Stored): SpaceDefaults {
  const current = spaceDefaults(stored);
  return {
    page: { ...current.page, ...given(change.page) },
    board: { ...current.board, ...given(change.board) },
    task: { ...current.task, ...given(change.task) },
  };
}
