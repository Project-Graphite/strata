import MuiAvatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { Tip } from './Tip';

const pictures = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function forgetAvatar(userId: string) {
  pictures.delete(userId);
  version += 1;
  for (const listener of listeners) listener();
}

export function useAvatarUrl(userId: string | undefined) {
  const { request } = useAuth();
  const current = useSyncExternalStore(subscribe, () => version);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    let picture = pictures.get(userId);
    if (!picture) {
      picture = request<Blob>(`/users/${userId}/avatar`, {}, readBlob).then(
        (blob) => URL.createObjectURL(blob),
        () => null,
      );
      pictures.set(userId, picture);
    }
    void picture.then((loaded) => live && setUrl(loaded));
    return () => {
      live = false;
    };
  }, [current, request, userId]);

  return userId ? url : null;
}

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words.slice(0, 1);
  return letters.map((word) => [...word][0]!.toLocaleUpperCase()).join('') || '?';
}

type AvatarSize = 'sm' | 'md' | 'lg';

export function UserAvatar({ name, present, size = 'md', userId }: { name: string; present?: boolean; size?: AvatarSize; userId?: string }) {
  const url = useAvatarUrl(userId);
  const label = present ? `${name}, here now` : name;
  return (
    <Tip title={label}>
      <Badge anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} color="success" invisible={!present} overlap="circular" variant="dot">
        <MuiAvatar aria-label={label} className={`avatar avatar-${size}`} role="img" src={url ?? undefined}>
          <span aria-hidden="true">{initialsOf(name)}</span>
        </MuiAvatar>
      </Badge>
    </Tip>
  );
}

export interface AvatarPerson {
  id: string;
  name: string;
  present?: boolean;
  userId?: string;
}

export function AvatarStack({ label, max = 4, people, size = 'sm' }: { label: string; max?: number; people: AvatarPerson[]; size?: AvatarSize }) {
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const hidden = people.slice(shown.length);
  return (
    <span aria-label={`${label}: ${people.map((person) => person.name).join(', ')}`} className="avatar-stack" role="group">
      {shown.map((person) => (
        <UserAvatar key={person.id} name={person.name} present={person.present} size={size} userId={person.userId} />
      ))}
      {hidden.length > 0 && (
        <Tip title={hidden.map((person) => person.name).join(', ')}>
          <span aria-hidden="true" className={`avatar avatar-${size} avatar-more`}>
            +{hidden.length}
          </span>
        </Tip>
      )}
    </span>
  );
}
