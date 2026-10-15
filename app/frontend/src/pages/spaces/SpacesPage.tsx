import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog, ListSkeleton, type MenuItem } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { HeaderButton, Page } from '../../components/Page';
import { NameAndColorFields, nameAndColorFrom, SpaceMark, spaceNameChecks, useSpaces, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useFormErrors } from '../../validation';

export function SpacesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const creating = useAction();
  const renaming = useAction();
  const createForm = useFormErrors();
  const renameForm = useFormErrors();
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [editing, setEditing] = useState<Space>();
  const [deleting, setDeleting] = useState<Space>();
  const [leaving, setLeaving] = useState<Space>();

  function actionsFor(space: Space): MenuItem[] {
    if (space.role !== 'owner') return [{ label: 'Leave', onSelect: () => setLeaving(space) }];
    return [
      { label: 'Rename', onSelect: () => setEditing(space) },
      ...(space.kind === 'shared'
        ? [
            { label: 'Leave', onSelect: () => setLeaving(space) },
            { label: 'Delete', onSelect: () => setDeleting(space), separated: true },
          ]
        : []),
    ];
  }

  return (
    <Page actions={<HeaderButton icon="plus" label="New space" onClick={() => setCreatingSpace(true)} primary />} title="Spaces">
      {spaces.error ? (
        <LoadError error={spaces.error} onRetry={spaces.reload} />
      ) : !spaces.data ? (
        <ListSkeleton label="Loading your spaces" rows={3} />
      ) : (
        <ul className="panel-rows">
          {spaces.data.map((space) => (
            <li className="flex items-center gap-3 panel-row" key={space.id}>
              <SpaceMark space={space} />
              <Link className="min-w-0 flex-1 truncate text-ink no-underline hover:underline" to={`/spaces/${space.id}`}>
                {space.name}
              </Link>
              <span className="mono-sm shrink-0 text-faint">{space.kind === 'personal' ? 'Only you' : `Shared · ${space.role}`}</span>
              <ActionsMenu items={actionsFor(space)} name={space.name} />
            </li>
          ))}
        </ul>
      )}

      {creatingSpace && (
        <FormDialog
          busy={creating.busy}
          busyLabel="Creating…"
          onClose={() => setCreatingSpace(false)}
          onSubmit={(target) => {
            if (!createForm.check(target, { name: spaceNameChecks })) return;
            void creating.run(async () => {
              const created = await auth.request<Space>('/spaces', { method: 'POST', body: JSON.stringify(nameAndColorFrom(target)) });
              spaces.mutate((current) => [...current, created]);
              navigate(`/spaces/${created.id}`);
              return '';
            }, 'Could not create the space');
          }}
          submitLabel="Create space"
          title="New shared space"
        >
          <NameAndColorFields field={createForm.field('name')} maxLength={60} />
        </FormDialog>
      )}

      {editing && (
        <FormDialog
          busy={renaming.busy}
          busyLabel="Saving…"
          onClose={() => setEditing(undefined)}
          onSubmit={(target) => {
            if (!renameForm.check(target, { name: spaceNameChecks })) return;
            void renaming
              .run(async () => {
                const updated = await auth.request<Space>(`/spaces/${editing.id}`, { method: 'PATCH', body: JSON.stringify(nameAndColorFrom(target)) });
                spaces.mutate((current) => current.map((space) => (space.id === updated.id ? updated : space)));
                return '';
              }, 'Could not rename the space')
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel="Save"
          title={`Rename ${editing.name}`}
        >
          <NameAndColorFields color={editing.color} field={renameForm.field('name')} maxLength={60} name={editing.name} />
        </FormDialog>
      )}

      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete space"
          errorFallback="Could not delete the space"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${deleting.id}`, { method: 'DELETE' });
            spaces.mutate((current) => current.filter((space) => space.id !== deleting.id));
          }}
          title={`Delete ${deleting.name}?`}
        >
          Everything in this space is deleted for every member, straight away. This cannot be undone.
        </ConfirmDialog>
      )}

      {leaving && (
        <ConfirmDialog
          busyLabel="Leaving…"
          confirmLabel="Leave space"
          errorFallback="Could not leave the space"
          onClose={() => setLeaving(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${leaving.id}/members/${auth.user!.id}`, { method: 'DELETE' });
            spaces.mutate((current) => current.filter((space) => space.id !== leaving.id));
          }}
          title={`Leave ${leaving.name}?`}
        >
          You lose access to everything in it until someone invites you back.
        </ConfirmDialog>
      )}
    </Page>
  );
}
