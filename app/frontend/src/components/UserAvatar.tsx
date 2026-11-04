import MuiAvatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { readBlob } from '../api';
import { useAuth } from '../auth';

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

export function UserAvatar({ name, present, size = 'md', userId }: { name: string; present?: boolean; size?: 'sm' | 'md' | 'lg'; userId?: string }) {
  const url = useAvatarUrl(userId);
  return (
    <Badge anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} color="success" invisible={!present} overlap="circular" variant="dot">
      <MuiAvatar aria-label={present ? `${name}, here now` : name} className={`avatar avatar-${size}`} role="img" src={url ?? undefined}>
        <span aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
      </MuiAvatar>
    </Badge>
  );
}
