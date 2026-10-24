import FormLabel from '@mui/material/FormLabel';
import { useState } from 'react';
import { Select, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { dayOptions, monthOptions, type Person } from '../people';
import type { Space } from '../spaces';
import { useAction } from '../useAction';
import { atMost, emailAddress, required, useFormErrors, type Check } from '../validation';
import { FormDialog } from './FormDialog';

const yearCheck: Check = (value) => (!value.trim() || /^(19|20)\d{2}$/.test(value.trim()) ? undefined : 'Enter a year such as 1990.');

export function PersonEditor({ onClose, onSaved, person, spaces }: { onClose: () => void; onSaved: (person: Person) => void; person?: Person; spaces: Space[] }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [month, setMonth] = useState(person?.birthdayMonth ? String(person.birthdayMonth) : '');
  const [day, setDay] = useState(person?.birthdayDay ? String(person.birthdayDay) : '');
  const [birthdayError, setBirthdayError] = useState<string>();

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={person ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        const valid = form.check(target, { name: [required('Enter their name.'), atMost(200, 'Use at most 200 characters.')], email: [emailAddress], birthYear: [yearCheck] });
        const halfBirthday = Boolean(month) !== Boolean(day);
        setBirthdayError(halfBirthday ? 'Choose both the day and the month, or neither.' : undefined);
        if (!valid || halfBirthday) return;
        const values = new FormData(target);
        const text = (name: string) => String(values.get(name) ?? '').trim() || null;
        const year = text('birthYear');
        const body = {
          name: text('name'),
          relationship: text('relationship'),
          birthdayMonth: month ? Number(month) : null,
          birthdayDay: day ? Number(day) : null,
          birthYear: year && month ? Number(year) : null,
          email: text('email'),
          phone: text('phone'),
          notes: text('notes') ?? '',
        };
        void saving
          .run(async () => {
            onSaved(
              await auth.request<Person>(person ? `/people/${person.id}` : `/spaces/${String(values.get('spaceId'))}/people`, {
                method: person ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
              }),
            );
            return `${person ? 'Saved' : 'Added'} ${body.name}.`;
          }, 'Could not save this person')
          .then((saved) => saved && onClose());
      }}
      submitLabel={person ? 'Save' : 'Add person'}
      title={person ? 'Edit person' : 'New person'}
    >
      <TextField autoComplete="off" autoFocus defaultValue={person?.name} label="Name" maxLength={200} {...form.field('name')} />
      {!person && spaces[0] && <input name="spaceId" type="hidden" value={spaces[0]!.id} />}
      <TextField defaultValue={person?.relationship ?? ''} label="Relationship (optional)" maxLength={60} name="relationship" placeholder="Friend, sister, colleague" />
      <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-3">
        <FormLabel className="mb-2" component="legend">Birthday (optional)</FormLabel>
        <Select error={birthdayError} label="Day" onChange={setDay} options={[{ value: '', label: 'None' }, ...dayOptions]} value={day} />
        <Select label="Month" onChange={setMonth} options={[{ value: '', label: 'None' }, ...monthOptions]} value={month} />
        <TextField defaultValue={person?.birthYear ?? ''} inputMode="numeric" label="Year, if known" maxLength={4} {...form.field('birthYear')} />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField autoComplete="off" defaultValue={person?.email ?? ''} inputMode="email" label="Email (optional)" type="email" {...form.field('email')} />
        <TextField autoComplete="off" defaultValue={person?.phone ?? ''} inputMode="tel" label="Phone (optional)" maxLength={40} name="phone" type="tel" />
      </div>
      <TextAreaField defaultValue={person?.notes} label="Notes (optional)" maxLength={5000} name="notes" rows={3} />
    </FormDialog>
  );
}
