import { useState } from 'react';
import { ConfirmDialog, ListRow, Placeholder, Select, TextAreaField, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { noteChecks, type SentInvitation } from '../../invitations';
import { roleOptions, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { ActionsMenu } from '../../components/ActionsMenu';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { IconButtonSkeleton, RowsSkeleton, useRememberedShape } from '../../components/Skeletons';

const invitee = (invitation: SentInvitation) => (invitation.invitee ? `${invitation.invitee.displayName} (@${invitation.invitee.handle})` : (invitation.email ?? 'Invite link'));

export function SpaceInvitations({ space }: { space: Space }) {
  const auth = useAuth();
  const pending = useResource<SentInvitation[]>(`/spaces/${space.id}/invitations`, true);
  const { report } = useAction();
  const [withdrawing, setWithdrawing] = useState<SentInvitation>();
  const [rows] = useRememberedShape(`space-invitations-${space.id}`, pending.data && [pending.data.length], [0]);

  if (!pending.error && !pending.data && rows) {
    return (
      <Placeholder label="Loading the invites waiting for an answer">
        <Section title="Waiting for an answer">
          <RowsSkeleton rows={rows} trail={<IconButtonSkeleton />} />
        </Section>
      </Placeholder>
    );
  }
  if (!pending.error && !pending.data?.length) return null;

  return (
    <Section title="Waiting for an answer">
      {!pending.data ? (
        <LoadError compact error={pending.error} onRetry={pending.reload} />
      ) : (
        <ul className="panel-rows">
          {pending.data.map((invitation) => (
            <ListRow
              key={invitation.id}
              meta={<>as {invitation.role === 'viewer' ? 'a' : 'an'} {roleOptions.find((option) => option.value === invitation.role)?.label.toLowerCase()} · sent {timeAgo(invitation.createdAt)}</>}
              title={invitee(invitation)}
              trail={<ActionsMenu items={[{ label: 'Withdraw', onSelect: () => setWithdrawing(invitation) }]} name={invitee(invitation)} />}
            />
          ))}
        </ul>
      )}

      {withdrawing && (
        <ConfirmDialog
          busyLabel="Withdrawing…"
          confirmLabel="Withdraw invite"
          errorFallback="Could not withdraw the invite"
          onClose={() => setWithdrawing(undefined)}
          onConfirm={async () => {
            await auth.request(`/invitations/${withdrawing.id}`, { method: 'DELETE' });
            pending.mutate((current) => current.filter((shown) => shown.id !== withdrawing.id));
            report(`Withdrew the invite to ${invitee(withdrawing)}.`);
          }}
          title={`Withdraw the invite to ${invitee(withdrawing)}?`}
          tone="danger"
        >
          The invite stops working straight away.
        </ConfirmDialog>
      )}
    </Section>
  );
}

export function InviteToSpaceDialog({ onClose, onInvited, space }: { onClose: () => void; onInvited: () => void; space: Space }) {
  const auth = useAuth();
  const inviting = useAction();
  const form = useFormErrors();

  return (
    <FormDialog
      busy={inviting.busy}
      busyLabel="Sending…"
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
          return created.emailed ? `Invited ${who}.` : `Invited ${who}, but the email couldn’t be sent.`;
        }, 'Could not send the invite');
      }}
      submitLabel="Send invite"
      title="Invite people"
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
