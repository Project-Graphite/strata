import { useState } from 'react';
import { Dialog, ListRow, Placeholder, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { noteChecks, type ReceivedInvitation, type SentInvitation } from '../invitations';
import { addJoinedSpace, SpaceMark, spacesTabs, useAllSpaces } from '../spaces';
import { capitalised, formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { emailAddress, useFormErrors } from '../validation';
import { ActionsMenu } from '../components/ActionsMenu';
import { AddButton, Button } from '../components/Button';
import { Copyable } from '../components/Copyable';
import { DialogActions } from '../components/DialogActions';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { ButtonSkeleton, IconButtonSkeleton, RowsSkeleton, SkeletonLine, SpaceMarkSkeleton, useRememberedShape } from '../components/Skeletons';
import { NewSpace } from './spaces/SpacesPage';

const statusLabels: Record<SentInvitation['status'], string> = {
  pending: 'waiting',
  used: 'joined',
  expired: 'expired',
  withdrawn: 'withdrawn',
};

const emptyReceived = { title: 'No invitations for you', hint: 'When someone invites you to a space, you can accept it here.' };
const emptySent = { title: 'No invitations sent yet', hint: 'Invite someone to Strata by email or with a link you send yourself.' };

export function InvitationsPage() {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const received = useResource<ReceivedInvitation[]>('/me/invitations', true);
  const sent = useResource<SentInvitation[]>('/invitations', true);
  const answering = useAction();
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [receivedRows, notedRows] = useRememberedShape(
    'invitations-received',
    received.data && [received.data.length, received.data.filter((invitation) => invitation.note).length],
    [0, 0],
  );
  const [sentRows] = useRememberedShape('invitations-sent', sent.data && [sent.data.length], [0]);

  function answer(invitation: ReceivedInvitation, accept: boolean) {
    void answering.run(async () => {
      await auth.request(`/invitations/${invitation.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
      if (accept) await addJoinedSpace(auth.request, spaces, invitation.space.id);
      received.mutate((current) => current.filter((shown) => shown.id !== invitation.id));
      return accept ? `You joined ${invitation.space.name}.` : `Declined the invite to ${invitation.space.name}.`;
    }, 'Could not answer that invite');
  }

  return (
    <Page actions={<NewSpace />} tabs={spacesTabs('invitations')} title="Spaces">
      <Section title="For you">
        {received.error ? (
          <LoadError compact error={received.error} onRetry={received.reload} />
        ) : !received.data ? (
          <Placeholder label="Loading your invitations">
            {receivedRows ? (
              <RowsSkeleton
                below={<SkeletonLine className="text-small" width="w-3/5" />}
                belowRows={notedRows}
                lead={<SpaceMarkSkeleton />}
                rows={receivedRows}
                trail={
                  <>
                    <ButtonSkeleton width="w-20" />
                    <IconButtonSkeleton />
                  </>
                }
              />
            ) : (
              <Empty loading title={emptyReceived.title}>
                {emptyReceived.hint}
              </Empty>
            )}
          </Placeholder>
        ) : received.data.length === 0 ? (
          <Empty title={emptyReceived.title}>{emptyReceived.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {received.data.map((invitation) => (
              <ListRow
                key={invitation.id}
                lead={<SpaceMark space={invitation.space} />}
                meta={capitalised(`${invitation.inviter ? `from ${invitation.inviter.displayName} · ` : ''}as ${invitation.role}`)}
                title={invitation.space.name}
                trail={
                  <>
                    <Button disabled={answering.busy} label="Accept" onClick={() => answer(invitation, true)} />
                    <ActionsMenu items={[{ label: 'Decline', onSelect: () => answer(invitation, false) }]} name={invitation.space.name} />
                  </>
                }
              >
                {invitation.note && <span className="text-small text-muted">“{invitation.note}”</span>}
              </ListRow>
            ))}
          </ul>
        )}
      </Section>

      <Section action={<AddButton label="New invitation" onClick={() => setCreating(true)} />} title="Sent">
        {sent.error ? (
          <LoadError compact error={sent.error} onRetry={sent.reload} />
        ) : !sent.data ? (
          <Placeholder label="Loading the invites you sent">
            {sentRows ? (
              <RowsSkeleton rows={sentRows} />
            ) : (
              <Empty loading title={emptySent.title}>
                {emptySent.hint}
              </Empty>
            )}
          </Placeholder>
        ) : sent.data.length === 0 ? (
          <Empty title={emptySent.title}>{emptySent.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {sent.data.map((invitation) => (
              <ListRow
                key={invitation.id}
                meta={`${capitalised(statusLabels[invitation.status])}${invitation.joined.map((person) => ` · ${person.displayName} (@${person.handle})`).join('')} · created ${formatMoment(invitation.createdAt)}`}
                title={invitation.email ?? 'Invite link'}
              />
            ))}
          </ul>
        )}
      </Section>

      {creating && (
        <InviteDialog
          onClose={() => setCreating(false)}
          onCreated={(invitation, created) => {
            sent.mutate((current) => [invitation, ...current]);
            setCreating(false);
            if (created) setLink(created);
          }}
        />
      )}

      {link && (
        <Dialog onClose={() => setLink('')} title="Invite link ready">
          <div className="mt-4 grid gap-4">
            <Hint>Send this link to the person you’re inviting. It works once, for 14 days.</Hint>
            <Copyable value={link} />
            <DialogActions>
              <Button label="Done" large onClick={() => setLink('')} primary />
            </DialogActions>
          </div>
        </Dialog>
      )}
    </Page>
  );
}

function InviteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (invitation: SentInvitation, link: string | null) => void }) {
  const auth = useAuth();
  const inviting = useAction();
  const form = useFormErrors();

  return (
    <FormDialog
      busy={inviting.busy}
      busyLabel="Creating…"
      onClose={onClose}
      onSubmit={(target) => {
        const values = new FormData(target);
        const email = String(values.get('email')).trim();
        if (!form.check(target, { ...(email ? { email: [emailAddress] } : {}), note: noteChecks })) return;
        const note = String(values.get('note')).trim();
        void inviting.run(async () => {
          const created = await auth.request<{ invitation: SentInvitation; link: string; emailed: boolean }>('/invitations', {
            method: 'POST',
            body: JSON.stringify({ ...(email ? { email } : {}), ...(note ? { note } : {}) }),
          });
          onCreated(created.invitation, created.emailed ? null : created.link);
          return created.emailed ? `Invite sent to ${email}.` : email ? 'Email isn’t set up here, so send them the link yourself.' : '';
        }, 'Could not create the invitation');
      }}
      submitLabel="Create invitation"
      title="New invitation"
    >
      <TextField
        autoComplete="off"
        autoFocus
        hint="Leave it empty to get a link you can send yourself."
        inputMode="email"
        label="Email (optional)"
        type="email"
        {...form.field('email')}
      />
      <TextAreaField label="Note (optional)" maxLength={280} rows={2} {...form.field('note')} />
    </FormDialog>
  );
}
