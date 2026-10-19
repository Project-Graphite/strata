import { useState } from 'react';
import { Select, type SelectOption } from '@project-graphite/ui';
import { FormDialog } from './FormDialog';
import { Hint } from './Hint';

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
    <FormDialog busy={busy} busyLabel="Linking…" onClose={onClose} onSubmit={() => onLink(chosen)} submitDisabled={!chosen} submitLabel={`Link ${noun}`} title={title}>
      {choices && choices.length === 0 ? (
        <Hint>{empty}</Hint>
      ) : (
        <Select
          aria-label={noun === 'task' ? 'Task' : 'Event'}
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
