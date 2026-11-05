import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ColorSwatches, tagColors, TextField, type SelectOption, type TagColor } from '@project-graphite/ui';
import { ActiveSpaceContext } from './active-space';
import { noteHref } from './notes';
import type { Resource } from './useResource';
import { atMost, required, type Check } from './validation';

export type SpaceRole = 'owner' | 'editor' | 'viewer';

export interface Space {
  id: string;
  slug: string;
  name: string;
  color: TagColor;
  description: string;
  defaults?: SpaceDefaults;
  archived?: boolean;
  role: SpaceRole;
  createdAt: string;
}

export interface SpaceDefaults {
  page: { icon: string | null; narrow: boolean; template: string | null };
  board: { icon: string | null; template: string | null };
  access: { inviteRole: 'editor' | 'viewer'; inviters: 'owners' | 'editors'; sharers: 'owners' | 'editors'; linkDays: number | null };
  task: { type: string; priority: number; assignee: 'creator' | 'none'; status: 'open' | 'in_progress'; listId: string | null; view: 'list' | 'board' };
}

export const spaceHref = (space: Pick<Space, 'slug'>, tab?: string) => `/spaces/${space.slug}${tab ? `/${tab}` : ''}`;

export const findSpace = (spaces: Space[] | undefined, idOrSlug: string | undefined) => spaces?.find((space) => space.slug === idOrSlug || space.id === idOrSlug);

export const homePath = (spaceId: string | null | undefined, path: string) => `${spaceId ? `/spaces/${spaceId}` : '/me'}/${path}`;

export interface Member {
  userId: string;
  handle: string;
  displayName: string;
}

export interface Tag {
  id: string;
  spaceId: string | null;
  name: string;
  color: TagColor;
}

export interface Item {
  id: string;
  spaceId: string | null;
  kind: string;
  quick: boolean;
  title: string;
  tags: Tag[];
  file: { mimeType: string; sizeBytes: number; width: number | null; height: number | null } | null;
  archivedAt: string | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SpacesContext = createContext<Resource<Space[]> | null>(null);

export function useAllSpaces() {
  const context = useContext(SpacesContext);
  if (!context) {
    throw new Error('useAllSpaces must be used inside the shell');
  }
  return context;
}

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const spaces = useAllSpaces();
  const { pathname } = useLocation();
  const space = findSpace(spaces.data, /^\/spaces\/(?!invitations(?:\/|$))([^/]+)/.exec(pathname)?.[1]);
  return <ActiveSpaceContext.Provider value={space}>{children}</ActiveSpaceContext.Provider>;
}

export async function addJoinedSpace(
  request: <T>(path: string) => Promise<T>,
  spaces: Resource<Space[]>,
  spaceId: string,
) {
  const space = await request<Space>(`/spaces/${spaceId}`);
  spaces.mutate((current) => [...current.filter((shown) => shown.id !== space.id), space]);
  return space;
}

export function itemHref(item: { id: string; kind: string }) {
  if (item.kind === 'note' || item.kind === 'board') return noteHref(item);
  if (item.kind === 'event') return `/events/${item.id}`;
  if (item.kind === 'bookmark') return `/bookmarks/${item.id}`;
  if (item.kind === 'goal') return `/goals/${item.id}`;
  if (item.kind === 'person') return `/people/${item.id}`;
  if (item.kind === 'recipe') return `/recipes/${item.id}`;
  if (item.kind === 'task') return `/tasks?task=${item.id}`;
  if (item.kind === 'list') return `/tasks?list=${item.id}`;
  if (item.kind === 'folder') return `/files?folder=${item.id}`;
  return null;
}

const itemKindNames: Record<string, string> = { note: 'page', list: 'epic' };

export const spacesTabs = (active: 'spaces' | 'invitations') => [
  { active: active === 'spaces', href: '/spaces', label: 'Spaces' },
  { active: active === 'invitations', href: '/spaces/invitations', label: 'Invitations' },
];

export const itemKindName = (item: { kind: string; quick: boolean }) => (item.quick ? 'quick note' : (itemKindNames[item.kind] ?? item.kind));

export function SpaceMark({ large = false, space }: { large?: boolean; space: Pick<Space, 'color' | 'name'> }) {
  return <span aria-hidden="true" className={`tag-mark tag-${space.color} ${large ? 'space-mark-large' : ''}`} data-initial={space.name.charAt(0).toUpperCase()} />;
}

export function spaceOptions(spaces: Space[]): SelectOption[] {
  return spaces.map((space) => ({ value: space.id, label: space.name, leading: <SpaceMark space={space} /> }));
}

export const colorOptions: SelectOption<TagColor>[] = tagColors.map((color) => ({
  value: color,
  label: color.charAt(0).toUpperCase() + color.slice(1),
  leading: <span aria-hidden="true" className={`swatch-dot tag-${color}`} />,
}));

export const roleOptions: SelectOption<SpaceRole>[] = [
  { value: 'owner', label: 'Owner', hint: 'Can manage members' },
  { value: 'editor', label: 'Editor', hint: 'Can add and change things' },
  { value: 'viewer', label: 'Viewer', hint: 'Can only look' },
];

export const spaceNameChecks: Check[] = [required('Enter a name.'), atMost(60, 'Use at most 60 characters.')];

export function nameAndColorFrom(form: HTMLFormElement) {
  const values = new FormData(form);
  return { name: String(values.get('name')).trim(), color: String(values.get('color')) as TagColor };
}

export function NameAndColorFields({
  color = 'gray',
  field,
  maxLength,
  name,
}: {
  color?: TagColor;
  field: { name: string; error?: string; onInput: () => void };
  maxLength: number;
  name?: string;
}) {
  return (
    <div className="grid gap-4">
      <TextField autoFocus defaultValue={name} label="Name" maxLength={maxLength} {...field} />
      <ColorSwatches defaultValue={color} label="Colour" name="color" />
    </div>
  );
}

export function useCurrentSpace() {
  const space = useContext(ActiveSpaceContext);
  return { spaceId: space?.id, space, editable: space?.role !== 'viewer' };
}
