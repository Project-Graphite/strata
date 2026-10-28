import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ConfirmDialog, IconButton, ListRow, TextField } from '@project-graphite/ui';
import { eventWhen, type EventDetails, type Guest } from '../agenda';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, TextButton } from '../components/Button';
import { optionLabel, PollEditor, PollOptions, type PollAnswer, type PollOption } from '../components/DatePoll';
import { Copyable } from '../components/Copyable';
import { EventEditor } from '../components/EventEditor';
import { Hint } from '../components/Hint';
import { ItemBoards } from '../components/ItemBoards';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { emailAddress, required, useFormErrors } from '../validation';
import { DetailState, Page, Section } from '../components/Page';
import { ButtonSkeleton, FieldSkeleton, HintSkeleton, IconButtonSkeleton, rowsOf, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

const responseLabels: Record<Guest['response'], string> = { yes: 'coming', no: 'not coming', maybe: 'maybe', pending: 'no answer yet' };

const back = { to: '/agenda', label: 'Agenda' };

export function EventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const spaces = useSpaces();
  const event = useResource<EventDetails>(`/events/${id}`, true);
  const poll = useResource<{ options: PollOption[] }>(`/events/${id}/poll`, true);
  const action = useAction();
  const inviting = useAction();
  const sharing = useAction();
  const voting = useAction();
  const [planning, setPlanning] = useState(false);
  const [picking, setPicking] = useState<PollOption>();
  const [closingPoll, setClosingPoll] = useState(false);
  const [removing, setRemoving] = useState<Guest>();
  const form = useFormErrors();
  const [editing, setEditing] = useState(false);
  const [personalLink, setPersonalLink] = useState('');
  const [openLink, setOpenLink] = useState('');

  const space = spaces.data?.find((candidate) => candidate.id === event.data?.spaceId);
  const editable = space ? space.role !== 'viewer' : false;
  const options = poll.data?.options ?? [];
  const [wasEditable, located, meeting, descriptionLines, polled, pollRows, votedRows, guestRows] = useRememberedShape(
    `event-${id}`,
    event.data &&
      spaces.data &&
      poll.data && [
        Number(editable),
        Number(Boolean(event.data.location)),
        Number(Boolean(event.data.meetingUrl)),
        event.data.description ? event.data.description.split('\n').length : 0,
        Number(options.length > 0 || (editable && !event.data.repeatRule)),
        options.length,
        options.filter((option) => option.voters && option.voters.length > 0).length,
        event.data.guests.length,
      ],
    [1, 0, 0, 0, 1, 0, 0, 2],
  );

  if (!event.data) {
    return (
      <DetailState
        actions={wasEditable ? 2 : 0}
        back={back}
        description={
          <>
            <SkeletonLine width="w-80 max-w-full" />
            {located > 0 && <SkeletonLine className="mt-1" width="w-48" />}
            {meeting > 0 && <SkeletonLine className="mt-1" width="w-24" />}
          </>
        }
        resource={event}
        thing="Event"
      >
        {descriptionLines > 0 && (
          <p aria-hidden="true" className="m-0">
            {rowsOf(descriptionLines).map((line) => (
              <SkeletonLine key={line} width={line === descriptionLines - 1 ? 'w-2/5' : 'w-full'} />
            ))}
          </p>
        )}
        {polled > 0 && (
          <Section title="Date poll">
            {pollRows ? (
              <>
                <ul aria-hidden="true" className="panel-rows">
                  {rowsOf(pollRows).map((row) => (
                    <li className="grid gap-2 panel-row" key={row}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <SkeletonLine width="w-40" />
                          <SkeletonLine className="mono-sm mt-0.5" width="w-28" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          {rowsOf(3).map((answer) => (
                            <ButtonSkeleton key={answer} width="w-14" />
                          ))}
                        </div>
                      </div>
                      {row < votedRows && <HintSkeleton />}
                    </li>
                  ))}
                </ul>
                {wasEditable > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <ButtonSkeleton width="w-28" />
                    <ButtonSkeleton width="w-28" />
                  </div>
                )}
              </>
            ) : (
              <ButtonSkeleton width="w-28" />
            )}
          </Section>
        )}
        {wasEditable > 0 && (
          <Section action={<ButtonSkeleton large width="w-32" />} title="Boards">
            <HintSkeleton />
          </Section>
        )}
        <Section description={<SkeletonLine width="w-72 max-w-full" />} title="Guests">
          {guestRows ? <RowsSkeleton rows={guestRows} trail={wasEditable > 0 && <IconButtonSkeleton />} /> : <HintSkeleton />}
        </Section>
        {wasEditable > 0 && (
          <>
            <Section title="Invite a guest">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldSkeleton />
                  <FieldSkeleton />
                </div>
                <ButtonSkeleton width="w-16" />
              </div>
            </Section>
            <Section description="Anyone with this link can answer with their name for 60 days. They see only this event." title="Open invitation link">
              <ButtonSkeleton width="w-24" />
            </Section>
          </>
        )}
      </DetailState>
    );
  }
  const details = event.data;

  function vote(optionId: string, answer: PollAnswer) {
    void voting.run(async () => {
      const saved = await auth.request<{ options: PollOption[] }>(`/events/${details.id}/poll/votes`, { method: 'PUT', body: JSON.stringify({ votes: { [optionId]: answer } }) });
      poll.mutate(() => saved);
      return '';
    }, 'Could not save your answer');
  }

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
                      await auth.request(`/items/${details.id}/trash`, { method: 'POST' });
                      navigate('/agenda');
                      return {
                        message: `Moved ${details.title} to the trash.`,
                        undo: async () => {
                          await auth.request(`/items/${details.id}/restore`, { method: 'POST' });
                          navigate(`/events/${details.id}`);
                          return '';
                        },
                      };
                    }, 'Could not move the event to the trash'),
                },
              ]}
              name={details.title}
            />
          </>
        )
      }
      back={back}
      description={
        <>
          <p className="m-0">{[space?.name, eventWhen(details)].filter(Boolean).join(' · ')}</p>
          {details.location && (
            <p className="mt-1 mb-0">
              {details.location} ·{' '}
              <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(details.location)}`} rel="noopener noreferrer" target="_blank">
                Map
              </a>
            </p>
          )}
          {details.meetingUrl && (
            <p className="mt-1 mb-0">
              <a href={details.meetingUrl} rel="noopener noreferrer" target="_blank">
                Join meeting
              </a>
            </p>
          )}
        </>
      }
      title={details.title}
    >
      {details.description && <p className="m-0 whitespace-pre-wrap text-ink">{details.description}</p>}

      {poll.data && (options.length > 0 || (editable && !details.repeatRule)) && (
        <Section title="Date poll">
          {planning ? (
            <PollEditor
              onCancel={() => setPlanning(false)}
              onSave={async (chosen) => {
                const saved = await auth.request<{ options: PollOption[] }>(`/events/${details.id}/poll`, { method: 'PUT', body: JSON.stringify({ options: chosen }) });
                poll.mutate(() => saved);
                setPlanning(false);
              }}
              options={options}
            />
          ) : options.length > 0 ? (
            <>
              <PollOptions busy={voting.busy} onPick={editable ? setPicking : undefined} onVote={vote} options={options} />
              {editable && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button label="Change dates" onClick={() => setPlanning(true)} />
                  <TextButton disabled={voting.busy} label="Close the poll" onClick={() => setClosingPoll(true)} />
                </div>
              )}
            </>
          ) : (
            <Button label="Offer dates" onClick={() => setPlanning(true)} />
          )}
        </Section>
      )}

      <ItemBoards editable={editable} itemId={details.id} key={`boards-${details.id}`} spaceId={details.spaceId} title={details.title} />

      <Section description={`${details.headcount.yes} coming · ${details.headcount.maybe} maybe · ${details.headcount.no} not coming · ${details.headcount.pending} waiting`} title="Guests">
        {details.guests.length === 0 ? (
          <Hint>No guests yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {details.guests.map((guest) => (
              <ListRow
                key={guest.id}
                meta={guest.note ? `${responseLabels[guest.response]} · “${guest.note}”` : responseLabels[guest.response]}
                title={guest.name}
                trail={editable && <ActionsMenu items={[{ label: 'Remove', separated: true, onSelect: () => setRemoving(guest) }]} name={guest.name} />}
              />
            ))}
          </ul>
        )}
      </Section>

      {editable && (
        <Section title="Invite a guest">
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(submitted) => {
              submitted.preventDefault();
              const target = submitted.currentTarget;
              if (!form.check(target, { name: [required('Enter the guest’s name.')], email: [emailAddress] })) return;
              const values = new FormData(target);
              const name = String(values.get('name')).trim();
              const email = String(values.get('email')).trim();
              void inviting
                .run(async () => {
                  const invited = await auth.request<{ link: string; emailed: boolean }>(`/events/${details.id}/guests`, {
                    method: 'POST',
                    body: JSON.stringify({ name, ...(email ? { email } : {}) }),
                  });
                  setPersonalLink(invited.link);
                  event.reload();
                  return invited.emailed ? `Invited ${name} by email.` : `Invited ${name}. Send them their personal link.`;
                }, 'Could not invite the guest')
                .then((done) => done && target.reset());
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Name" maxLength={80} {...form.field('name')} />
              <TextField inputMode="email" label="Email (optional)" type="email" {...form.field('email')} />
            </div>
            {personalLink && <Copyable value={personalLink} />}
            <Button disabled={inviting.busy} label="Invite" primary submit />
          </form>
        </Section>
      )}

      {editable && (
        <Section description="Anyone with this link can answer with their name for 60 days. They see only this event." title="Open invitation link">
          {openLink ? (
            <Copyable value={openLink} />
          ) : (
            <Button
              disabled={sharing.busy}
              label="Create link"
              onClick={() =>
                void sharing.run(async () => {
                  const created = await auth.request<{ link: string }>(`/items/${details.id}/share-links`, {
                    method: 'POST',
                    body: JSON.stringify({ access: 'view', expiresInDays: 60 }),
                  });
                  setOpenLink(created.link);
                  return 'Created an invitation link.';
                }, 'Could not create the link')
              }
            />
          )}
        </Section>
      )}

      {picking && (
        <ConfirmDialog
          busyLabel="Moving…"
          confirmLabel="Use this date"
          errorFallback="Could not move the event"
          onClose={() => setPicking(undefined)}
          onConfirm={async () => {
            const saved = await auth.request<EventDetails>(`/events/${details.id}/poll/pick`, { method: 'POST', body: JSON.stringify({ optionId: picking.id }) });
            event.mutate(() => saved);
            poll.mutate(() => ({ options: [] }));
            action.report(`Moved ${details.title} to ${optionLabel(picking)}.`);
          }}
          title={`Move the event to ${optionLabel(picking)}?`}
        >
          The poll closes and the other dates are dropped.
        </ConfirmDialog>
      )}
      {closingPoll && (
        <ConfirmDialog
          busyLabel="Closing…"
          confirmLabel="Close the poll"
          errorFallback="Could not close the poll"
          onClose={() => setClosingPoll(false)}
          onConfirm={async () => {
            await auth.request(`/events/${details.id}/poll`, { method: 'DELETE' });
            poll.mutate(() => ({ options: [] }));
            action.report('Closed the poll.');
          }}
          title="Close the poll?"
          tone="danger"
        >
          The dates on offer and every vote are deleted, and the event keeps its current date.
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          busyLabel="Removing…"
          confirmLabel="Remove guest"
          errorFallback="Could not remove the guest"
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await auth.request(`/events/${details.id}/guests/${removing.id}`, { method: 'DELETE' });
            event.reload();
            action.report(`Removed ${removing.name}.`);
          }}
          title={`Remove ${removing.name}?`}
          tone="danger"
        >
          Their invitation link stops working and their answer is lost.
        </ConfirmDialog>
      )}
      {editing && <EventEditor event={details} onClose={() => setEditing(false)} onSaved={(saved) => event.mutate(() => saved)} />}
    </Page>
  );
}
