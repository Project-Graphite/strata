import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog, Dialog, ListSkeleton, Menu, type MenuItem, PageHeader } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { NameAndColorFields, nameAndColorFrom, SpaceDot, spaceNameChecks, useSpaces, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useFormErrors } from '../../validation';
import { LoadError } from '../../components/LoadError';

export function SpacesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const creating = useAction();
  const renaming = useAction();
  const createForm = useFormErrors();
  const renameForm = useFormErrors();
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
    <section className="page-enter grid max-w-3xl gap-10">
      <PageHeader title="Spaces" />

      {spaces.error ? (
        <LoadError error={spaces.error} onRetry={spaces.reload} />
      ) : !spaces.data ? (
        <ListSkeleton label="Loading your spaces" rows={3} />
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {spaces.data.map((space) => (
            <li className="flex items-center justify-between gap-4 border-b border-line-soft py-4" key={space.id}>
              <div className="min-w-0">
                <Link className="inline-flex items-center gap-2 text-ink no-underline hover:underline" to={`/spaces/${space.id}`}>
                  <SpaceDot color={space.color} />
                  <span className="truncate">{space.name}</span>
                </Link>
                <p className="mono-sm m-0 mt-1 text-faint">
                  {space.kind === 'personal' ? 'Personal' : `Shared · ${space.role}`}
                </p>
              </div>
              <Menu
                items={actionsFor(space)}
                label={`${space.name} actions`}
                trigger="•••"
                triggerClassName="secondary-button px-3 py-2 text-sm"
                triggerLabel={`Actions for ${space.name}`}
              />
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="m-0 text-xl font-medium">New shared space</h2>
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            if (!createForm.check(target, { name: spaceNameChecks })) return;
            void creating.run(async () => {
              const created = await auth.request<Space>('/spaces', {
                method: 'POST',
                body: JSON.stringify(nameAndColorFrom(target)),
              });
              spaces.mutate((current) => [...current, created]);
              navigate(`/spaces/${created.id}`);
              return '';
            }, 'Could not create the space');
          }}
        >
          <NameAndColorFields field={createForm.field('name')} maxLength={60} />
          <button className="primary-button inline-flex w-fit" disabled={creating.busy} type="submit">
            {creating.busy ? 'Creating…' : 'Create space'}
          </button>
        </form>
      </section>

      {editing && (
        <Dialog onClose={() => setEditing(undefined)} title={`Rename ${editing.name}`}>
          <form
            className="mt-5 grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              if (!renameForm.check(target, { name: spaceNameChecks })) return;
              void renaming
                .run(async () => {
                  const updated = await auth.request<Space>(`/spaces/${editing.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(nameAndColorFrom(target)),
                  });
                  spaces.mutate((current) => current.map((space) => (space.id === updated.id ? updated : space)));
                  return '';
                }, 'Could not rename the space')
                .then((saved) => saved && setEditing(undefined));
            }}
          >
            <NameAndColorFields
              color={editing.color}
              field={renameForm.field('name')}
              maxLength={60}
              name={editing.name}
            />
            <div className="flex justify-end gap-3">
              <button className="secondary-button" onClick={() => setEditing(undefined)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={renaming.busy} type="submit">
                {renaming.busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Dialog>
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
    </section>
  );
}
