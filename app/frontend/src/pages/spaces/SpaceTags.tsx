import { useState } from 'react';
import { ConfirmDialog, Dialog, EmptyState, ListSkeleton, TagChip } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { NameAndColorFields, nameAndColorFrom, type Tag } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';
import { TidyRules } from './TidyRules';
import { LoadError } from '../../components/LoadError';

const tagNameChecks = [required('Enter a tag name.'), atMost(40, 'Use at most 40 characters.')];

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name);

export function SpaceTags() {
  const auth = useAuth();
  const space = useSpace();
  const tags = useResource<Tag[]>(`/spaces/${space.id}/tags`, true);
  const creating = useAction();
  const saving = useAction();
  const createForm = useFormErrors();
  const editForm = useFormErrors();
  const [editing, setEditing] = useState<Tag>();
  const [deleting, setDeleting] = useState<Tag>();
  const editable = space.role !== 'viewer';

  if (tags.error) return <LoadError error={tags.error} onRetry={tags.reload} />;
  if (!tags.data) return <ListSkeleton label="Loading the tags in this space" rows={3} />;

  return (
    <div className="fade-in grid max-w-3xl gap-10">
      {tags.data.length === 0 ? (
        <EmptyState title="No tags yet">
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            Tags group items across every area of this space.
          </p>
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {tags.data.map((tag) => (
            <li className="flex items-center justify-between gap-4 border-b border-line-soft py-3" key={tag.id}>
              <TagChip color={tag.color} label={tag.name} />
              {editable && (
                <div className="flex shrink-0 gap-2">
                  <button className="secondary-button px-3 py-2 text-sm" onClick={() => setEditing(tag)} type="button">
                    Edit
                  </button>
                  <button className="secondary-button px-3 py-2 text-sm" onClick={() => setDeleting(tag)} type="button">
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <section>
          <h2 className="m-0 text-xl font-medium">New tag</h2>
          <form
            className="mt-5 grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              if (!createForm.check(target, { name: tagNameChecks })) return;
              void creating
                .run(async () => {
                  const created = await auth.request<Tag>(`/spaces/${space.id}/tags`, {
                    method: 'POST',
                    body: JSON.stringify(nameAndColorFrom(target)),
                  });
                  tags.mutate((current) => [...current, created].sort(byName));
                  return `Added ${created.name}.`;
                }, 'Could not add the tag')
                .then((added) => added && target.reset());
            }}
          >
            <NameAndColorFields field={createForm.field('name')} maxLength={40} />
            <button className="primary-button inline-flex w-fit" disabled={creating.busy} type="submit">
              {creating.busy ? 'Adding…' : 'Add tag'}
            </button>
          </form>
        </section>
      )}

      <TidyRules tags={tags.data} />

      {editing && (
        <Dialog onClose={() => setEditing(undefined)} title={`Edit ${editing.name}`}>
          <form
            className="mt-5 grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              if (!editForm.check(target, { name: tagNameChecks })) return;
              void saving
                .run(async () => {
                  const updated = await auth.request<Tag>(`/tags/${editing.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(nameAndColorFrom(target)),
                  });
                  tags.mutate((current) => current.map((tag) => (tag.id === updated.id ? updated : tag)).sort(byName));
                  return '';
                }, 'Could not save the tag')
                .then((saved) => saved && setEditing(undefined));
            }}
          >
            <NameAndColorFields
              color={editing.color}
              field={editForm.field('name')}
              maxLength={40}
              name={editing.name}
            />
            <div className="flex justify-end gap-3">
              <button className="secondary-button" onClick={() => setEditing(undefined)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={saving.busy} type="submit">
                {saving.busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete tag"
          errorFallback="Could not delete the tag"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/tags/${deleting.id}`, { method: 'DELETE' });
            tags.mutate((current) => current.filter((tag) => tag.id !== deleting.id));
          }}
          title={`Delete ${deleting.name}?`}
        >
          The tag is removed from every item in this space. The items themselves stay.
        </ConfirmDialog>
      )}
    </div>
  );
}
