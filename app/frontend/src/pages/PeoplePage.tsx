import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, ListRow, Placeholder } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { PersonEditor } from '../components/PersonEditor';
import { nextBirthdayText, type Person } from '../people';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';
import { AvatarSkeleton, RowsSkeleton, useRememberedShape } from '../components/Skeletons';

const soonDays = 60;
const empty = { title: 'No people yet', hint: 'Add the people you care about to keep their birthdays on your agenda, gift ideas and the events you shared.' };

function PersonRow({ detail, person }: { detail: string | null; person: Person }) {
  return <ListRow href={`/people/${person.id}`} lead={<Avatar name={person.name} />} meta={detail} title={person.name} />;
}

export function PeoplePage() {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const people = useResource<Person[]>('/me/people', true);
  const [adding, setAdding] = useState(false);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const today = dayKey(new Date());
  const horizon = dayKey(new Date(Date.now() + soonDays * 86_400_000));
  const soon = (people.data ?? [])
    .filter((person) => person.nextBirthday && person.nextBirthday <= horizon)
    .sort((a, b) => a.nextBirthday!.localeCompare(b.nextBirthday!));
  const [soonRows, everyoneRows] = useRememberedShape('people', people.data && [soon.length, people.data.length], [0, 4]);
  const firstAction = writable.length > 0 && <Button icon="plus" label="New person" onClick={() => setAdding(true)} primary />;

  return (
    <Page
      actions={writable.length > 0 && <Button icon="plus" label="New person" large onClick={() => setAdding(true)} primary />}
      title="People"
    >
      {people.error ? (
        <LoadError error={people.error} onRetry={people.reload} />
      ) : !people.data ? (
        <Placeholder className="grid gap-8" label="Loading people">
          {everyoneRows ? (
            <>
              {soonRows > 0 && (
                <Section title="Birthdays coming up">
                  <RowsSkeleton lead={<AvatarSkeleton />} rows={soonRows} />
                </Section>
              )}
              <Section title="Everyone">
                <RowsSkeleton lead={<AvatarSkeleton />} rows={everyoneRows} />
              </Section>
            </>
          ) : (
            <Empty action={firstAction} icon="users" loading title={empty.title} variant="page">
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : people.data.length === 0 ? (
        <Empty action={firstAction} icon="users" title={empty.title} variant="page">
          {empty.hint}
        </Empty>
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
      {adding && <PersonEditor onClose={() => setAdding(false)} onSaved={(saved) => navigate(`/people/${saved.id}`)} spaces={writable} />}
    </Page>
  );
}
