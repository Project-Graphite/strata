import { useState } from 'react';
import { Select, type SelectOption } from '@project-graphite/ui';
import { Empty } from './Empty';
import { FormDialog } from './FormDialog';

export function LinkItemDialog({
  busy = false,
  choices,
  empty,
  noun,
  onClose,
  onLink,
  title,
}: {
  busy?: boolean;
  choices?: SelectOption[];
  empty: string;
  noun: 'task' | 'event';
  onClose: () => void;
  onLink: (id: string) => void;
  title: string;
}) {
  const [chosen, setChosen] = useState('');
  return (
    <FormDialog busy={busy} busyLabel="Linking…" onClose={onClose} onSubmit={() => chosen && onLink(chosen)} submitLabel={`Link ${noun}`} title={title}>
      {choices && choices.length === 0 ? (
        <Empty level={3} title={`No ${noun}s to link`}>{empty}</Empty>
      ) : (
        <Select
          label={noun === 'task' ? 'Task' : 'Event'}
          onChange={setChosen}
          options={choices ?? []}
          placeholder={choices ? `Choose ${noun === 'task' ? 'a task' : 'an event'}` : `Loading ${noun}s…`}
          searchable
          value={chosen}
        />
      )}
    </FormDialog>
  );
}
