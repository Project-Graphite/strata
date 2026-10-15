import { Select, TextAreaField, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { noteChecks, type SentInvitation } from '../../invitations';
import { roleOptions, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { Button } from '../../components/Button';

export function SpaceInvitations({ inviting, onClose, space }: { inviting: boolean; onClose: () => void; space: Space }) {
  const auth = useAuth();
  const pending = useResource<SentInvitation[]>(`/spaces/${space.id}/invitations`, true);
  const withdrawing = useAction();

  return (
    <>
      {pending.error && <LoadError compact error={pending.error} onRetry={pending.reload} />}
      {pending.data && pending.data.length > 0 && (
        <Section title="Waiting for an answer">
          <ul className="panel-rows">
            {pending.data.map((invitation) => (
              <li className="panel-row flex items-center justify-between gap-4" key={invitation.id}>
                <div className="min-w-0">
                  <p className="m-0 truncate text-ink">
                    {invitation.invitee ? `${invitation.invitee.displayName} (@${invitation.invitee.handle})` : invitation.email}
                  </p>
                  <p className="m-0 mt-0.5 text-sm text-muted">
                    as {invitation.role} · sent {timeAgo(invitation.createdAt)}
                  </p>
                </div>
                <Button
                  disabled={withdrawing.busy}
                  label="Withdraw"
                  onClick={() =>
                    void withdrawing.run(async () => {
                      await auth.request(`/invitations/${invitation.id}`, { method: 'DELETE' });
                      pending.mutate((current) => current.filter((shown) => shown.id !== invitation.id));
                      return 'Invite withdrawn.';
                    }, 'Could not withdraw the invite')
                  }
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {inviting && (
        <InviteToSpaceDialog
          onClose={onClose}
          onInvited={() => {
            pending.reload();
            onClose();
          }}
          space={space}
        />
      )}
    </>
  );
}

function InviteToSpaceDialog({ onClose, onInvited, space }: { onClose: () => void; onInvited: () => void; space: Space }) {
  const auth = useAuth();
  const inviting = useAction();
  const form = useFormErrors();

  return (
    <FormDialog
      busy={inviting.busy}
      busyLabel="Inviting…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { who: [required('Enter an email address or a @handle.')], note: noteChecks })) return;
        const values = new FormData(target);
        const who = String(values.get('who')).trim();
        const note = String(values.get('note')).trim();
        void inviting.run(async () => {
          const created = await auth.request<{ invitation: SentInvitation; emailed: boolean }>(`/spaces/${space.id}/invitations`, {
            method: 'POST',
            body: JSON.stringify({
              ...(who.includes('@') && !who.startsWith('@') ? { email: who } : { handle: who }),
              role: values.get('role'),
              ...(note ? { note } : {}),
            }),
          });
          onInvited();
          return created.emailed ? `Invited ${who}.` : `Invited ${who}, but the email could not be sent.`;
        }, 'Could not send the invite');
      }}
      submitLabel="Send invite"
      title={`Invite people to ${space.name}`}
    >
      <TextField
        autoCapitalize="none"
        autoComplete="off"
        autoFocus
        hint="By @handle if they already use Strata. Each invite works once, for 14 days."
        label="Email or @handle"
        spellCheck={false}
        {...form.field('who')}
      />
      <Select defaultValue="editor" label="Role" name="role" options={roleOptions} />
      <TextAreaField label="Note (optional)" maxLength={280} rows={2} {...form.field('note')} />
    </FormDialog>
  );
}
