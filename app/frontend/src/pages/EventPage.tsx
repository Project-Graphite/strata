import { useState } from 'react';
import { useParams } from 'react-router';
import { EmptyState, Icon, PageHeader, PageSkeleton, TextField } from '@project-graphite/ui';
import { eventWhen, type EventDetails, type Guest } from '../agenda';
import { useAuth } from '../auth';
import { EventEditor } from '../components/EventEditor';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { emailAddress, required, useFormErrors } from '../validation';
import { LoadError } from '../components/LoadError';

const responseLabels: Record<Guest['response'], string> = { yes: 'coming', no: 'not coming', maybe: 'maybe', pending: 'no answer yet' };

function CopyLink({ link }: { link: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="mono-sm break-all text-ink">{link}</code>
      <button className="secondary-button px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(link)} type="button">
        Copy link
      </button>
    </div>
  );
}

export function EventPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const spaces = useSpaces();
  const event = useResource<EventDetails>(`/events/${id}`, true);
  const inviting = useAction();
  const sharing = useAction();
  const removing = useAction();
  const form = useFormErrors();
  const [editing, setEditing] = useState(false);
  const [personalLink, setPersonalLink] = useState('');
  const [openLink, setOpenLink] = useState('');

  if (event.status === 404) {
    return (
      <EmptyState title="Event not found">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">It may have been deleted, or you are not a member of its space.</p>
      </EmptyState>
    );
  }
  if (event.error) return <LoadError error={event.error} onRetry={event.reload} />;
  if (!event.data) return <PageSkeleton label="Loading the event" />;
  const details = event.data;
  const space = spaces.data?.find((candidate) => candidate.id === details.spaceId);
  const editable = space ? space.role !== 'viewer' : false;

  return (
    <section className="page-enter grid max-w-3xl gap-10">
      <PageHeader
        actions={
          editable && (
            <button className="secondary-button px-3 py-2 text-sm" onClick={() => setEditing(true)} type="button">
              <Icon name="pencil" size={16} />
              Edit
            </button>
          )
        }
        eyebrow={space?.name}
        title={details.title}
      >
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
      </PageHeader>
      {details.description && <p className="m-0 whitespace-pre-wrap text-ink">{details.description}</p>}

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
                  <button
                    className="secondary-button shrink-0 px-3 py-2 text-sm"
                    disabled={removing.busy}
                    onClick={() =>
                      void removing.run(async () => {
                        await auth.request(`/events/${details.id}/guests/${guest.id}`, { method: 'DELETE' });
                        event.reload();
                        return `${guest.name} was removed.`;
                      }, 'Could not remove the guest')
                    }
                    type="button"
                  >
                    Remove
                  </button>
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
            <button className="primary-button inline-flex w-fit" disabled={inviting.busy} type="submit">
              Invite
            </button>
          </form>
          <div className="grid gap-3">
            <h3 className="m-0 text-base font-medium">Open invitation link</h3>
            <p className="m-0 text-sm text-muted">Anyone with this link can answer with their name for 60 days. They see only this event.</p>
            {openLink ? (
              <CopyLink link={openLink} />
            ) : (
              <button
                className="secondary-button inline-flex w-fit px-3 py-2 text-sm"
                disabled={sharing.busy}
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
                type="button"
              >
                Create link
              </button>
            )}
          </div>
        </section>
      )}

      {editing && <EventEditor event={details} onClose={() => setEditing(false)} onSaved={(saved) => event.mutate(() => saved)} />}
    </section>
  );
}
