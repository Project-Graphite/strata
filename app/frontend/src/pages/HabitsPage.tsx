import { useState } from 'react';
import { ConfirmDialog, Placeholder, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { AddButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { Page } from '../components/Page';
import { LoadError } from '../components/LoadError';
import { HabitRowSkeleton, rowsOf, useRememberedShape } from '../components/Skeletons';
import { goalText, HabitRow, type Habit } from '../habits';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';

function GoalSelect({ defaultValue = 7 }: { defaultValue?: number }) {
  return (
    <Select
      defaultValue={String(defaultValue)}
      label="Goal"
      name="perWeek"
      options={[7, 6, 5, 4, 3, 2, 1].map((days) => ({ value: String(days), label: goalText(days).replace(/^./, (first) => first.toUpperCase()) }))}
    />
  );
}

const nameRules = [required('Name the habit.'), atMost(80, 'Use at most 80 characters.')];
const empty = { title: 'No habits yet', hint: 'Habits you keep show up here, with a check for each day.' };

export function HabitsPage() {
  const auth = useAuth();
  const habits = useResource<Habit[]>('/me/habits', true, { live: ['habits'] });
  const saving = useAction();
  const { report } = saving;
  const habitForm = useFormErrors();
  const [editing, setEditing] = useState<Habit | 'new'>();
  const [deleting, setDeleting] = useState<Habit>();
  const replace = (next: Habit) => habits.mutate((current) => current.map((habit) => (habit.id === next.id ? next : habit)));
  const [rows] = useRememberedShape('habits', habits.data && [habits.data.length], [3]);

  return (
    <Page actions={<AddButton label="New habit" large onClick={() => setEditing('new')} primary />} title="Habits">
      {habits.error ? (
        <LoadError error={habits.error} onRetry={habits.reload} />
      ) : !habits.data ? (
        <Placeholder label="Loading your habits">
          {rows ? (
            <ul aria-hidden="true" className="panel-rows">
              {rowsOf(rows).map((row) => (
                <HabitRowSkeleton key={row} row={row} />
              ))}
            </ul>
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : habits.data.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {habits.data.map((habit) => (
            <HabitRow
              actions={
                <ActionsMenu
                  items={[
                    { label: 'Edit', onSelect: () => setEditing(habit) },
                    { label: 'Delete', onSelect: () => setDeleting(habit), separated: true },
                  ]}
                  name={habit.name}
                />
              }
              habit={habit}
              key={habit.id}
              onChange={replace}
            />
          ))}
        </ul>
      )}

      {editing && (
        <FormDialog
          busy={saving.busy}
          busyLabel={editing === 'new' ? 'Adding…' : 'Saving…'}
          onClose={() => setEditing(undefined)}
          onSubmit={(form) => {
            if (!habitForm.check(form, { name: nameRules })) return;
            const values = new FormData(form);
            const body = JSON.stringify({ name: String(values.get('name')).trim(), perWeek: Number(values.get('perWeek')) });
            void saving
              .run(async () => {
                if (editing === 'new') {
                  const created = await auth.request<Habit>('/me/habits', { method: 'POST', body });
                  habits.mutate((current) => [...current, created]);
                  return `Added ${created.name}.`;
                }
                const updated = await auth.request<Habit>(`/habits/${editing.id}`, { method: 'PATCH', body });
                replace(updated);
                return `Saved ${updated.name}.`;
              }, editing === 'new' ? 'Could not add the habit' : 'Could not save the habit')
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel={editing === 'new' ? 'Add habit' : 'Save changes'}
          title={editing === 'new' ? 'New habit' : 'Edit habit'}
        >
          <TextField autoFocus defaultValue={editing === 'new' ? '' : editing.name} label="Name" maxLength={80} {...habitForm.field('name')} />
          <GoalSelect defaultValue={editing === 'new' ? 7 : editing.perWeek} />
        </FormDialog>
      )}

      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete habit"
          errorFallback="Could not delete the habit"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/habits/${deleting.id}`, { method: 'DELETE' });
            habits.mutate((current) => current.filter((habit) => habit.id !== deleting.id));
            report(`Deleted ${deleting.name}.`);
          }}
          title={`Delete ${deleting.name}?`}
          tone="danger"
        >
          Your check-ins for it are deleted too.
        </ConfirmDialog>
      )}
    </Page>
  );
}
