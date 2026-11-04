import { useState } from 'react';
import { ConfirmDialog, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { homePath } from '../spaces';
import type { TaskColumn } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { FormDialog } from './FormDialog';
import type { NestedMenuItem } from './NestedMenu';

export function useTaskColumns(home: string | null, listId: string | null | undefined, editable: boolean) {
  const auth = useAuth();
  const columns = useResource<TaskColumn[]>(`/me/task-columns?${home ? `spaceId=${home}` : 'home=account'}&listId=${listId ?? 'none'}`, true, { live: ['tasks'] });
  const action = useAction();
  const form = useFormErrors();
  const [editing, setEditing] = useState<{ column?: TaskColumn }>();
  const [removing, setRemoving] = useState<TaskColumn>();

  const dialogs = (
    <>
      {editing && (
        <FormDialog
          busy={action.busy}
          busyLabel={editing.column ? 'Saving…' : 'Adding…'}
          onClose={() => setEditing(undefined)}
          onSubmit={(target) => {
            if (!form.check(target, { name: [required('Name the column.'), atMost(30, 'Use at most 30 characters.')] })) return;
            const name = String(new FormData(target).get('name')).trim();
            const { column } = editing;
            void action
              .run(
                async () => {
                  const saved = await auth.request<TaskColumn>(column ? `/task-columns/${column.id}` : homePath(home, 'task-columns'), {
                    method: column ? 'PATCH' : 'POST',
                    body: JSON.stringify(column ? { name } : { name, listId: listId ?? null }),
                  });
                  columns.mutate((current) => (column ? current.map((shown) => (shown.id === saved.id ? saved : shown)) : [...current, saved]));
                  return column ? `Renamed the column to ${saved.name}.` : `Added the ${saved.name} column.`;
                },
                column ? 'Could not rename the column' : 'Could not add the column',
              )
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel={editing.column ? 'Save changes' : 'Add column'}
          title={editing.column ? 'Rename column' : 'New column'}
        >
          <TextField autoFocus defaultValue={editing.column?.name ?? ''} hint="Columns sit between In progress and Done, like QA or Review. Each epic has its own." label="Name" maxLength={30} {...form.field('name')} />
        </FormDialog>
      )}
      {removing && (
        <ConfirmDialog
          busyLabel="Removing…"
          confirmLabel="Remove column"
          errorFallback="Could not remove the column"
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await auth.request(`/task-columns/${removing.id}`, { method: 'DELETE' });
            columns.mutate((current) => current.filter((shown) => shown.id !== removing.id));
            action.report(`Removed the ${removing.name} column.`);
          }}
          title={`Remove the ${removing.name} column?`}
          tone="danger"
        >
          Its tasks move back to In progress.
        </ConfirmDialog>
      )}
    </>
  );

  return {
    columns: columns.data ?? [],
    add: editable ? () => setEditing({}) : undefined,
    actions: editable
      ? (column: TaskColumn): NestedMenuItem[] => [
          { label: 'Rename column', onSelect: () => setEditing({ column }) },
          { label: 'Remove column', separated: true, onSelect: () => setRemoving(column) },
        ]
      : undefined,
    dialogs,
  };
}
