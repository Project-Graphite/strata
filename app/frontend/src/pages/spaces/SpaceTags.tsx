import { useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog, Placeholder, Skeleton, TagChip } from '@project-graphite/ui';
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
import { rowsOf, useRememberedShape } from '../../components/Skeletons';

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

  return (
    <>
      {editable && <Toolbar actions={<Button icon="plus" label="New tag" onClick={() => setEditing('new')} />} />}
      {tags.error ? (
        <LoadError error={tags.error} onRetry={tags.reload} />
      ) : !tags.data ? (
        <Placeholder label="Loading the tags in this space">
          {rows ? (
            <ul aria-hidden="true" className="panel-rows">
              {rowsOf(rows).map((row) => (
                <li className="flex items-center pe-2" key={row}>
                  <span className="flex min-w-0 flex-1 items-center panel-row">
                    <Skeleton className={`h-6 rounded-full ${row % 2 ? 'w-16' : 'w-24'}`} />
                  </span>
                </li>
              ))}
            </ul>
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
            <li className="flex items-center pe-2 hover:bg-line-soft" key={tag.id}>
              <Link aria-label={`Items tagged ${tag.name}`} className="flex min-w-0 flex-1 items-center panel-row no-underline" to={`/spaces/${space.id}/items?tag=${tag.id}`}>
                <TagChip color={tag.color} label={tag.name} />
              </Link>
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
          submitLabel={editing === 'new' ? 'Add tag' : 'Save'}
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
