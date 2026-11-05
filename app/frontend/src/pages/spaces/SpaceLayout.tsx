import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { ConfirmDialog, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { findSpace, roleOptions, SpaceMark, spaceHref, useAllSpaces, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { ActionsMenu } from '../../components/ActionsMenu';
import { CrashBoundary } from '../../components/CrashBoundary';
import type { NestedMenuItem } from '../../components/NestedMenu';
import { Hint } from '../../components/Hint';
import { NotFoundPage } from '../NotFoundPage';
import { DetailState, Page } from '../../components/Page';
import { IconButtonSkeleton, RowsSkeleton, SkeletonLine, SpaceMarkSkeleton } from '../../components/Skeletons';
import { InviteToSpaceDialog } from './SpaceInvitations';

interface SpaceOutlet {
  space: Space;
  invite: () => void;
  invited: number;
  setMenu: (items: NestedMenuItem[]) => void;
}

export function useSpace() {
  return useOutletContext<SpaceOutlet>().space;
}

export function useSpaceMenu() {
  return useOutletContext<SpaceOutlet>().setMenu;
}

export function useSpaceInvites() {
  const { invite, invited } = useOutletContext<SpaceOutlet>();
  return { invite, invited };
}

export const spaceDescription = (space: Space) =>
  space.description || `Shared · you’re ${space.role === 'viewer' ? 'a' : 'an'} ${roleOptions.find((option) => option.value === space.role)?.label.toLowerCase()}`;

type SpaceAction = 'invite' | 'leave' | 'delete';

export function useSpaceActions(onInvited?: () => void) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useAllSpaces();
  const { report } = useAction();
  const [opened, setOpened] = useState<{ action: SpaceAction; space: Space }>();
  const close = () => setOpened(undefined);

  function items(space: Space): NestedMenuItem[] {
    const open = (action: SpaceAction) => () => setOpened({ action, space });
    if (space.role !== 'owner') return [{ label: 'Leave', onSelect: open('leave') }];
    return [
      { label: 'Settings', onSelect: () => navigate(spaceHref(space, 'settings')) },
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

  return { items, dialog, open: (action: SpaceAction, space: Space) => setOpened({ action, space }), invite: (space: Space) => setOpened({ action: 'invite', space }) };
}

export function SpaceLayout() {
  const { id } = useParams();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const spaces = useAllSpaces();
  const [invited, setInvited] = useState(0);
  const [menu, setMenu] = useState<NestedMenuItem[]>([]);
  const actions = useSpaceActions(() => setInvited((current) => current + 1));
  const base = `/spaces/${id}`;
  const sections = [
    [`${base}/members`, 'Members'],
    [`${base}/tags`, 'Tags'],
    [`${base}/activity`, 'Activity'],
  ] as const;
  const tabs = (
    [
      [base, 'Pages'],
      [`${base}/boards`, 'Boards'],
      [`${base}/tasks`, 'Tasks'],
    ] as const
  ).map(([href, label]) => ({ active: pathname === href, href, label }));

  if (spaces.error) return <DetailState resource={spaces} thing="Space" />;
  if (!spaces.data) {
    return (
      <Page
        actions={<IconButtonSkeleton />}
        documentTitle="Space"
        tabs={tabs}
        title={
          <span className="inline-flex items-center gap-3">
            <SpaceMarkSkeleton large />
            <SkeletonLine width="w-56" />
          </span>
        }
      >
        <Placeholder label="Loading this space">
          <RowsSkeleton rows={3} />
        </Placeholder>
      </Page>
    );
  }
  const space = findSpace(spaces.data, id);
  if (!space) {
    return (
      <Page title="Space not found">
        <Hint>It may have been deleted, or you’re no longer a member.</Hint>
      </Page>
    );
  }
  if (id !== space.slug) return <Navigate replace to={`${spaceHref(space)}${pathname.slice(base.length)}${search}${hash}`} />;
  if (pathname === `${base}/settings` && space.role !== 'owner') return <NotFoundPage />;

  return (
    <Page
      actions={
        <ActionsMenu
          items={[
            ...sections.map(([href, label]) => ({ label, onSelect: () => navigate(href) })),
            ...[menu, actions.items(space)].flatMap((group) => group.map((item, index) => (index === 0 ? { ...item, separated: true } : item))),
          ]}
          name={space.name}
        />
      }
      documentTitle={sections.find(([href]) => pathname === href)?.[1] ?? (pathname === `${base}/settings` ? 'Settings' : space.name)}
      tabs={tabs}
      title={
        <span className="inline-flex items-center gap-3">
          <SpaceMark large space={space} />
          {space.name}
        </span>
      }
    >
      <CrashBoundary resetKey={pathname}>
        <Outlet context={{ space, invite: () => actions.invite(space), invited, setMenu } satisfies SpaceOutlet} />
      </CrashBoundary>
      {actions.dialog}
    </Page>
  );
}
