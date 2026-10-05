import { useState } from 'react';
import { ListSkeleton, PageHeader, TextAreaField, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { noteChecks, type ReceivedInvitation, type SentInvitation } from '../invitations';
import { addJoinedSpace, SpaceDot, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { emailAddress, useFormErrors } from '../validation';
import { LoadError } from '../components/LoadError';

const statusLabels: Record<SentInvitation['status'], string> = {
  pending: 'waiting',
  used: 'joined',
  expired: 'expired',
  withdrawn: 'withdrawn',
};

export function InvitationsPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const received = useResource<ReceivedInvitation[]>('/me/invitations', true);
  const sent = useResource<SentInvitation[]>('/invitations', true);
  const answering = useAction();
  const inviting = useAction();
  const inviteForm = useFormErrors();
  const [link, setLink] = useState('');

  function answer(invitation: ReceivedInvitation, accept: boolean) {
    void answering.run(async () => {
      await auth.request(`/invitations/${invitation.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
      if (accept) await addJoinedSpace(auth.request, spaces, invitation.space.id);
      received.mutate((current) => current.filter((shown) => shown.id !== invitation.id));
      return accept ? `You joined ${invitation.space.name}.` : 'Invite declined.';
    }, 'Could not answer that invite');
  }

  return (
    <section className="page-enter grid max-w-3xl gap-12">
      <PageHeader title="Invitations" />

      <section>
        <h2 className="m-0 text-xl font-medium">For you</h2>
        {received.error ? (
          <LoadError error={received.error} onRetry={received.reload} />
        ) : !received.data ? (
          <ListSkeleton label="Loading your invitations" rows={2} />
        ) : received.data.length === 0 ? (
          <p className="mt-2 mb-0 text-sm text-muted">No one has invited you to a space right now.</p>
        ) : (
          <ul className="mt-3 grid list-none gap-0 p-0">
            {received.data.map((invitation) => (
              <li className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft py-4" key={invitation.id}>
                <div className="min-w-0">
                  <p className="m-0 inline-flex items-center gap-2 text-ink">
                    <SpaceDot color={invitation.space.color} />
                    {invitation.space.name}
                  </p>
                  <p className="mono-sm m-0 mt-1 text-faint">
                    {invitation.inviter ? `from ${invitation.inviter.displayName} · ` : ''}as {invitation.role}
                  </p>
                  {invitation.note && <p className="mt-2 mb-0 text-sm text-muted">“{invitation.note}”</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="primary-button px-3 py-2 text-sm"
                    disabled={answering.busy}
                    onClick={() => answer(invitation, true)}
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    className="secondary-button px-3 py-2 text-sm"
                    disabled={answering.busy}
                    onClick={() => answer(invitation, false)}
                    type="button"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="m-0 text-xl font-medium">Invite someone to Strata</h2>
        <p className="mt-2 mb-0 text-sm text-muted">
          Each invite works once, for 14 days. Leave the email empty to get a link to send yourself.
        </p>
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            if (!inviteForm.check(target, { email: [emailAddress], note: noteChecks })) return;
            const values = new FormData(target);
            const email = String(values.get('email')).trim();
            const note = String(values.get('note')).trim();
            void inviting
              .run(async () => {
                const created = await auth.request<{ invitation: SentInvitation; link: string; emailed: boolean }>(
                  '/invitations',
                  { method: 'POST', body: JSON.stringify({ ...(email ? { email } : {}), ...(note ? { note } : {}) }) },
                );
                setLink(created.link);
                sent.mutate((current) => [created.invitation, ...current]);
                return created.emailed ? `Sent to ${email}.` : 'Copy the link below and send it to them.';
              }, 'Could not create the invite')
              .then((created) => created && target.reset());
          }}
        >
          <TextField autoComplete="off" inputMode="email" label="Email (optional)" type="email" {...inviteForm.field('email')} />
          <TextAreaField label="Note (optional)" maxLength={280} rows={2} {...inviteForm.field('note')} />
          {link && (
            <div className="flex flex-wrap items-center gap-3">
              <code className="mono-sm break-all text-ink">{link}</code>
              <button
                className="secondary-button px-3 py-2 text-sm"
                onClick={() => void navigator.clipboard.writeText(link)}
                type="button"
              >
                Copy link
              </button>
            </div>
          )}
          <button className="primary-button inline-flex w-fit" disabled={inviting.busy} type="submit">
            {inviting.busy ? 'Creating…' : 'Create invite'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="m-0 text-xl font-medium">Sent</h2>
        {sent.error ? (
          <LoadError error={sent.error} onRetry={sent.reload} />
        ) : !sent.data ? (
          <ListSkeleton label="Loading the invites you sent" rows={2} />
        ) : sent.data.length === 0 ? (
          <p className="mt-2 mb-0 text-sm text-muted">You have not invited anyone yet.</p>
        ) : (
          <ul className="mt-3 grid list-none gap-0 p-0">
            {sent.data.map((invitation) => (
              <li className="border-b border-line-soft py-3" key={invitation.id}>
                <p className="m-0 text-ink">{invitation.email ?? 'Invite link'}</p>
                <p className="mono-sm m-0 mt-1 text-faint">
                  {statusLabels[invitation.status]}
                  {invitation.joined.map((person) => ` · ${person.displayName} (@${person.handle})`).join('')} · created{' '}
                  {timeAgo(invitation.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
