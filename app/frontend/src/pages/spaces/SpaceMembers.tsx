import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, ConfirmDialog, ListSkeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { useSpaces, type SpaceRole } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SpaceInvitations } from './SpaceInvitations';
import { useSpace } from './SpaceLayout';
import { LoadError } from '../../components/LoadError';

interface Member {
  userId: string;
  handle: string;
  displayName: string;
  role: SpaceRole;
  joinedAt: string;
}

export function SpaceMembers() {
  const auth = useAuth();
  const navigate = useNavigate();
  const space = useSpace();
  const spaces = useSpaces();
  const members = useResource<Member[]>(`/spaces/${space.id}/members`, true);
  const action = useAction();
  const [removing, setRemoving] = useState<Member>();
  const manages = space.role === 'owner';
  const self = auth.user?.id;

  if (members.error) return <LoadError error={members.error} onRetry={members.reload} />;
  if (!members.data) return <ListSkeleton label="Loading the members of this space" rows={3} />;

  function changeRole(member: Member, role: SpaceRole) {
    void action.run(async () => {
      const updated = await auth.request<Member>(`/spaces/${space.id}/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      members.mutate((current) => current.map((shown) => (shown.userId === updated.userId ? updated : shown)));
      if (updated.userId === self) {
        spaces.mutate((current) => current.map((shown) => (shown.id === space.id ? { ...shown, role } : shown)));
      }
      return `${updated.displayName} is now ${role === 'viewer' ? 'a viewer' : `an ${role}`}.`;
    }, 'Could not change that role');
  }

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <ul className="m-0 grid list-none gap-0 p-0">
        {members.data.map((member) => (
          <li className="flex items-center justify-between gap-4 border-b border-line-soft py-4" key={member.userId}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={member.displayName} />
              <div className="min-w-0">
                <p className="m-0 truncate text-ink">
                  {member.displayName}
                  {member.userId === self && <span className="mono-sm text-faint"> · you</span>}
                </p>
                <p className="mono-sm m-0 mt-1 truncate text-faint">
                  @{member.handle} · joined {timeAgo(member.joinedAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {manages && space.kind === 'shared' ? (
                <select
                  aria-label={`Role of ${member.displayName}`}
                  disabled={action.busy}
                  onChange={(event) => changeRole(member, event.currentTarget.value as SpaceRole)}
                  value={member.role}
                >
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              ) : (
                <span className="mono-sm text-faint">{member.role}</span>
              )}
              {space.kind === 'shared' && (manages || member.userId === self) && (
                <button
                  className="secondary-button px-3 py-2 text-sm"
                  onClick={() => setRemoving(member)}
                  type="button"
                >
                  {member.userId === self ? 'Leave' : 'Remove'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {manages && space.kind === 'shared' && <SpaceInvitations space={space} />}

      {removing && (
        <ConfirmDialog
          busyLabel={removing.userId === self ? 'Leaving…' : 'Removing…'}
          confirmLabel={removing.userId === self ? 'Leave space' : 'Remove'}
          errorFallback="Could not finish this"
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${space.id}/members/${removing.userId}`, { method: 'DELETE' });
            if (removing.userId === self) {
              spaces.mutate((current) => current.filter((shown) => shown.id !== space.id));
              navigate('/spaces');
            } else {
              members.mutate((current) => current.filter((shown) => shown.userId !== removing.userId));
            }
          }}
          title={removing.userId === self ? `Leave ${space.name}?` : `Remove ${removing.displayName}?`}
        >
          {removing.userId === self
            ? 'You lose access to everything in it until someone invites you back.'
            : `${removing.displayName} loses access to everything in ${space.name}.`}
        </ConfirmDialog>
      )}
    </div>
  );
}
