import { useState } from 'react';
import { Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { NoteDetails } from '../notes';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, TextButton } from './Button';
import { Copyable } from './Copyable';
import { Hint } from './Hint';
import { LoadError } from './LoadError';
import { Subheading } from './Page';

const roles = [{ value: 'view', label: 'Can view' }, { value: 'comment', label: 'Can comment' }, { value: 'edit', label: 'Can edit' }, { value: 'manage', label: 'Can edit and share' }];

interface Person {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function PagePeople({ itemId }: { itemId: string }) {
  const auth = useAuth();
  const people = useResource<{ permissions: NoteDetails['permissions']; people: Person[] }>(`/notes/${itemId}/people`, true, { live: ['page-details'], itemIds: [itemId] });
  const action = useAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('view');
  function save(email: string, role: string) {
    return action.run(async () => {
      await auth.request(`/notes/${itemId}/people`, { method: 'PUT', body: JSON.stringify({ email, role }) });
      people.reload();
      return 'Updated page access.';
    }, 'Could not update page access');
  }
  return <section aria-label="People with page access" className="grid gap-3">
    <Subheading>People</Subheading>
    <Hint>Share this page with an existing Strata account. Subpages, database rows and the rest of the space need their own access. Space permissions still apply.</Hint>
    {people.error ? <LoadError compact error={people.error} onRetry={people.reload} /> : people.data && <>
      <Hint>Your access: {people.data.permissions.spaceRole ? `${people.data.permissions.spaceRole} in this space` : roles.find((role) => role.value === people.data!.permissions.pageRole)?.label}. Page managers can change people and public links.</Hint>
      <Copyable value={`${window.location.origin}/notes/${itemId}`} />
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save(email, role).then((saved) => { if (saved) setEmail(''); }); }}>
        <TextField label="Account email" maxLength={320} onChange={(event) => setEmail(event.currentTarget.value)} type="email" value={email} />
        <Select label="Page access" onChange={setRole} options={roles} value={role} />
        <Button disabled={action.busy || !email.trim()} label="Add person" submit />
      </form>
      <ul className="m-0 grid list-none gap-3 p-0">{people.data.people.map((person) => <li className="grid gap-2 rounded-field border border-line p-3" key={person.userId}>
        <p className="m-0 text-sm text-ink">{person.name} <span className="text-muted">{person.email}</span></p>
        <Select disabled={action.busy || person.userId === auth.user?.id} label={`Access for ${person.name}`} onChange={(role) => void save(person.email, role)} options={roles} value={person.role} />
        {person.userId !== auth.user?.id && <TextButton disabled={action.busy} label={`Remove ${person.name}`} onClick={() => void action.run(async () => {
          await auth.request(`/notes/${itemId}/people/${person.userId}`, { method: 'DELETE' });
          people.reload();
          return 'Removed direct page access. Space access still applies.';
        }, 'Could not remove page access')} />}
      </li>)}</ul>
      {people.data.people.length === 0 && <Hint>No direct page grants yet.</Hint>}
    </>}
  </section>;
}
