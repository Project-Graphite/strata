import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { EmptyState, FormPanelSkeleton, LinesSkeleton, TextAreaField, TextField } from '@project-graphite/ui';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { eventWhen, type Guest, type PublicEvent } from '../agenda';
import { apiRequest } from '../api';
import { BoardDrawing } from '../components/BoardPreview';
import { PollOptions, type PollAnswer, type PollOption } from '../components/DatePoll';
import { FileSourceContext, sharedFiles } from '../components/file-source';
import { noteChecks } from '../invitations';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors } from '../validation';

const SharedDocument = lazy(() => import('../components/SharedDocument'));

type SharedContent = { kind: 'note'; state: string | null } | { kind: 'board'; elements: ExcalidrawElement[] } | null;

function EventSummary({ event, undecided }: { event: PublicEvent; undecided: boolean }) {
  return (
    <>
      <h1 className="page-heading">{event.title}</h1>
      <p className="mt-4 mb-0 text-muted">{undecided ? 'Date to be decided' : eventWhen(event)}</p>
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

function ResponseFields({ current, missing, onChoose }: { current?: Guest['response']; missing: boolean; onChoose: () => void }) {
  return (
    <fieldset aria-invalid={missing || undefined} className="m-0 flex flex-wrap gap-4 border-0 p-0">
      <legend className="field-label mb-2">Can you come?</legend>
      {(['yes', 'maybe', 'no'] as const).map((response) => (
        <label className="flex items-center gap-2 text-ink" key={response}>
          <input defaultChecked={current === response} name="response" onChange={onChoose} required type="radio" value={response} />
          {response === 'yes' ? 'Yes' : response === 'no' ? 'No' : 'Maybe'}
        </label>
      ))}
      {missing && (
        <p className="error-message m-0 w-full" role="alert">
          Choose yes, maybe or no.
        </p>
      )}
    </fieldset>
  );
}

export function RsvpPage() {
  const { code = '' } = useParams();
  const invitation = useResource<{ event: PublicEvent; guest: { name: string; response: Guest['response']; note: string | null } }>(
    `/rsvp/${encodeURIComponent(code)}`,
  );
  const poll = useResource<{ options: PollOption[] }>(`/rsvp/${encodeURIComponent(code)}/poll`);
  const answering = useAction();
  const voting = useAction();
  const form = useFormErrors();
  const [unanswered, setUnanswered] = useState(false);

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
      <EventSummary event={event} undecided={Boolean(poll.data?.options.length)} />
      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={(submitted) => {
          submitted.preventDefault();
          const target = submitted.currentTarget;
          const values = new FormData(target);
          setUnanswered(!values.get('response'));
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
        {poll.data && poll.data.options.length > 0 && (
          <div className="grid gap-2">
            <p className="field-label m-0">The date isn’t fixed yet. Which of these work for you?</p>
            <PollOptions
              busy={voting.busy}
              onVote={(optionId: string, answer: PollAnswer) =>
                void voting.run(async () => {
                  const saved = await apiRequest<{ options: PollOption[] }>(`/rsvp/${encodeURIComponent(code)}/poll`, {
                    method: 'PUT',
                    body: JSON.stringify({ votes: { [optionId]: answer } }),
                  });
                  poll.mutate(() => saved!);
                  return '';
                }, 'Could not save your answer')
              }
              options={poll.data.options}
            />
          </div>
        )}
        <ResponseFields current={guest.response} missing={unanswered} onChoose={() => setUnanswered(false)} />
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
  const files = useMemo(() => sharedFiles(code), [code]);
  const navigate = useNavigate();
  const shared = useResource<{ access: string; item: { kind: string; title: string }; event: PublicEvent | null; datePoll: boolean; content: SharedContent }>(
    `/share/${encodeURIComponent(code)}`,
  );
  const answering = useAction();
  const form = useFormErrors();
  const [unanswered, setUnanswered] = useState(false);

  if (shared.loading) return <FormPanelSkeleton label="Loading" />;
  if (!shared.data) {
    return (
      <EmptyState title="This link has expired or was turned off">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">Ask the person who shared it for a new link.</p>
      </EmptyState>
    );
  }
  if (!shared.data.event) {
    const { content, item } = shared.data;
    return (
      <section className={`page-enter mx-auto grid w-full gap-6 ${content?.kind === 'board' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div>
          <p className="m-0 text-sm text-faint">Shared {item.kind === 'note' ? 'page' : item.kind}</p>
          <h1 className="page-heading">{item.title || 'Untitled'}</h1>
        </div>
        {content?.kind === 'note' && (
          <Suspense fallback={<LinesSkeleton label="Loading the page" lines={6} />}>
            <SharedDocument code={code} state={content.state} />
          </Suspense>
        )}
        {content?.kind === 'board' && (
          <FileSourceContext.Provider value={files}>
            <BoardDrawing elements={content.elements} label={`Drawing of ${item.title || 'the board'}`} />
          </FileSourceContext.Provider>
        )}
      </section>
    );
  }

  return (
    <section className="form-panel page-enter">
      <EventSummary event={shared.data.event} undecided={shared.data.datePoll} />
      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={(submitted) => {
          submitted.preventDefault();
          const target = submitted.currentTarget;
          const values = new FormData(target);
          setUnanswered(!values.get('response'));
          if (!form.check(target, { name: [required('Enter your name.')], note: noteChecks }) || !values.get('response')) return;
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
        {shared.data.datePoll && <p className="m-0 text-sm text-muted">The date isn’t fixed yet. Answer here, then say which of the suggested dates work.</p>}
        <TextField label="Your name" maxLength={80} {...form.field('name')} />
        <ResponseFields missing={unanswered} onChoose={() => setUnanswered(false)} />
        <TextAreaField label="Note for the host (optional)" maxLength={280} rows={2} {...form.field('note')} />
        <button className="primary-button" disabled={answering.busy} type="submit">
          {answering.busy ? 'Saving…' : 'Send answer'}
        </button>
      </form>
    </section>
  );
}
