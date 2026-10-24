import { useState } from 'react';
import { Avatar, Dialog } from '@project-graphite/ui';
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
      <div className="flex items-center gap-2">
        <div aria-hidden="true" className="flex -space-x-2">
          {people.slice(0, 5).map((person) => <Avatar key={person.id} name={person.name} present={person.activity !== 'idle'} />)}
        </div>
        <TextButton label={`${people.length} ${people.length === 1 ? 'person' : 'people'} here`} onClick={() => setOpen(true)} />
        {actions?.following && <><span className="mono-sm text-muted" role="status">Following {people.find((person) => person.id === actions.following)?.name ?? 'collaborator'}</span><TextButton label="Stop following" onClick={actions.onStop} /></>}
      </div>
      {open && (
        <Dialog onClose={() => setOpen(false)} title="People here">
          <ul className="mt-5 grid max-h-80 list-none gap-3 overflow-y-auto p-0">
            {people.map((person) => (
              <li className="flex flex-wrap items-center gap-3" key={person.id}>
                <Avatar name={person.name} present={person.activity !== 'idle'} />
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm text-ink">{person.name}</p>
                  <p className="m-0 text-sm text-muted">{person.guest ? 'Guest' : 'Member'} · {person.access === 'edit' ? 'Can edit' : 'Can view'}</p>
                  <p className="m-0 text-sm text-muted">{{ reading: 'Reading', editing: 'Editing', idle: 'Idle' }[person.activity]}</p>
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
