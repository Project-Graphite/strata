import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatDay, PageSkeleton, Select, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { ActionsMenu } from '../components/ActionsMenu';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { IconButton } from '../components/IconButton';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section } from '../components/Page';
import { PersonEditor } from '../components/PersonEditor';
import { birthdayText, nextBirthdayText, type GiftIdea, type PersonDetail } from '../people';
import { useSpaces, type Item } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { clockTime } from '../time';

type EventLink = PersonDetail['events'][number];

export function PersonPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const person = useResource<PersonDetail>(`/people/${id}`, true);
  const action = useAction();
  const ideaForm = useFormErrors();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'idea' | 'event'>();

  if (person.error) return <LoadError error={person.error} onRetry={person.reload} />;
  if (!person.data) return <PageSkeleton label="Loading this person" />;
  const shown = person.data;
  const space = spaces.data?.find((candidate) => candidate.id === shown.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
  const today = dayKey(new Date());
  const upcoming = shown.events.filter((event) => event.startsOn >= today).reverse();
  const earlier = shown.events.filter((event) => event.startsOn < today);

  function saveIdeas(giftIdeas: GiftIdea[], done: string) {
    return action.run(async () => {
      const saved = await auth.request<PersonDetail>(`/people/${shown.id}`, { method: 'PATCH', body: JSON.stringify({ giftIdeas }) });
      person.mutate(() => saved);
      return done;
    }, 'Could not save the gift ideas');
  }

  function unlink(event: EventLink) {
    void action.run(async () => {
      await auth.request(`/items/${event.ownLink ? shown.id : event.id}/links/${event.linkId}`, { method: 'DELETE' });
      person.mutate((current) => ({ ...current, events: current.events.filter((kept) => kept.linkId !== event.linkId) }));
      return '';
    }, 'Could not unlink the event');
  }

  const eventList = (events: EventLink[]) => (
    <ul className="panel-rows">
      {events.map((event) => (
        <li className="panel-row flex items-center gap-3" key={event.linkId}>
          <Link className="grid min-w-0 flex-1 text-ink no-underline hover:underline" to={`/events/${event.id}`}>
            <span className="truncate">{event.title}</span>
            <span className="text-sm text-muted">
              {formatDay(event.startsOn)}
              {event.startTime ? ` · ${clockTime(event.startTime)}` : ''}
            </span>
          </Link>
          {editable && (
            <ActionsMenu items={[{ label: 'Unlink this event', onSelect: () => unlink(event) }]} name={event.title} />
          )}
        </li>
      ))}
    </ul>
  );

  const details = [
    [
      'Birthday',
      birthdayText(shown) && (
        <span className="grid sm:text-right">
          {birthdayText(shown)}
          <span className="text-sm text-muted">Next: {nextBirthdayText(shown, today)}</span>
        </span>
      ),
    ],
    ['Email', shown.email && <a href={`mailto:${shown.email}`}>{shown.email}</a>],
    ['Phone', shown.phone && <a href={`tel:${shown.phone.replace(/\s/g, '')}`}>{shown.phone}</a>],
  ].filter(([, value]) => value);

  return (
    <Page
      actions={
        editable && (
          <>
            <IconButton icon="pencil" label="Edit" onClick={() => setEditing(true)} />
            <ActionsMenu
              items={[
                {
                  label: 'Move to trash',
                  onSelect: () =>
                    void action.run(async () => {
                      await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
                      navigate('/people');
                      return `Moved ${shown.name} to the trash.`;
                    }, 'Could not move this person to the trash'),
                },
              ]}
              name={shown.name}
            />
          </>
        )
      }
      description={shown.relationship ?? undefined}
      eyebrow={shown.spaceName}
      title={shown.name}
    >
      {(details.length > 0 || shown.notes) && (
        <Section title="Details">
          {details.length > 0 && (
            <dl className="panel-rows m-0">
              {details.map(([label, value]) => (
                <div className="panel-row flex flex-wrap justify-between gap-x-4 gap-y-1" key={label as string}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="m-0 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {shown.notes && <p className="m-0 whitespace-pre-wrap text-ink">{shown.notes}</p>}
        </Section>
      )}

      <Section action={editable && <HeaderButton icon="gift" label="Add idea" onClick={() => setDialog('idea')} />} title="Gift ideas">
        {shown.giftIdeas.length === 0 ? (
          <Hint>No gift ideas yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {shown.giftIdeas.map((idea) => (
              <li className="panel-row flex items-center gap-3" key={idea.id}>
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    checked={idea.done}
                    disabled={!editable || action.busy}
                    onChange={() => void saveIdeas(shown.giftIdeas.map((kept) => (kept.id === idea.id ? { ...kept, done: !kept.done } : kept)), '')}
                    type="checkbox"
                  />
                  <span className={`truncate ${idea.done ? 'text-faint line-through' : 'text-ink'}`}>{idea.text}</span>
                </label>
                {editable && (
                  <ActionsMenu items={[{ label: 'Remove', onSelect: () => void saveIdeas(shown.giftIdeas.filter((kept) => kept.id !== idea.id), 'Gift idea removed.') }]} name={idea.text} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section action={editable && <HeaderButton icon="link" label="Link an event" onClick={() => setDialog('event')} />} title="Events together">
        {shown.events.length === 0 ? (
          <Hint>No events linked yet.</Hint>
        ) : (
          <div className="grid gap-4">
            {upcoming.length > 0 && eventList(upcoming)}
            {earlier.length > 0 && (
              <div className="grid gap-2">
                <h3 className="m-0 text-sm font-medium text-muted">Earlier</h3>
                {eventList(earlier)}
              </div>
            )}
          </div>
        )}
      </Section>

      {editing && space && <PersonEditor onClose={() => setEditing(false)} onSaved={(saved) => person.mutate((current) => ({ ...current, ...saved }))} person={shown} spaces={[space]} />}

      {dialog === 'idea' && (
        <FormDialog
          busy={action.busy}
          busyLabel="Saving…"
          onClose={() => setDialog(undefined)}
          onSubmit={(target) => {
            if (!ideaForm.check(target, { text: [required('Write the idea down.'), atMost(200, 'Use at most 200 characters.')] })) return;
            const text = String(new FormData(target).get('text')).trim();
            void saveIdeas([...shown.giftIdeas, { id: crypto.randomUUID(), text, done: false }], '').then((saved) => saved && setDialog(undefined));
          }}
          submitLabel="Add idea"
          title={`A gift idea for ${shown.name}`}
        >
          <TextField autoComplete="off" autoFocus label="Idea" maxLength={200} {...ideaForm.field('text')} />
        </FormDialog>
      )}

      {dialog === 'event' && (
        <LinkEventDialog
          onClose={() => setDialog(undefined)}
          onLinked={() => {
            person.reload();
            setDialog(undefined);
          }}
          person={shown}
        />
      )}
    </Page>
  );
}

function LinkEventDialog({ onClose, onLinked, person }: { onClose: () => void; onLinked: () => void; person: PersonDetail }) {
  const auth = useAuth();
  const linking = useAction();
  const events = useResource<ResultPage<Item>>(`/spaces/${person.spaceId}/items?kind=event`, true);
  const [chosen, setChosen] = useState('');
  const linked = new Set(person.events.map((event) => event.id));
  const choices = (events.data?.results ?? []).filter((event) => !linked.has(event.id));

  return (
    <FormDialog
      busy={linking.busy}
      busyLabel="Linking…"
      onClose={onClose}
      onSubmit={() => {
        if (!chosen) return;
        void linking
          .run(async () => {
            await auth.request(`/items/${person.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: chosen, kind: 'reference' }) });
            return '';
          }, 'Could not link the event')
          .then((done) => done && onLinked());
      }}
      submitLabel="Link event"
      title={`Link an event with ${person.name}`}
    >
      {events.data && choices.length === 0 ? (
        <Hint>There are no other events in {person.spaceName} to link.</Hint>
      ) : (
        <Select
          label="Event"
          onChange={setChosen}
          options={choices.map((event) => ({ value: event.id, label: event.title || 'Untitled' }))}
          placeholder={events.data ? 'Choose an event' : 'Loading events…'}
          searchable
          value={chosen}
        />
      )}
    </FormDialog>
  );
}
