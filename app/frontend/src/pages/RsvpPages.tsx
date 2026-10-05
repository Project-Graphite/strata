import { useNavigate, useParams } from 'react-router';
import { EmptyState, FormPanelSkeleton, TextAreaField, TextField } from '@project-graphite/ui';
import { eventWhen, type Guest, type PublicEvent } from '../agenda';
import { apiRequest } from '../api';
import { noteChecks } from '../invitations';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors } from '../validation';

function EventSummary({ event }: { event: PublicEvent }) {
  return (
    <>
      <h1 className="page-heading">{event.title}</h1>
      <p className="mt-4 mb-0 text-muted">{eventWhen(event)}</p>
      {event.location && <p className="mt-1 mb-0 text-muted">{event.location}</p>}
      {event.meetingUrl && (
        <p className="mt-1 mb-0">
          <a href={event.meetingUrl} rel="noopener noreferrer" target="_blank">
            Meeting link
          </a>
        </p>
      )}
      {event.description && <p className="mt-4 mb-0 whitespace-pre-wrap text-ink">{event.description}</p>}
    </>
  );
}

function ResponseFields({ current }: { current?: Guest['response'] }) {
  return (
    <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
      <legend className="field-label mb-2">Can you come?</legend>
      {(['yes', 'maybe', 'no'] as const).map((response) => (
        <label className="flex items-center gap-2 text-ink" key={response}>
          <input defaultChecked={current === response} name="response" required type="radio" value={response} />
          {response === 'yes' ? 'Yes' : response === 'no' ? 'No' : 'Maybe'}
        </label>
      ))}
    </fieldset>
  );
}

export function RsvpPage() {
  const { code = '' } = useParams();
  const invitation = useResource<{ event: PublicEvent; guest: { name: string; response: Guest['response']; note: string | null } }>(
    `/rsvp/${encodeURIComponent(code)}`,
  );
  const answering = useAction();
  const form = useFormErrors();

  if (invitation.loading) return <FormPanelSkeleton label="Loading your invitation" />;
  if (!invitation.data) {
    return (
      <EmptyState title="This invitation is no longer open">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">Ask the person who invited you for a new link.</p>
      </EmptyState>
    );
  }
  const { event, guest } = invitation.data;

  return (
    <section className="form-panel page-enter">
      <EventSummary event={event} />
      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={(submitted) => {
          submitted.preventDefault();
          const target = submitted.currentTarget;
          const values = new FormData(target);
          if (!values.get('response') || !form.check(target, { note: noteChecks })) return;
          const note = String(values.get('note')).trim();
          void answering.run(async () => {
            const saved = await apiRequest<typeof invitation.data>(`/rsvp/${encodeURIComponent(code)}`, {
              method: 'POST',
              body: JSON.stringify({ response: values.get('response'), ...(note ? { note } : {}) }),
            });
            invitation.mutate(() => saved!);
            return 'Thanks, your answer is saved. You can change it here any time.';
          }, 'Could not save your answer');
        }}
      >
        <p className="m-0 text-ink">Hi {guest.name}.</p>
        <ResponseFields current={guest.response} />
        <TextAreaField defaultValue={guest.note ?? ''} label="Note for the host (optional)" maxLength={280} rows={2} {...form.field('note')} />
        <button className="primary-button" disabled={answering.busy} type="submit">
          {answering.busy ? 'Saving…' : 'Send answer'}
        </button>
      </form>
    </section>
  );
}

export function SharePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const shared = useResource<{ access: string; item: { kind: string; title: string }; event: PublicEvent | null }>(
    `/share/${encodeURIComponent(code)}`,
  );
  const answering = useAction();
  const form = useFormErrors();

  if (shared.loading) return <FormPanelSkeleton label="Loading" />;
  if (!shared.data) {
    return (
      <EmptyState title="This link has expired or was turned off">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">Ask the person who shared it for a new link.</p>
      </EmptyState>
    );
  }
  if (!shared.data.event) {
    return (
      <section className="form-panel page-enter">
        <p className="m-0 text-sm text-faint">Shared {shared.data.item.kind}</p>
        <h1 className="page-heading">{shared.data.item.title || 'Untitled'}</h1>
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <EventSummary event={shared.data.event} />
      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={(submitted) => {
          submitted.preventDefault();
          const target = submitted.currentTarget;
          const values = new FormData(target);
          if (!values.get('response') || !form.check(target, { name: [required('Enter your name.')], note: noteChecks })) return;
          const note = String(values.get('note')).trim();
          void answering.run(async () => {
            const { link } = await apiRequest<{ link: string }>(`/share/${encodeURIComponent(code)}/rsvp`, {
              method: 'POST',
              body: JSON.stringify({ name: String(values.get('name')).trim(), response: values.get('response'), ...(note ? { note } : {}) }),
            });
            navigate(new URL(link).pathname);
            return '';
          }, 'Could not save your answer');
        }}
      >
        <TextField label="Your name" maxLength={80} {...form.field('name')} />
        <ResponseFields />
        <TextAreaField label="Note for the host (optional)" maxLength={280} rows={2} {...form.field('note')} />
        <button className="primary-button" disabled={answering.busy} type="submit">
          {answering.busy ? 'Saving…' : 'Send answer'}
        </button>
      </form>
    </section>
  );
}
