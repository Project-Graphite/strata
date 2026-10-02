import { createContext, useContext } from 'react';
import { tagColors, TextField, type TagColor } from '@project-graphite/ui';
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
  title: string;
  tags: Tag[];
  archivedAt: string | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SpacesContext = createContext<Resource<Space[]> | null>(null);

export function useSpaces() {
  const context = useContext(SpacesContext);
  if (!context) {
    throw new Error('useSpaces must be used inside the shell');
  }
  return context;
}

export async function addJoinedSpace(
  request: <T>(path: string) => Promise<T>,
  spaces: Resource<Space[]>,
  spaceId: string,
) {
  const space = await request<Space>(`/spaces/${spaceId}`);
  spaces.mutate((current) => [...current.filter((shown) => shown.id !== space.id), space]);
}

export function SpaceDot({ color }: { color: TagColor }) {
  return <span aria-hidden="true" className={`tag-dot tag-${color}`} />;
}

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
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <TextField defaultValue={name} label="Name" maxLength={maxLength} {...field} />
      <label className="field-label">
        Colour
        <select defaultValue={color} name="color">
          {tagColors.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
