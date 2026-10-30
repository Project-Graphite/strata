import { useState } from 'react';
import { ListRow, SectionHeading, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, TextButton } from './Button';
import { Copyable } from './Copyable';
import { LoadError } from './LoadError';

const roles = [{ value: 'view', label: 'Can view' }, { value: 'comment', label: 'Can comment' }, { value: 'edit', label: 'Can edit' }, { value: 'manage', label: 'Can edit and share' }];

interface Person {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function PagePeople({ itemId }: { itemId: string }) {
  const auth = useAuth();
  const people = useResource<{ people: Person[] }>(`/notes/${itemId}/people`, true, { live: ['page-details'], itemIds: [itemId] });
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
    <SectionHeading action={<Copyable compact value={`${window.location.origin}/notes/${itemId}`} />} level={3} title="People" />
    {people.error ? <LoadError compact error={people.error} onRetry={people.reload} /> : people.data && <>
      <form className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_auto]" onSubmit={(event) => { event.preventDefault(); void save(email, role).then((saved) => { if (saved) setEmail(''); }); }}>
        <div className="col-span-2 min-w-0 sm:col-span-1"><TextField label="Account email" maxLength={320} onChange={(event) => setEmail(event.currentTarget.value)} type="email" value={email} /></div>
        <Select label="Access" onChange={setRole} options={roles} value={role} />
        <Button disabled={action.busy || !email.trim()} label={action.busy ? 'Saving…' : 'Add'} submit />
      </form>
      {people.data.people.length > 0 && <ul className="panel-rows">{people.data.people.map((person) => <ListRow key={person.userId} meta={person.email} title={person.name} trail={<>
        <Select aria-label={`Access for ${person.name}`} disabled={action.busy || person.userId === auth.user?.id} onChange={(role) => void save(person.email, role)} options={roles} quiet size="small" value={person.role} />
        {person.userId !== auth.user?.id && <TextButton disabled={action.busy} label="Remove" onClick={() => void action.run(async () => {
          await auth.request(`/notes/${itemId}/people/${person.userId}`, { method: 'DELETE' });
          people.reload();
          return 'Removed page access.';
        }, 'Could not remove page access')} />}
      </>} />)}</ul>}
    </>}
  </section>;
}
