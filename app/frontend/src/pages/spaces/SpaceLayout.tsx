import { useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { ConfirmDialog, Placeholder, type MenuItem } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { NameAndColorFields, nameAndColorFrom, roleOptions, SpaceMark, spaceNameChecks, useAllSpaces, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useFormErrors } from '../../validation';
import { ActionsMenu } from '../../components/ActionsMenu';
import { FormDialog } from '../../components/FormDialog';
import { Hint } from '../../components/Hint';
import { DetailState, Page } from '../../components/Page';
import { IconButtonSkeleton, SkeletonLine, SpaceMarkSkeleton } from '../../components/Skeletons';
import { InviteToSpaceDialog } from './SpaceInvitations';

interface SpaceOutlet {
  space: Space;
  invite: () => void;
  invited: number;
}

export function useSpace() {
  return useOutletContext<SpaceOutlet>().space;
}

export function useSpaceInvites() {
  const { invite, invited } = useOutletContext<SpaceOutlet>();
  return { invite, invited };
}

export const spaceDescription = (space: Space) =>
  space.kind === 'personal' ? 'Only you' : `Shared · you’re ${space.role === 'viewer' ? 'a' : 'an'} ${roleOptions.find((option) => option.value === space.role)?.label.toLowerCase()}`;

type SpaceAction = 'rename' | 'invite' | 'leave' | 'delete';

export function useSpaceActions(onInvited?: () => void) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useAllSpaces();
  const renaming = useAction();
  const renameForm = useFormErrors();
  const { report } = renaming;
  const [opened, setOpened] = useState<{ action: SpaceAction; space: Space }>();
  const close = () => setOpened(undefined);

  function items(space: Space): MenuItem[] {
    const open = (action: SpaceAction) => () => setOpened({ action, space });
    if (space.role !== 'owner') return [{ label: 'Leave', onSelect: open('leave') }];
    if (space.kind === 'personal') return [{ label: 'Rename', onSelect: open('rename') }];
    return [
      { label: 'Rename', onSelect: open('rename') },
      { label: 'Invite people', onSelect: open('invite') },
      { label: 'Leave', onSelect: open('leave') },
      { label: 'Delete', onSelect: open('delete'), separated: true },
    ];
  }

  function removed(space: Space, message: string) {
    navigate('/spaces');
    spaces.mutate((current) => current.filter((shown) => shown.id !== space.id));
    report(message);
  }

  const dialog = opened && (
    <>
      {opened.action === 'rename' && (
        <FormDialog
          busy={renaming.busy}
          busyLabel="Saving…"
          onClose={close}
          onSubmit={(target) => {
            if (!renameForm.check(target, { name: spaceNameChecks })) return;
            void renaming
              .run(async () => {
                const updated = await auth.request<Space>(`/spaces/${opened.space.id}`, { method: 'PATCH', body: JSON.stringify(nameAndColorFrom(target)) });
                spaces.mutate((current) => current.map((space) => (space.id === updated.id ? updated : space)));
                return `Saved ${updated.name}.`;
              }, 'Could not rename the space')
              .then((saved) => saved && close());
          }}
          submitLabel="Save"
          title="Rename space"
        >
          <NameAndColorFields color={opened.space.color} field={renameForm.field('name')} maxLength={60} name={opened.space.name} />
        </FormDialog>
      )}

      {opened.action === 'invite' && (
        <InviteToSpaceDialog
          onClose={close}
          onInvited={() => {
            onInvited?.();
            close();
          }}
          space={opened.space}
        />
      )}

      {opened.action === 'leave' && (
        <ConfirmDialog
          busyLabel="Leaving…"
          confirmLabel="Leave space"
          errorFallback="Could not leave the space"
          onClose={close}
          onConfirm={async () => {
            await auth.request(`/spaces/${opened.space.id}/members/${auth.user!.id}`, { method: 'DELETE' });
            removed(opened.space, `Left ${opened.space.name}.`);
          }}
          title={`Leave ${opened.space.name}?`}
          tone="danger"
        >
          You lose access to everything in it until someone invites you back.
        </ConfirmDialog>
      )}

      {opened.action === 'delete' && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete space"
          errorFallback="Could not delete the space"
          onClose={close}
          onConfirm={async () => {
            await auth.request(`/spaces/${opened.space.id}`, { method: 'DELETE' });
            removed(opened.space, `Deleted ${opened.space.name}.`);
          }}
          title={`Delete ${opened.space.name}?`}
          tone="danger"
        >
          Everything in it is deleted for every member straight away, and this can’t be undone.
        </ConfirmDialog>
      )}
    </>
  );

  return { items, dialog, invite: (space: Space) => setOpened({ action: 'invite', space }) };
}

export function SpaceLayout() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const spaces = useAllSpaces();
  const [invited, setInvited] = useState(0);
  const actions = useSpaceActions(() => setInvited((current) => current + 1));
  const base = `/spaces/${id}`;
  const tabs = (
    [
      [base, 'Items'],
      [`${base}/pages`, 'Pages'],
      [`${base}/tasks`, 'Tasks'],
      [`${base}/recurring`, 'Recurring'],
      [`${base}/habits`, 'Habits'],
      [`${base}/tags`, 'Tags'],
      [`${base}/members`, 'Members'],
      [`${base}/activity`, 'Activity'],
    ] as const
  ).map(([href, label]) => ({ active: pathname === href, href, label }));

  if (spaces.error) return <DetailState resource={spaces} thing="Space" />;
  if (!spaces.data) {
    return (
      <Page
        actions={<IconButtonSkeleton />}
        description={<SkeletonLine width="w-48" />}
        documentTitle="Space"
        tabs={tabs}
        title={
          <span className="inline-flex items-center gap-3">
            <SpaceMarkSkeleton large />
            <SkeletonLine width="w-56" />
          </span>
        }
      >
        <Placeholder label="Loading this space">{null}</Placeholder>
      </Page>
    );
  }
  const space = spaces.data.find((candidate) => candidate.id === id);
  if (!space) {
    return (
      <Page title="Space not found">
        <Hint>It may have been deleted, or you’re no longer a member.</Hint>
      </Page>
    );
  }

  return (
    <Page
      actions={<ActionsMenu items={actions.items(space)} name={space.name} />}
      description={spaceDescription(space)}
      documentTitle={space.name}
      tabs={tabs}
      title={
        <span className="inline-flex items-center gap-3">
          <SpaceMark large space={space} />
          {space.name}
        </span>
      }
    >
      <Outlet context={{ space, invite: () => actions.invite(space), invited } satisfies SpaceOutlet} />
      {actions.dialog}
    </Page>
  );
}
