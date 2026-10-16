import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatDay, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, IconButton } from '../components/Button';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LinkItemDialog } from '../components/LinkItemDialog';
import { DetailState, Page, Section, Subheading } from '../components/Page';
import { PersonEditor } from '../components/PersonEditor';
import { RowText } from '../components/RowText';
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
  const events = useResource<ResultPage<Item>>(dialog === 'event' && person.data ? `/spaces/${person.data.spaceId}/items?kind=event` : null, true);

  const back = { to: '/people', label: 'People' };
  if (!person.data) return <DetailState back={back} resource={person} thing="Person" />;
  const shown = person.data;
  const space = spaces.data?.find((candidate) => candidate.id === shown.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
  const today = dayKey(new Date());
  const upcoming = shown.events.filter((event) => event.startsOn >= today).reverse();
  const earlier = shown.events.filter((event) => event.startsOn < today);

  async function saveIdeas(giftIdeas: GiftIdea[]) {
    const saved = await auth.request<PersonDetail>(`/people/${shown.id}`, { method: 'PATCH', body: JSON.stringify({ giftIdeas }) });
    person.mutate(() => saved);
  }

  async function link(eventId: string) {
    await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: eventId, kind: 'reference' }) });
    person.reload();
  }

  function unlink(event: EventLink) {
    void action.run(async () => {
      await auth.request(`/items/${event.ownLink ? shown.id : event.id}/links/${event.linkId}`, { method: 'DELETE' });
      person.mutate((current) => ({ ...current, events: current.events.filter((kept) => kept.linkId !== event.linkId) }));
      return {
        message: `Removed ${event.title} from ${shown.name}’s events.`,
        undo: async () => {
          await link(event.id);
          return '';
        },
      };
    }, 'Could not remove the event');
  }

  function removeIdea(idea: GiftIdea) {
    const before = shown.giftIdeas;
    void action.run(async () => {
      await saveIdeas(before.filter((kept) => kept.id !== idea.id));
      return {
        message: `Removed ${idea.text}.`,
        undo: async () => {
          await saveIdeas(before);
          return '';
        },
      };
    }, 'Could not remove the gift idea');
  }

  const eventList = (events: EventLink[]) => (
    <ul className="panel-rows">
      {events.map((event) => (
        <li className="flex items-center pe-2 hover:bg-line-soft" key={event.linkId}>
          <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" to={`/events/${event.id}`}>
            <RowText detail={`${formatDay(event.startsOn)}${event.startTime ? ` · ${clockTime(event.startTime)}` : ''}`} title={event.title} />
          </Link>
          {editable && <ActionsMenu items={[{ label: `Remove from ${shown.name}’s events`, onSelect: () => unlink(event) }]} name={event.title} />}
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
                  separated: true,
                  onSelect: () =>
                    void action.run(async () => {
                      await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
                      navigate('/people');
                      return {
                        message: `Moved ${shown.name} to the trash.`,
                        undo: async () => {
                          await auth.request(`/items/${shown.id}/restore`, { method: 'POST' });
                          navigate(`/people/${shown.id}`);
                          return '';
                        },
                      };
                    }, 'Could not move this person to the trash'),
                },
              ]}
              name={shown.name}
            />
          </>
        )
      }
      back={back}
      description={[shown.spaceName, shown.relationship].filter(Boolean).join(' · ')}
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

      <Section action={editable && <Button icon="plus" label="New gift idea" onClick={() => setDialog('idea')} />} title="Gift ideas">
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
                    onChange={() =>
                      void action.run(async () => {
                        await saveIdeas(shown.giftIdeas.map((kept) => (kept.id === idea.id ? { ...kept, done: !kept.done } : kept)));
                        return '';
                      }, 'Could not save the gift idea')
                    }
                    type="checkbox"
                  />
                  <span className={`truncate ${idea.done ? 'text-faint line-through' : 'text-ink'}`}>{idea.text}</span>
                </label>
                {editable && <ActionsMenu items={[{ label: 'Remove', onSelect: () => removeIdea(idea) }]} name={idea.text} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section action={editable && <Button icon="link" label="Link an event" onClick={() => setDialog('event')} />} title="Events together">
        {shown.events.length === 0 ? (
          <Hint>No events linked yet.</Hint>
        ) : (
          <div className="grid gap-4">
            {upcoming.length > 0 && eventList(upcoming)}
            {earlier.length > 0 && (
              <div className="grid gap-2">
                <Subheading>Earlier</Subheading>
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
          busyLabel="Adding…"
          onClose={() => setDialog(undefined)}
          onSubmit={(target) => {
            if (!ideaForm.check(target, { text: [required('Write the idea down.'), atMost(200, 'Use at most 200 characters.')] })) return;
            const text = String(new FormData(target).get('text')).trim();
            void action
              .run(async () => {
                await saveIdeas([...shown.giftIdeas, { id: crypto.randomUUID(), text, done: false }]);
                return `Added ${text}.`;
              }, 'Could not add the gift idea')
              .then((saved) => saved && setDialog(undefined));
          }}
          submitLabel="Add gift idea"
          title="New gift idea"
        >
          <TextField autoComplete="off" autoFocus label="Idea" maxLength={200} {...ideaForm.field('text')} />
        </FormDialog>
      )}

      {dialog === 'event' && (
        <LinkItemDialog
          busy={action.busy}
          choices={events.data?.results.filter((event) => !shown.events.some((linked) => linked.id === event.id)).map((event) => ({ value: event.id, label: event.title || 'Untitled' }))}
          empty={`There are no other events in ${shown.spaceName} to link.`}
          noun="event"
          onClose={() => setDialog(undefined)}
          onLink={(eventId) =>
            void action
              .run(async () => {
                await link(eventId);
                return `Linked ${events.data?.results.find((event) => event.id === eventId)?.title || 'the event'}.`;
              }, 'Could not link the event')
              .then((done) => done && setDialog(undefined))
          }
          title={`Link an event with ${shown.name}`}
        />
      )}
    </Page>
  );
}
