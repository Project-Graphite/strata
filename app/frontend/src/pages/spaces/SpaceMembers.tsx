import { useState } from 'react';
import { Avatar, ConfirmDialog, ListRow, Placeholder, Select, Skeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { roleOptions, useAllSpaces, type SpaceRole } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SpaceInvitations } from './SpaceInvitations';
import { useSpace, useSpaceInvites } from './SpaceLayout';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { LoadError } from '../../components/LoadError';
import { Toolbar } from '../../components/Page';
import { AvatarSkeleton, RowsSkeleton, useRememberedShape } from '../../components/Skeletons';

interface Member {
  userId: string;
  handle: string;
  displayName: string;
  role: SpaceRole;
  joinedAt: string;
}

const roleLabel = (role: SpaceRole) => roleOptions.find((option) => option.value === role)?.label;

export function SpaceMembers() {
  const auth = useAuth();
  const space = useSpace();
  const { invite, invited } = useSpaceInvites();
  const spaces = useAllSpaces();
  const members = useResource<Member[]>(`/spaces/${space.id}/members`, true);
  const action = useAction();
  const [removing, setRemoving] = useState<Member>();
  const manages = space.role === 'owner' && space.kind === 'shared';
  const self = auth.user?.id;
  const [rows] = useRememberedShape(`space-members-${space.id}`, members.data && [members.data.length], [space.kind === 'shared' ? 2 : 1]);

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
    <>
      {manages && <Toolbar actions={<Button icon="plus" label="Invite people" onClick={invite} />} />}
      {members.error ? (
        <LoadError error={members.error} onRetry={members.reload} />
      ) : !members.data ? (
        <Placeholder label="Loading the members of this space">
          <RowsSkeleton lead={<AvatarSkeleton />} rows={rows} trail={manages && <Skeleton className="h-10 w-32 shrink-0 rounded-field" />} />
        </Placeholder>
      ) : (
        <ul className="panel-rows">
          {members.data.map((member) => (
            <ListRow
              key={member.userId}
              lead={<Avatar name={member.displayName} />}
              meta={[`@${member.handle}`, !manages && roleLabel(member.role), `joined ${timeAgo(member.joinedAt)}`].filter(Boolean).join(' · ')}
              title={member.userId === self ? `${member.displayName} · you` : member.displayName}
              trail={
                manages && (
                  <>
                    <Select
                      aria-label={`Role of ${member.displayName}`}
                      className="w-32"
                      disabled={action.busy}
                      onChange={(role) => changeRole(member, role)}
                      options={roleOptions}
                      size="small"
                      value={member.role}
                    />
                    {member.userId !== self && <ActionsMenu items={[{ label: 'Remove', onSelect: () => setRemoving(member) }]} name={member.displayName} />}
                  </>
                )
              }
            />
          ))}
        </ul>
      )}
      {manages && <SpaceInvitations key={invited} space={space} />}

      {removing && (
        <ConfirmDialog
          busyLabel="Removing…"
          confirmLabel="Remove member"
          errorFallback={`Could not remove ${removing.displayName}`}
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${space.id}/members/${removing.userId}`, { method: 'DELETE' });
            members.mutate((current) => current.filter((shown) => shown.userId !== removing.userId));
            action.report(`Removed ${removing.displayName}.`);
          }}
          title={`Remove ${removing.displayName}?`}
          tone="danger"
        >
          {removing.displayName} loses access to everything in {space.name} until someone invites them back.
        </ConfirmDialog>
      )}
    </>
  );
}
