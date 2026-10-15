import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, ConfirmDialog, ListSkeleton, Select, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { roleOptions, useSpaces, type SpaceRole } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SpaceInvitations } from './SpaceInvitations';
import { useSpace } from './SpaceLayout';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { HeaderButton, Toolbar } from '../../components/Page';

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
  const [inviting, setInviting] = useState(false);
  const manages = space.role === 'owner';
  const invites = manages && space.kind === 'shared';
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
    <div className="fade-in grid gap-6">
      <Toolbar actions={invites && <HeaderButton icon="plus" label="Invite people" onClick={() => setInviting(true)} primary />}>
        <Hint>{members.data.length === 1 ? '1 member' : `${members.data.length} members`}</Hint>
      </Toolbar>
      <ul className="panel-rows">
        {members.data.map((member) => (
          <li className="panel-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3" key={member.userId}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={member.displayName} />
              <div className="min-w-0">
                <p className="m-0 truncate text-ink">
                  {member.displayName}
                  {member.userId === self && <span className="text-muted"> · you</span>}
                </p>
                <p className="m-0 mt-0.5 truncate text-sm text-muted">
                  @{member.handle} · joined {timeAgo(member.joinedAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {invites ? (
                <Select
                  aria-label={`Role of ${member.displayName}`}
                  className="w-32"
                  disabled={action.busy}
                  onChange={(role) => changeRole(member, role)}
                  options={roleOptions}
                  size="small"
                  value={member.role}
                />
              ) : (
                <span className="text-sm text-muted">{roleOptions.find((option) => option.value === member.role)?.label}</span>
              )}
              {space.kind === 'shared' && (manages || member.userId === self) && (
                <button
                  className="secondary-button min-w-20 justify-center px-3 py-2 text-sm"
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
      {invites && <SpaceInvitations inviting={inviting} onClose={() => setInviting(false)} space={space} />}

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
