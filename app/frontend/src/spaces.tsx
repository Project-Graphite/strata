import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { ColorSwatches, Icon, tagColors, TextField, type SelectOption, type TagColor } from '@project-graphite/ui';
import { ActiveSpaceContext } from './active-space';
import { useAuth } from './auth';
import { noteHref } from './notes';
import type { Resource } from './useResource';
import { atMost, required, type Check } from './validation';

export type SpaceRole = 'owner' | 'editor' | 'viewer';

export interface Space {
  id: string;
  name: string;
  color: TagColor;
  kind: 'personal' | 'shared';
  role: SpaceRole;
  createdAt: string;
}

export interface Member {
  userId: string;
  displayName: string;
}

export interface Tag {
  id: string;
  spaceId: string;
  name: string;
  color: TagColor;
}

export interface Item {
  id: string;
  spaceId: string;
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

export function useSpaces() {
  const spaces = useAllSpaces();
  const active = useContext(ActiveSpaceContext);
  return active ? { ...spaces, data: spaces.data?.filter((space) => space.id === active.space?.id) } : spaces;
}

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const spaces = useAllSpaces();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const key = user ? `strata-active-space:${user.id}` : undefined;
  const [chosen, setChosen] = useState<string | undefined>(() => {
    if (!key) return undefined;
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch (reason) {
      if (!(reason instanceof DOMException)) throw reason;
      return undefined;
    }
  });
  const routed = /^\/spaces\/(?!invitations(?:\/|$))([^/]+)/.exec(pathname)?.[1] ?? params.get('space');
  const space = spaces.data?.find((space) => space.id === (routed ?? chosen)) ?? spaces.data?.find((space) => space.kind === 'personal') ?? spaces.data?.[0];
  const choose = useCallback((spaceId: string) => {
    if (spaces.data?.some((space) => space.id === spaceId)) setChosen(spaceId);
  }, [spaces.data]);

  useEffect(() => {
    if (!key || !space) return;
    try {
      localStorage.setItem(key, space.id);
    } catch (reason) {
      if (!(reason instanceof DOMException)) throw reason;
    }
    if (routed && routed === space.id) setChosen(space.id);
    if (params.has('space') && spaces.data) {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('space');
        return next;
      }, { replace: true });
    }
  }, [key, space, routed, params, setParams, spaces.data]);

  return <ActiveSpaceContext.Provider value={{ space, choose }}>{children}</ActiveSpaceContext.Provider>;
}

export async function addJoinedSpace(
  request: <T>(path: string) => Promise<T>,
  spaces: Resource<Space[]>,
  spaceId: string,
) {
  const space = await request<Space>(`/spaces/${spaceId}`);
  spaces.mutate((current) => [...current.filter((shown) => shown.id !== space.id), space]);
}

export function itemHref(item: { id: string; kind: string; spaceId: string }) {
  if (item.kind === 'note' || item.kind === 'board') return noteHref(item);
  if (item.kind === 'event') return `/events/${item.id}`;
  if (item.kind === 'bookmark') return `/bookmarks/${item.id}`;
  if (item.kind === 'goal') return `/goals/${item.id}`;
  if (item.kind === 'person') return `/people/${item.id}`;
  if (item.kind === 'recipe') return `/recipes/${item.id}`;
  if (item.kind === 'expense') return `/spending/transactions?space=${item.spaceId}`;
  if (item.kind === 'trip') return `/trips/${item.id}`;
  if (item.kind === 'task') return `/tasks?task=${item.id}`;
  if (item.kind === 'list') return `/tasks?list=${item.id}`;
  if (item.kind === 'subscription') return `/spending/recurring?subscription=${item.id}`;
  return null;
}

const itemKindNames: Record<string, string> = { note: 'page', list: 'task list' };

export const spacesTabs = (active: 'spaces' | 'invitations') => [
  { active: active === 'spaces', href: '/spaces', label: 'Spaces' },
  { active: active === 'invitations', href: '/spaces/invitations', label: 'Invitations' },
];

export const itemKindName = (item: { kind: string; quick: boolean }) => (item.quick ? 'quick note' : (itemKindNames[item.kind] ?? item.kind));

export function SpaceMark({ large = false, space }: { large?: boolean; space: Pick<Space, 'color' | 'name'> & { kind?: Space['kind'] } }) {
  return (
    <span aria-hidden="true" className={`tag-mark tag-${space.color} ${large ? 'space-mark-large' : ''}`} data-initial={space.kind === 'personal' ? undefined : space.name.charAt(0).toUpperCase()}>
      {space.kind === 'personal' && <Icon name="user" size={large ? 18 : 12} />}
    </span>
  );
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

export function usePersonalSpace() {
  const space = useAllSpaces().data?.find((candidate) => candidate.kind === 'personal');
  return { spaceId: space?.id, space, editable: Boolean(space) };
}

export function useChosenSpace() {
  const active = useContext(ActiveSpaceContext);
  if (!active) throw new Error('useChosenSpace must be used inside ActiveSpaceProvider');
  return {
    spaceId: active.space?.id,
    space: active.space,
    editable: Boolean(active.space && active.space.role !== 'viewer'),
    choose: active.choose,
  };
}
