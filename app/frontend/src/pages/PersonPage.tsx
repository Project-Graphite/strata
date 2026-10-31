import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Checkbox, ListRow, TextField } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { dayKey } from '../agenda';
import { ActionsMenu } from '../components/ActionsMenu';
import { AddButton, Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { LinkItemDialog } from '../components/LinkItemDialog';
import { DetailState, Page, Section } from '../components/Page';
import { PersonEditor } from '../components/PersonEditor';
import { AddButtonSkeleton, ButtonSkeleton, rowsOf, RowsSkeleton, SkeletonLine, TaskRowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { birthdayText, type GiftIdea, type PersonDetail } from '../people';
import { useSpaces, type Item } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { formatDate } from '../time';

type EventLink = PersonDetail['events'][number];

const emptyIdeas = { title: 'No gift ideas yet', hint: 'Write down gift ideas as they come to you, and tick them off once given.' };
const emptyEvents = { title: 'No events yet', hint: 'Link events you share with this person to see them together here.' };

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

  const space = spaces.data?.find((candidate) => candidate.id === person.data?.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
  const today = dayKey(new Date());
  const upcoming = (person.data?.events ?? []).filter((event) => event.startsOn >= today).reverse();
  const earlier = (person.data?.events ?? []).filter((event) => event.startsOn < today);
  const [wasEditable, birthday, contactRows, notesLines, ideaRows, upcomingRows, earlierRows] = useRememberedShape(
    `person-${id}`,
    person.data &&
      spaces.data && [
        Number(editable),
        Number(Boolean(birthdayText(person.data))),
        [person.data.email, person.data.phone].filter(Boolean).length,
        person.data.notes ? person.data.notes.split('\n').length : 0,
        person.data.giftIdeas.length,
        upcoming.length,
        earlier.length,
      ],
    [1, 1, 0, 0, 0, 0, 0],
  );

  const back = { to: '/people', label: 'People' };
  if (!person.data) {
    return (
      <DetailState back={back} menu={wasEditable > 0} primary={wasEditable > 0 && 'Edit'} resource={person} thing="Person">
        {birthday + contactRows + notesLines > 0 && (
          <Section title="Details">
            {birthday + contactRows > 0 && <RowsSkeleton rows={birthday + contactRows} />}
            {notesLines > 0 && (
              <p aria-hidden="true" className="m-0">
                {rowsOf(notesLines).map((line) => (
                  <SkeletonLine key={line} width={line === notesLines - 1 ? 'w-2/5' : 'w-full'} />
                ))}
              </p>
            )}
          </Section>
        )}
        <Section action={wasEditable > 0 && <AddButtonSkeleton />} title="Gift ideas">
          {ideaRows ? (
            <TaskRowsSkeleton detailed={0} rows={ideaRows} />
          ) : (
            <Empty loading title={emptyIdeas.title}>
              {emptyIdeas.hint}
            </Empty>
          )}
        </Section>
        <Section action={wasEditable > 0 && <ButtonSkeleton width="w-32" />} title="Events together">
          {upcomingRows || earlierRows ? (
            <div className="grid gap-4">
              {upcomingRows > 0 && <RowsSkeleton rows={upcomingRows} />}
              {earlierRows > 0 && (
                <Section level={3} title="Earlier">
                  <RowsSkeleton rows={earlierRows} />
                </Section>
              )}
            </div>
          ) : (
            <Empty loading title={emptyEvents.title}>
              {emptyEvents.hint}
            </Empty>
          )}
        </Section>
      </DetailState>
    );
  }
  const shown = person.data;

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
        <ListRow
          href={`/events/${event.id}`}
          key={event.linkId}
          meta={formatDate(event.startsOn, event.startTime)}
          title={event.title}
          trail={editable && <ActionsMenu items={[{ label: `Remove from ${shown.name}’s events`, onSelect: () => unlink(event) }]} name={event.title} />}
        />
      ))}
    </ul>
  );

  const details = [
    [
      ['Birthday', shown.nextBirthday && `next ${formatDate(shown.nextBirthday)}`, shown.turning && `turns ${shown.turning}`].filter(Boolean).join(' · '),
      birthdayText(shown),
    ],
    ['Email', shown.email && <a href={`mailto:${shown.email}`}>{shown.email}</a>],
    ['Phone', shown.phone && <a href={`tel:${shown.phone.replace(/\s/g, '')}`}>{shown.phone}</a>],
  ].filter(([, value]) => value);

  return (
    <Page
      actions={
        editable && (
          <>
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
            <Button icon="pencil" label="Edit" large onClick={() => setEditing(true)} primary />
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
            <ul className="panel-rows">
              {details.map(([label, value]) => (
                <ListRow key={label as string} meta={label} title={value} />
              ))}
            </ul>
          )}
          {shown.notes && <p className="m-0 whitespace-pre-wrap text-ink">{shown.notes}</p>}
        </Section>
      )}

      <Section action={editable && <AddButton label="New gift idea" onClick={() => setDialog('idea')} />} title="Gift ideas">
        {shown.giftIdeas.length === 0 ? (
          <Empty title={emptyIdeas.title}>{emptyIdeas.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {shown.giftIdeas.map((idea) => (
              <ListRow
                key={idea.id}
                lead={
                  <Checkbox
                    aria-label={idea.text}
                    checked={idea.done}
                    disabled={!editable || action.busy}
                    onChange={() =>
                      void action.run(async () => {
                        await saveIdeas(shown.giftIdeas.map((kept) => (kept.id === idea.id ? { ...kept, done: !kept.done } : kept)));
                        return '';
                      }, 'Could not save the gift idea')
                    }
                  />
                }
                title={<span className={idea.done ? 'text-faint line-through' : undefined}>{idea.text}</span>}
                trail={editable && <ActionsMenu items={[{ label: 'Remove', onSelect: () => removeIdea(idea) }]} name={idea.text} />}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section action={editable && <Button icon="link" label="Link an event" onClick={() => setDialog('event')} />} title="Events together">
        {shown.events.length === 0 ? (
          <Empty title={emptyEvents.title}>{emptyEvents.hint}</Empty>
        ) : (
          <div className="grid gap-4">
            {upcoming.length > 0 && eventList(upcoming)}
            {earlier.length > 0 && (
              <Section level={3} title="Earlier">
                {eventList(earlier)}
              </Section>
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
