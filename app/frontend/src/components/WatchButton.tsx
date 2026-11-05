import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { EyeGlyph } from './glyphs';
import { UserAvatar } from './UserAvatar';
import { Tip } from './Tip';

interface WatchStatus {
  watching: boolean;
  watchers: { id: string; displayName: string }[];
}

export function WatchButton({ itemId }: { itemId: string }) {
  const auth = useAuth();
  const action = useAction();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const status = useResource<WatchStatus>(`/items/${itemId}/watchers`, true, { live: ['task-details', 'page-details'], itemIds: [itemId] });
  if (!status.data) return null;
  const { watching, watchers } = status.data;
  const close = () => setAnchor(null);

  return (
    <>
      <Tip title={watching ? 'You are watching this' : 'Watchers'}>
        <IconButton
          aria-expanded={Boolean(anchor)}
          aria-haspopup="menu"
          aria-label={watching ? 'Watching. Watchers' : 'Watchers'}
          aria-pressed={watching}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <EyeGlyph filled={watching} />
        </IconButton>
      </Tip>
      <MuiMenu anchorEl={anchor} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} onClose={close} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': 'Watchers' }, paper: { className: 'nested-menu watch-menu min-w-64' } }} transformOrigin={{ horizontal: 'right', vertical: 'top' }}>
        {[
          ...(watching
            ? [
                <MenuItem
                  key="stop"
                  onClick={() => {
                    close();
                    void action.run(async () => {
                      const next = await auth.request<WatchStatus>(`/items/${itemId}/watch`, { method: 'DELETE' });
                      status.mutate(() => next);
                      return 'You stopped watching this.';
                    }, 'Could not stop watching');
                  }}
                >
                  <EyeGlyph filled={false} />
                  <span className="ms-2">Stop watching</span>
                </MenuItem>,
                <Divider key="stop-divider" />,
              ]
            : []),
          <ListSubheader className="filter-menu-heading" key="heading">
            Watching this · {watchers.length}
          </ListSubheader>,
          ...(watchers.length > 0
            ? watchers.map((watcher) => (
                <li className="watch-menu-person" key={watcher.id}>
                  <UserAvatar name={watcher.displayName} size="sm" userId={watcher.id} />
                  <span className="min-w-0 flex-1 truncate">{watcher.id === auth.user?.id ? `${watcher.displayName} (you)` : watcher.displayName}</span>
                </li>
              ))
            : [<li className="watch-menu-person text-muted" key="nobody">Nobody yet</li>]),
        ]}
      </MuiMenu>
    </>
  );
}
