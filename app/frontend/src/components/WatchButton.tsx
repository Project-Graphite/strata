import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { Avatar, Icon } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Member } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { EyeGlyph } from './glyphs';

interface WatchStatus {
  watching: boolean;
  watchers: { id: string; displayName: string }[];
}

export function WatchButton({ itemId, manage, spaceId }: { itemId: string; manage: boolean; spaceId: string }) {
  const auth = useAuth();
  const action = useAction();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const status = useResource<WatchStatus>(`/items/${itemId}/watchers`, true, { live: ['task-details', 'page-details'], itemIds: [itemId] });
  const members = useResource<Member[]>(anchor && adding ? `/spaces/${spaceId}/members` : null, true);
  if (!status.data) return null;
  const { watching, watchers } = status.data;
  const close = () => {
    setAnchor(null);
    setAdding(false);
  };
  const change = (path: string, method: 'PUT' | 'DELETE', message: string) =>
    void action.run(async () => {
      const next = await auth.request<WatchStatus>(path, { method });
      status.mutate(() => next);
      return message;
    }, 'Could not change who is watching');
  const candidates = (members.data ?? []).filter((member) => !watchers.some((watcher) => watcher.id === member.userId));

  return (
    <>
      <IconButton
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        aria-label={watching ? 'Watching. Watch options' : 'Watch options'}
        aria-pressed={watching}
        onClick={(event) => setAnchor(event.currentTarget)}
        title={watching ? 'You are watching this' : 'Watch'}
      >
        <EyeGlyph filled={watching} />
      </IconButton>
      <MuiMenu anchorEl={anchor} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} onClose={close} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': 'Watch options' }, paper: { className: 'nested-menu watch-menu min-w-64' } }} transformOrigin={{ horizontal: 'right', vertical: 'top' }}>
        {adding
          ? [
              <MenuItem className="nested-menu-back" key="back" onClick={() => setAdding(false)}>
                <Icon name="chevron-left" size={16} />
                <span className="font-semibold">Add a watcher</span>
              </MenuItem>,
              <Divider key="back-divider" />,
              ...(members.data
                ? candidates.length > 0
                  ? candidates.map((member) => (
                      <MenuItem
                        key={member.userId}
                        onClick={() => {
                          close();
                          change(`/items/${itemId}/watchers/${member.userId}`, 'PUT', `${member.displayName} is watching this now.`);
                        }}
                      >
                        <Avatar name={member.displayName} size="sm" />
                        <span className="ms-2 min-w-0 truncate">{member.displayName}</span>
                      </MenuItem>
                    ))
                  : [<MenuItem disabled key="none">Everyone here is watching</MenuItem>]
                : [<MenuItem disabled key="loading">{members.error ? 'Could not load the people in this space' : 'Loading people…'}</MenuItem>]),
            ]
          : [
              <MenuItem
                key="toggle"
                onClick={() => {
                  close();
                  change(`/items/${itemId}/watch`, watching ? 'DELETE' : 'PUT', watching ? 'You stopped watching this.' : 'You are watching this and will hear about every change.');
                }}
              >
                <EyeGlyph filled={!watching} />
                <span className="ms-2">{watching ? 'Stop watching' : 'Start watching'}</span>
              </MenuItem>,
              <Divider key="toggle-divider" />,
              <ListSubheader className="filter-menu-heading" key="heading">
                Watching this · {watchers.length}
              </ListSubheader>,
              ...(watchers.length > 0
                ? watchers.map((watcher) => (
                    <li className="watch-menu-person" key={watcher.id}>
                      <Avatar name={watcher.displayName} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{watcher.id === auth.user?.id ? `${watcher.displayName} (you)` : watcher.displayName}</span>
                      {manage && watcher.id !== auth.user?.id && (
                        <button
                          aria-label={`Stop ${watcher.displayName} watching`}
                          className="toolbar-button"
                          onClick={() => change(`/items/${itemId}/watchers/${watcher.id}`, 'DELETE', `${watcher.displayName} stopped watching this.`)}
                          type="button"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      )}
                    </li>
                  ))
                : [<li className="watch-menu-person text-muted" key="nobody">Nobody yet</li>]),
              ...(manage
                ? [
                    <Divider key="add-divider" />,
                    <MenuItem key="add" onClick={() => setAdding(true)}>
                      <Icon name="plus" size={16} />
                      <span className="ms-2">Add a watcher</span>
                    </MenuItem>,
                  ]
                : []),
            ]}
      </MuiMenu>
    </>
  );
}
