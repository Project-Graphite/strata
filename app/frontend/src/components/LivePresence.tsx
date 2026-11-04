import { useState } from 'react';
import { Avatar, Checkbox, ConfirmDialog, Dialog, ListRow } from '@project-graphite/ui';
import { ActionsMenu } from './ActionsMenu';
import { TextButton } from './Button';
import { setCollaboratorsHidden, useCollaboratorsHidden } from './collaborator-visibility';
import type { Person } from './live-document';

export interface PresenceActions {
  positions: ReadonlyMap<string, string>;
  following?: string;
  onFollow(id: string): void;
  onStop(): void;
  onJump(id: string): void;
}

export function LivePresence({ people, actions, onRemove }: { people: Person[]; actions?: PresenceActions; onRemove?: (person: Person) => void }) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<Person>();
  const hidden = useCollaboratorsHidden();
  if (people.length === 0) return null;
  if (removing && onRemove) {
    return (
      <ConfirmDialog
        busyLabel="Removing…"
        confirmLabel="Remove"
        errorFallback="Could not remove them"
        onClose={() => setRemoving(undefined)}
        onConfirm={async () => onRemove(removing)}
        title={`Remove ${removing.name}?`}
        tone="danger"
      >
        They are disconnected now and cannot reopen it for an hour. To keep them out for good, turn off the link they used or change their access.
      </ConfirmDialog>
    );
  }
  return (
    <>
      <div className="live-presence">
        <div aria-hidden="true" className="live-presence-avatars flex -space-x-2">
          {people.slice(0, 5).map((person) => <Avatar key={person.id} name={person.name} present={person.activity !== 'idle'} />)}
        </div>
        <TextButton label={`${people.length} ${people.length === 1 ? 'person' : 'people'} here`} onClick={() => setOpen(true)} />
        {actions?.following && <div className="live-presence-follow"><span className="text-small text-muted" role="status">Following {people.find((person) => person.id === actions.following)?.name ?? 'collaborator'}</span><TextButton label="Stop following" onClick={actions.onStop} /></div>}
      </div>
      {open && (
        <Dialog onClose={() => setOpen(false)} title="People here">
          <ul className="panel-rows mt-5 max-h-80 overflow-y-auto">
            {people.map((person) => {
              const items = [
                ...(actions?.positions.has(person.id)
                  ? [
                      { label: `Jump to ${person.name}`, onSelect: () => { actions.onJump(person.id); setOpen(false); } },
                      { label: `Follow ${person.name}`, onSelect: () => { actions.onFollow(person.id); setOpen(false); } },
                    ]
                  : []),
                ...(onRemove && !person.manages ? [{ label: 'Remove from here', onSelect: () => { setRemoving(person); setOpen(false); } }] : []),
              ];
              return (
                <ListRow
                  key={person.id}
                  lead={<Avatar name={person.name} present={person.activity !== 'idle'} size="md" />}
                  meta={[person.guest ? 'Guest' : person.link ? 'Through a link' : 'Member', person.access === 'edit' ? 'Can edit' : 'Can view', { reading: 'Reading', editing: 'Editing', idle: 'Idle' }[person.activity]].join(' · ')}
                  title={person.name}
                  trail={items.length > 0 && <ActionsMenu items={items} name={person.name} />}
                />
              );
            })}
          </ul>
          <div className="mt-4">
            <Checkbox checked={!hidden} label="Show other people's cursors and highlights" onChange={(event) => setCollaboratorsHidden(!event.currentTarget.checked)} />
          </div>
        </Dialog>
      )}
    </>
  );
}
