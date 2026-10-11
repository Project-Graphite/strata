import { useState } from 'react';
import { Dialog, ListSkeleton, TextAreaField, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { noteChecks, type ReceivedInvitation, type SentInvitation } from '../invitations';
import { addJoinedSpace, SpaceMark, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { emailAddress, required, useFormErrors } from '../validation';
import { CopyLink } from '../components/CopyLink';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section } from '../components/Page';

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
  const [creating, setCreating] = useState<'email' | 'link' | null>(null);
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
    <Page
      actions={
        <>
          <HeaderButton icon="link" label="Create invite link" onClick={() => setCreating('link')} />
          <HeaderButton icon="mail" label="Invite by email" onClick={() => setCreating('email')} primary />
        </>
      }
      description="Invite someone to Strata. Each invite works once, for 14 days."
      title="Invitations"
    >
      <Section title="For you">
        {received.error ? (
          <LoadError error={received.error} onRetry={received.reload} />
        ) : !received.data ? (
          <ListSkeleton label="Loading your invitations" rows={2} />
        ) : received.data.length === 0 ? (
          <p className="m-0 text-sm text-muted">No one has invited you to a space right now.</p>
        ) : (
          <ul className="panel-rows">
            {received.data.map((invitation) => (
              <li className="panel-row flex flex-wrap items-center justify-between gap-4" key={invitation.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <SpaceMark space={invitation.space} />
                  <div className="min-w-0">
                    <p className="m-0 text-ink">{invitation.space.name}</p>
                    <p className="m-0 mt-0.5 text-sm text-muted">
                      {invitation.inviter ? `from ${invitation.inviter.displayName} · ` : ''}as {invitation.role}
                    </p>
                    {invitation.note && <p className="mt-2 mb-0 text-sm text-muted">“{invitation.note}”</p>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="secondary-button px-3 py-2 text-sm" disabled={answering.busy} onClick={() => answer(invitation, false)} type="button">
                    Decline
                  </button>
                  <button className="primary-button px-3 py-2 text-sm" disabled={answering.busy} onClick={() => answer(invitation, true)} type="button">
                    Accept
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sent">
        {sent.error ? (
          <LoadError error={sent.error} onRetry={sent.reload} />
        ) : !sent.data ? (
          <ListSkeleton label="Loading the invites you sent" rows={2} />
        ) : sent.data.length === 0 ? (
          <p className="m-0 text-sm text-muted">You have not invited anyone yet.</p>
        ) : (
          <ul className="panel-rows">
            {sent.data.map((invitation) => (
              <li className="panel-row" key={invitation.id}>
                <p className="m-0 text-ink">{invitation.email ?? 'Invite link'}</p>
                <p className="m-0 mt-0.5 text-sm text-muted">
                  {statusLabels[invitation.status]}
                  {invitation.joined.map((person) => ` · ${person.displayName} (@${person.handle})`).join('')} · created{' '}
                  {timeAgo(invitation.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {creating && (
        <InviteDialog
          mode={creating}
          onClose={() => setCreating(null)}
          onCreated={(invitation, created) => {
            sent.mutate((current) => [invitation, ...current]);
            setCreating(null);
            if (created) setLink(created);
          }}
        />
      )}

      {link && (
        <Dialog onClose={() => setLink('')} title="Invite link ready">
          <div className="mt-4 grid gap-4">
            <p className="m-0 text-sm text-muted">Send this link to the person you are inviting. It works once, for 14 days.</p>
            <CopyLink link={link} />
            <div className="flex justify-end">
              <button className="primary-button" onClick={() => setLink('')} type="button">
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </Page>
  );
}

function InviteDialog({
  mode,
  onClose,
  onCreated,
}: {
  mode: 'email' | 'link';
  onClose: () => void;
  onCreated: (invitation: SentInvitation, link: string | null) => void;
}) {
  const auth = useAuth();
  const inviting = useAction();
  const form = useFormErrors();

  return (
    <FormDialog
      busy={inviting.busy}
      busyLabel="Creating…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { ...(mode === 'email' ? { email: [required('Enter their email address.'), emailAddress] } : {}), note: noteChecks })) return;
        const values = new FormData(target);
        const email = mode === 'email' ? String(values.get('email')).trim() : '';
        const note = String(values.get('note')).trim();
        void inviting.run(async () => {
          const created = await auth.request<{ invitation: SentInvitation; link: string; emailed: boolean }>('/invitations', {
            method: 'POST',
            body: JSON.stringify({ ...(email ? { email } : {}), ...(note ? { note } : {}) }),
          });
          onCreated(created.invitation, created.emailed ? null : created.link);
          return created.emailed ? `Invite sent to ${email}.` : email ? 'Email is not set up here, so send them the link yourself.' : '';
        }, 'Could not create the invite');
      }}
      submitLabel={mode === 'email' ? 'Send invite' : 'Create link'}
      title={mode === 'email' ? 'Invite by email' : 'Create an invite link'}
    >
      {mode === 'email' && <TextField autoComplete="off" autoFocus inputMode="email" label="Email" type="email" {...form.field('email')} />}
      <TextAreaField hint="They see it when they open the invite." label="Note (optional)" maxLength={280} rows={2} {...form.field('note')} />
    </FormDialog>
  );
}
