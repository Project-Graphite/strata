import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, TagChip } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { NameAndColorFields, nameAndColorFrom, type Tag } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';
import { TidyRules } from './TidyRules';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Toolbar } from '../../components/Page';

const tagNameChecks = [required('Enter a tag name.'), atMost(40, 'Use at most 40 characters.')];

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name);

export function SpaceTags() {
  const auth = useAuth();
  const space = useSpace();
  const tags = useResource<Tag[]>(`/spaces/${space.id}/tags`, true);
  const saving = useAction();
  const form = useFormErrors();
  const [editing, setEditing] = useState<Tag | 'new'>();
  const [deleting, setDeleting] = useState<Tag>();
  const editable = space.role !== 'viewer';

  if (tags.error) return <LoadError error={tags.error} onRetry={tags.reload} />;
  if (!tags.data) return <ListSkeleton label="Loading the tags in this space" rows={3} />;

  return (
    <>
      <div className="grid gap-4">
        <Toolbar actions={editable && <Button icon="plus" label="New tag" onClick={() => setEditing('new')} primary />} />
        {tags.data.length === 0 ? (
          <Empty title="No tags yet" />
        ) : (
          <ul className="panel-rows">
            {tags.data.map((tag) => (
              <li className="panel-row flex items-center justify-between gap-4" key={tag.id}>
                <TagChip color={tag.color} label={tag.name} />
                {editable && (
                  <ActionsMenu
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(tag) },
                      { label: 'Delete', onSelect: () => setDeleting(tag), separated: true },
                    ]}
                    name={tag.name}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {auth.user?.features.includes('tidy') && <TidyRules tags={tags.data} />}

      {editing && (
        <FormDialog
          busy={saving.busy}
          busyLabel="Saving…"
          onClose={() => setEditing(undefined)}
          onSubmit={(target) => {
            if (!form.check(target, { name: tagNameChecks })) return;
            void saving
              .run(async () => {
                if (editing === 'new') {
                  const created = await auth.request<Tag>(`/spaces/${space.id}/tags`, { method: 'POST', body: JSON.stringify(nameAndColorFrom(target)) });
                  tags.mutate((current) => [...current, created].sort(byName));
                  return `Added ${created.name}.`;
                }
                const updated = await auth.request<Tag>(`/tags/${editing.id}`, { method: 'PATCH', body: JSON.stringify(nameAndColorFrom(target)) });
                tags.mutate((current) => current.map((tag) => (tag.id === updated.id ? updated : tag)).sort(byName));
                return '';
              }, editing === 'new' ? 'Could not add the tag' : 'Could not save the tag')
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel={editing === 'new' ? 'Add tag' : 'Save'}
          title={editing === 'new' ? 'New tag' : `Edit ${editing.name}`}
        >
          <NameAndColorFields
            color={editing === 'new' ? undefined : editing.color}
            field={form.field('name')}
            maxLength={40}
            name={editing === 'new' ? undefined : editing.name}
          />
        </FormDialog>
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
    </>
  );
}
