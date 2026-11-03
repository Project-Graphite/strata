import { useState } from 'react';
import { ConfirmDialog, ListRow, Placeholder, TagChip } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { NameAndColorFields, nameAndColorFrom, type Tag } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { ActionsMenu } from '../../components/ActionsMenu';
import { AddButton } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { IconButtonSkeleton, RowsSkeleton, useRememberedShape } from '../../components/Skeletons';

const tagNameChecks = [required('Enter a tag name.'), atMost(40, 'Use at most 40 characters.')];
const empty = { title: 'No tags yet', hint: 'Tags you make here go on your own items, such as bookmarks, recipes and files.' };

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name);

export function TagsSettings() {
  const auth = useAuth();
  const tags = useResource<Tag[]>('/me/tags', true);
  const saving = useAction();
  const { report } = saving;
  const form = useFormErrors();
  const [editing, setEditing] = useState<Tag | 'new'>();
  const [deleting, setDeleting] = useState<Tag>();
  const [rows] = useRememberedShape('settings-tags', tags.data && [tags.data.length], [3]);

  return (
    <Section action={<AddButton label="New tag" onClick={() => setEditing('new')} />} description="Labels you put on your own bookmarks, events, goals, people, recipes and files, so you can filter and find them later. Each space keeps its own tags for its pages, tasks and boards." title="Your tags">
      {tags.error ? (
        <LoadError error={tags.error} onRetry={tags.reload} />
      ) : !tags.data ? (
        <Placeholder label="Loading your tags">
          {rows ? (
            <RowsSkeleton detail={false} rows={rows} trail={<IconButtonSkeleton />} />
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
              key={tag.id}
              title={<TagChip color={tag.color} label={tag.name} />}
              trail={
                <ActionsMenu
                  items={[
                    { label: 'Edit', onSelect: () => setEditing(tag) },
                    { label: 'Delete', onSelect: () => setDeleting(tag), separated: true },
                  ]}
                  name={tag.name}
                />
              }
            />
          ))}
        </ul>
      )}

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
                  const created = await auth.request<Tag>('/me/tags', { method: 'POST', body: JSON.stringify(nameAndColorFrom(target)) });
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
          It comes off every item it was on, and the items themselves stay.
        </ConfirmDialog>
      )}
    </Section>
  );
}
