import { useState } from 'react';
import { ConfirmDialog, ListRow, Placeholder, TagChip } from '@project-graphite/ui';
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
import { usePagePrimary } from '../../components/Page';
import { IconButtonSkeleton, RowsSkeleton, useRememberedShape } from '../../components/Skeletons';

const tagNameChecks = [required('Enter a tag name.'), atMost(40, 'Use at most 40 characters.')];
const empty = { title: 'No tags yet', hint: 'Tags you make here can be added to anything in this space.' };

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name);

export function SpaceTags() {
  const auth = useAuth();
  const space = useSpace();
  const tags = useResource<Tag[]>(`/spaces/${space.id}/tags`, true);
  const saving = useAction();
  const { report } = saving;
  const form = useFormErrors();
  const [editing, setEditing] = useState<Tag | 'new'>();
  const [deleting, setDeleting] = useState<Tag>();
  const editable = space.role !== 'viewer';
  const [rows] = useRememberedShape(`space-tags-${space.id}`, tags.data && [tags.data.length], [3]);
  usePagePrimary(editable && <Button icon="plus" label="New tag" large onClick={() => setEditing('new')} primary />);

  return (
    <>
      {tags.error ? (
        <LoadError error={tags.error} onRetry={tags.reload} />
      ) : !tags.data ? (
        <Placeholder label="Loading the tags in this space">
          {rows ? (
            <RowsSkeleton detail={false} rows={rows} trail={editable && <IconButtonSkeleton />} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : tags.data.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {tags.data.map((tag) => (
            <ListRow
              href={`/spaces/${space.id}/items?tag=${tag.id}`}
              key={tag.id}
              label={`Items tagged ${tag.name}`}
              title={<TagChip color={tag.color} label={tag.name} />}
              trail={
                editable && (
                  <ActionsMenu
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(tag) },
                      { label: 'Delete', onSelect: () => setDeleting(tag), separated: true },
                    ]}
                    name={tag.name}
                  />
                )
              }
            />
          ))}
        </ul>
      )}

      {!tags.error && auth.user?.features.includes('tidy') && <TidyRules tags={tags.data} />}

      {editing && (
        <FormDialog
          busy={saving.busy}
          busyLabel={editing === 'new' ? 'Adding…' : 'Saving…'}
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
                return `Saved ${updated.name}.`;
              }, editing === 'new' ? 'Could not add the tag' : 'Could not save the tag')
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel={editing === 'new' ? 'Add tag' : 'Save changes'}
          title={editing === 'new' ? 'New tag' : 'Edit tag'}
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
            report(`Deleted ${deleting.name}.`);
          }}
          title={`Delete ${deleting.name}?`}
          tone="danger"
        >
          It comes off every item in this space, and the items themselves stay.
        </ConfirmDialog>
      )}
    </>
  );
}
