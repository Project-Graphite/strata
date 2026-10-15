import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ConfirmDialog, PageSkeleton, TextField } from '@project-graphite/ui';
import { eventWhen, type EventDetails, type Guest } from '../agenda';
import { useAuth } from '../auth';
import { Button, IconButton } from '../components/Button';
import { optionLabel, PollEditor, PollOptions, type PollAnswer, type PollOption } from '../components/DatePoll';
import { CopyLink } from '../components/CopyLink';
import { EventEditor } from '../components/EventEditor';
import { Hint } from '../components/Hint';
import { ItemBoards } from '../components/ItemBoards';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { emailAddress, required, useFormErrors } from '../validation';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { NotFoundState } from '../components/Empty';

const responseLabels: Record<Guest['response'], string> = { yes: 'coming', no: 'not coming', maybe: 'maybe', pending: 'no answer yet' };

export function EventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const spaces = useSpaces();
  const event = useResource<EventDetails>(`/events/${id}`, true);
  const poll = useResource<{ options: PollOption[] }>(`/events/${id}/poll`, true);
  const inviting = useAction();
  const sharing = useAction();
  const removing = useAction();
  const voting = useAction();
  const [planning, setPlanning] = useState(false);
  const [picking, setPicking] = useState<PollOption>();
  const form = useFormErrors();
  const [editing, setEditing] = useState(false);
  const [personalLink, setPersonalLink] = useState('');
  const [openLink, setOpenLink] = useState('');

  if (event.status === 404) {
    return (
      <NotFoundState thing="Event" />
    );
  }
  if (event.error) return <LoadError error={event.error} onRetry={event.reload} />;
  if (!event.data) return <PageSkeleton label="Loading the event" />;
  const details = event.data;
  const space = spaces.data?.find((candidate) => candidate.id === details.spaceId);
  const editable = space ? space.role !== 'viewer' : false;
  const options = poll.data?.options ?? [];

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
          <IconButton icon="pencil" label="Edit" onClick={() => setEditing(true)} />
        )
      }
      description={
        <>
          <p className="m-0">{eventWhen(details)}</p>
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
                Join the meeting
              </a>
            </p>
          )}
        </>
      }
      eyebrow={space?.name}
      title={details.title}
    >
      {details.description && <p className="m-0 whitespace-pre-wrap text-ink">{details.description}</p>}

      {poll.data && (options.length > 0 || (editable && !details.repeatRule)) && (
        <section className="grid gap-3">
          <h2 className="m-0 text-xl font-medium">Date poll</h2>
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
                <div className="flex flex-wrap gap-2">
                  <Button label="Change dates" onClick={() => setPlanning(true)} />
                  <button
                    className="text-button text-sm"
                    disabled={voting.busy}
                    onClick={() =>
                      void voting.run(async () => {
                        await auth.request(`/events/${details.id}/poll`, { method: 'DELETE' });
                        poll.mutate(() => ({ options: [] }));
                        return 'The poll is closed.';
                      }, 'Could not close the poll')
                    }
                    type="button"
                  >
                    Close the poll
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <Button label="Offer dates" onClick={() => setPlanning(true)} />
            </>
          )}
        </section>
      )}

      <ItemBoards editable={editable} itemId={details.id} key={`boards-${details.id}`} spaceId={details.spaceId} title={details.title} />

      <section>
        <h2 className="m-0 text-xl font-medium">Guests</h2>
        <p className="mono-sm mt-2 mb-0 text-faint">
          {details.headcount.yes} coming · {details.headcount.maybe} maybe · {details.headcount.no} not coming · {details.headcount.pending} waiting
        </p>
        {details.guests.length > 0 && (
          <ul className="mt-3 grid list-none gap-0 p-0">
            {details.guests.map((guest) => (
              <li className="flex items-center justify-between gap-4 border-b border-line-soft py-3" key={guest.id}>
                <div className="min-w-0">
                  <p className="m-0 truncate text-ink">
                    {guest.name} <span className="mono-sm text-faint">· {responseLabels[guest.response]}</span>
                  </p>
                  {guest.note && <p className="mt-1 mb-0 text-sm text-muted">“{guest.note}”</p>}
                </div>
                {editable && (
                  <Button
                    disabled={removing.busy}
                    label="Remove"
                    onClick={() =>
                      void removing.run(async () => {
                        await auth.request(`/events/${details.id}/guests/${guest.id}`, { method: 'DELETE' });
                        event.reload();
                        return `${guest.name} was removed.`;
                      }, 'Could not remove the guest')
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editable && (
        <section className="grid gap-6">
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(submitted) => {
              submitted.preventDefault();
              const target = submitted.currentTarget;
              if (!form.check(target, { name: [required('Enter the guest’s name.')], email: [emailAddress] })) return;
              const values = new FormData(target);
              const email = String(values.get('email')).trim();
              void inviting
                .run(async () => {
                  const invited = await auth.request<{ link: string; emailed: boolean }>(`/events/${details.id}/guests`, {
                    method: 'POST',
                    body: JSON.stringify({ name: String(values.get('name')).trim(), ...(email ? { email } : {}) }),
                  });
                  setPersonalLink(invited.link);
                  event.reload();
                  return invited.emailed ? `Invitation sent to ${email}.` : 'Send them this personal link.';
                }, 'Could not invite the guest')
                .then((done) => done && target.reset());
            }}
          >
            <h3 className="m-0 text-base font-medium">Invite a guest</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Name" maxLength={80} {...form.field('name')} />
              <TextField inputMode="email" label="Email (optional)" type="email" {...form.field('email')} />
            </div>
            {personalLink && <CopyLink link={personalLink} />}
            <Button disabled={inviting.busy} label="Invite" primary submit />
          </form>
          <div className="grid gap-3">
            <h3 className="m-0 text-base font-medium">Open invitation link</h3>
            <Hint>Anyone with this link can answer with their name for 60 days. They see only this event.</Hint>
            {openLink ? (
              <CopyLink link={openLink} />
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
                    return '';
                  }, 'Could not create the link')
                }
              />
            )}
          </div>
        </section>
      )}

      {picking && (
        <ConfirmDialog
          confirmLabel="Use this date"
          errorFallback="Could not move the event"
          onClose={() => setPicking(undefined)}
          onConfirm={async () => {
            const saved = await auth.request<EventDetails>(`/events/${details.id}/poll/pick`, { method: 'POST', body: JSON.stringify({ optionId: picking.id }) });
            event.mutate(() => saved);
            poll.mutate(() => ({ options: [] }));
            setPicking(undefined);
          }}
          title={`Move the event to ${optionLabel(picking)}?`}
        >
          <Hint>The poll closes and the other dates are dropped.</Hint>
        </ConfirmDialog>
      )}
      {editing && (
        <EventEditor event={details} onClose={() => setEditing(false)} onSaved={(saved) => event.mutate(() => saved)} onTrashed={() => navigate('/agenda')} />
      )}
    </Page>
  );
}
