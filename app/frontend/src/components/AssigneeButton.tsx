import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { Avatar, Icon } from '@project-graphite/ui';
import type { Member } from '../spaces';
import type { Task } from '../tasks';
import { useResource } from '../useResource';

export function AssigneeButton({ onAssign, task }: { onAssign?: (assignee: Task['assignee']) => void; task: Task }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const members = useResource<Member[]>(anchor ? `/spaces/${task.spaceId}/members` : null, true);
  const label = task.assignee ? `Assignee: ${task.assignee.displayName}` : 'Unassigned';
  const mark = task.assignee ? (
    <Avatar name={task.assignee.displayName} size="sm" />
  ) : (
    <span className="assignee-empty">
      <Icon name="user" size={14} />
    </span>
  );
  if (!onAssign) return task.assignee && <span title={label}>{mark}</span>;
  const choose = (assignee: Task['assignee']) => {
    setAnchor(null);
    if (assignee?.id !== task.assignee?.id) onAssign(assignee);
  };
  return (
    <>
      <button aria-haspopup="menu" aria-label={`${label}. Change the assignee of ${task.title}`} className="assignee-button" onClick={(event) => setAnchor(event.currentTarget)} title={label} type="button">
        {mark}
      </button>
      <MuiMenu anchorEl={anchor} onClose={() => setAnchor(null)} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': 'Assignee' }, paper: { className: 'nested-menu min-w-56' } }}>
        <MenuItem onClick={() => choose(null)} selected={!task.assignee}>
          <span className="assignee-empty">
            <Icon name="user" size={14} />
          </span>
          <span className="ms-2">Unassigned</span>
        </MenuItem>
        {members.data ? (
          members.data.map((member) => (
            <MenuItem key={member.userId} onClick={() => choose({ id: member.userId, handle: '', displayName: member.displayName })} selected={task.assignee?.id === member.userId}>
              <Avatar name={member.displayName} size="sm" />
              <span className="ms-2 min-w-0 truncate">{member.displayName}</span>
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>{members.error ? 'Could not load the people in this space' : 'Loading people…'}</MenuItem>
        )}
      </MuiMenu>
    </>
  );
}
