import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, ListSkeleton } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section } from '../components/Page';
import { PersonEditor } from '../components/PersonEditor';
import { nextBirthdayText, type Person } from '../people';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';

const soonDays = 60;

function PersonRow({ detail, person }: { detail: string | null; person: Person }) {
  return (
    <li>
      <Link className="panel-row flex items-center gap-3 text-ink no-underline hover:bg-line-soft" to={`/people/${person.id}`}>
        <Avatar name={person.name} />
        <span className="grid min-w-0 flex-1">
          <span className="truncate">{person.name}</span>
          {detail && <span className="truncate text-sm text-muted">{detail}</span>}
        </span>
      </Link>
    </li>
  );
}

export function PeoplePage() {
  const spaces = useSpaces();
  const people = useResource<Person[]>('/me/people', true);
  const [adding, setAdding] = useState(false);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const today = dayKey(new Date());
  const horizon = dayKey(new Date(Date.now() + soonDays * 86_400_000));
  const soon = (people.data ?? [])
    .filter((person) => person.nextBirthday && person.nextBirthday <= horizon)
    .sort((a, b) => a.nextBirthday!.localeCompare(b.nextBirthday!));

  return (
    <Page
      actions={writable.length > 0 && <HeaderButton icon="plus" label="Add person" onClick={() => setAdding(true)} primary />}
      title="People"
    >
      {people.error ? (
        <LoadError error={people.error} onRetry={people.reload} />
      ) : !people.data ? (
        <ListSkeleton label="Loading people" rows={4} />
      ) : people.data.length === 0 ? (
        <Empty title="Nobody here yet" />
      ) : (
        <>
          {soon.length > 0 && (
            <Section title="Birthdays coming up">
              <ul className="panel-rows">
                {soon.map((person) => (
                  <PersonRow detail={nextBirthdayText(person, today)} key={person.id} person={person} />
                ))}
              </ul>
            </Section>
          )}
          <Section title="Everyone">
            <ul className="panel-rows">
              {people.data.map((person) => (
                <PersonRow detail={[person.relationship, person.spaceName].filter(Boolean).join(' · ')} key={person.id} person={person} />
              ))}
            </ul>
          </Section>
        </>
      )}
      {adding && <PersonEditor onClose={() => setAdding(false)} onSaved={() => people.reload()} spaces={writable} />}
    </Page>
  );
}
