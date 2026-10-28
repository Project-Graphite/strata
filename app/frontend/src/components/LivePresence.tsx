import { useState } from 'react';
import { Avatar, Dialog } from '@project-graphite/ui';
import { TextButton } from './Button';
import { Hint } from './Hint';
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
          <ul className="mt-5 grid max-h-80 list-none gap-3 overflow-y-auto p-0">
            {people.map((person) => (
              <li className="flex flex-wrap items-center gap-3" key={person.id}>
                <Avatar name={person.name} present={person.activity !== 'idle'} />
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm text-ink">{person.name}</p>
                  <Hint>{person.guest ? 'Guest' : 'Member'} · {person.access === 'edit' ? 'Can edit' : 'Can view'}</Hint>
                  <Hint>{{ reading: 'Reading', editing: 'Editing', idle: 'Idle' }[person.activity]}</Hint>
                </div>
                {actions?.positions.has(person.id) && <div className="ml-auto flex gap-2" data-block-id={actions.positions.get(person.id)}><TextButton label={`Jump to ${person.name}`} onClick={() => { actions.onJump(person.id); setOpen(false); }} /><TextButton label={`Follow ${person.name}`} onClick={() => { actions.onFollow(person.id); setOpen(false); }} /></div>}
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </>
  );
}
