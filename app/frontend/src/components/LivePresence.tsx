import { useState } from 'react';
import { Avatar, Dialog, ListRow } from '@project-graphite/ui';
import { ActionsMenu } from './ActionsMenu';
import { TextButton } from './Button';
import type { Person } from './live-document';

export interface PresenceActions {
  positions: ReadonlyMap<string, string>;
  following?: string;
  onFollow(id: string): void;
  onStop(): void;
  onJump(id: string): void;
}

export function LivePresence({ people, actions }: { people: Person[]; actions?: PresenceActions }) {
  const [open, setOpen] = useState(false);
  if (people.length === 0) return null;
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
            {people.map((person) => (
              <ListRow
                key={person.id}
                lead={<Avatar name={person.name} present={person.activity !== 'idle'} size="md" />}
                meta={[person.guest ? 'Guest' : 'Member', person.access === 'edit' ? 'Can edit' : 'Can view', { reading: 'Reading', editing: 'Editing', idle: 'Idle' }[person.activity]].join(' · ')}
                title={person.name}
                trail={
                  actions?.positions.has(person.id) && (
                    <ActionsMenu
                      items={[
                        { label: `Jump to ${person.name}`, onSelect: () => { actions.onJump(person.id); setOpen(false); } },
                        { label: `Follow ${person.name}`, onSelect: () => { actions.onFollow(person.id); setOpen(false); } },
                      ]}
                      name={person.name}
                    />
                  )
                }
              />
            ))}
          </ul>
        </Dialog>
      )}
    </>
  );
}
