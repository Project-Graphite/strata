import type { TagColor } from '@project-graphite/ui';
import { serverOrigin } from './native-capture';
import { formatMoment } from './time';

export interface Note {
  id: string;
  spaceId: string | null;
  title: string;
  kind: 'note' | 'board';
  parentId: string | null;
  position: number;
  icon: string | null;
  pinnedAt: string | null;
  template: boolean;
  quick: boolean;
  narrow: boolean;
  cover: { id: string; alt: string } | null;
  database: boolean;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChildPages {
  pages: (Note & { hasChildren: boolean })[];
  nextCursor: string | null;
}

export function childPagesPath(spaceId: string | null, parentId: string | null, cursor?: string, kind?: 'note') {
  return `${spaceId ? `/spaces/${spaceId}` : '/me'}/page-children?${new URLSearchParams({ ...(parentId ? { parentId } : {}), ...(cursor ? { cursor } : {}), ...(kind ? { kind } : {}) })}`;
}

export function nestedUnder(pages: Note[], parentId: string | null) {
  const known = new Set(pages.map((page) => page.id));
  return pages.filter((page) => (page.parentId && known.has(page.parentId) ? page.parentId : null) === parentId);
}

export type PagesSection = 'pages' | 'quick-notes' | 'drafts';

export const pagesTabs = (active: PagesSection) => [
  { active: active === 'pages', href: '/pages', label: 'Pages' },
  { active: active === 'quick-notes', href: '/pages/quick-notes', label: 'Quick notes' },
  { active: active === 'drafts', href: '/pages/drafts', label: 'Drafts' },
];

export const boardsTabs = (active: 'boards' | 'drafts') => [
  { active: active === 'boards', href: '/boards', label: 'Boards' },
  { active: active === 'drafts', href: '/boards/drafts', label: 'Drafts' },
];

export const pageIndent = (depth: number) => ({ paddingInlineStart: `${1 + depth * 1.25}rem` });

export const noteArea = (note: Pick<Note, 'kind' | 'spaceId'>) =>
  note.kind === 'board' ? '/boards' : note.spaceId === null ? '/journal' : '/pages';

export const noteParent = (note: Pick<Note, 'kind' | 'quick' | 'spaceId'>) =>
  note.kind === 'board'
    ? { to: '/boards', label: 'Boards' }
    : note.spaceId === null
      ? { to: '/journal', label: 'Journal' }
      : note.quick
        ? { to: '/pages/quick-notes', label: 'Quick notes' }
        : { to: '/pages', label: 'Pages' };

export interface NoteDetails extends Note {
  editable: boolean;
  permissions: { edit: boolean; comment: boolean; share: boolean; organize: boolean; history: boolean; spaceRole: string | null; pageRole: string | null };
  path: { id: string; title: string }[];
  row: { properties: Property[]; values: PropertyValues } | null;
}

export type PropertyType = 'text' | 'number' | 'select' | 'multiSelect' | 'date' | 'checkbox' | 'person' | 'link';
export type PropertyValues = Record<string, unknown>;
export type DatabaseView = 'table' | 'board' | 'list' | 'calendar';

export interface PropertyOption {
  id: string;
  name: string;
  color: TagColor;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options?: PropertyOption[];
}

export interface DatabaseRow extends Note {
  values: PropertyValues;
}

export interface NoteDatabase {
  revision: string;
  properties: Property[];
  view: DatabaseView;
  groupBy: string | null;
  dateBy: string | null;
  rows: DatabaseRow[];
}

export const propertyTypes: [PropertyType, string][] = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['select', 'Select'],
  ['multiSelect', 'Multi-select'],
  ['date', 'Date'],
  ['checkbox', 'Checkbox'],
  ['person', 'Person'],
  ['link', 'Link'],
];

export const databaseViews: [DatabaseView, string][] = [
  ['table', 'Table'],
  ['board', 'Board'],
  ['list', 'List'],
  ['calendar', 'Calendar'],
];

export interface NoteBranch {
  note: Note;
  depth: number;
}

export function flattenTree(notes: Note[]) {
  const children = new Map<string | null, Note[]>();
  const known = new Set(notes.map((note) => note.id));
  for (const note of notes) {
    const parent = note.parentId && known.has(note.parentId) ? note.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), note]);
  }
  const branches: NoteBranch[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const note of children.get(parent) ?? []) {
      branches.push({ note, depth });
      visit(note.id, depth + 1);
    }
  };
  visit(null, 0);
  return branches;
}

const pagesChanged = 'strata:pages-changed';

export function announcePagesChanged() {
  window.dispatchEvent(new Event(pagesChanged));
}

export function onPagesChanged(listener: () => void) {
  window.addEventListener(pagesChanged, listener);
  return () => window.removeEventListener(pagesChanged, listener);
}

export function realtimeUrl() {
  return `${serverOrigin().replace(/^http/, 'ws')}/api/v1/realtime`;
}

export const builtInTemplates = [
  ['meeting', 'Meeting notes'],
  ['journal', 'Journal'],
  ['project', 'Project brief'],
  ['recipe', 'Recipe'],
] as const;

export const noteTitle = (note: { title: string }) => note.title || 'Untitled';

export const noteEdited = (note: { updatedAt: string }) => `Edited ${formatMoment(note.updatedAt)}`;

export const pageHref = (id: string) => `/pages/${id}`;

export const journalPageHref = (id: string) => `/journal/${id}`;

export const noteHref = (note: { id: string; kind: string; spaceId?: string | null }) => (note.kind === 'board' ? `/boards/${note.id}` : note.spaceId === null ? journalPageHref(note.id) : pageHref(note.id));

export const pageNoun = (note: Pick<Note, 'kind' | 'quick'>) => (note.kind === 'board' ? 'board' : note.quick ? 'note' : 'page');
