import { TextAreaField, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { noteChecks, type SentInvitation } from '../../invitations';
import type { Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { required, useFormErrors } from '../../validation';
import { LoadError } from '../../components/LoadError';

export function SpaceInvitations({ space }: { space: Space }) {
  const auth = useAuth();
  const pending = useResource<SentInvitation[]>(`/spaces/${space.id}/invitations`, true);
  const inviting = useAction();
  const withdrawing = useAction();
  const form = useFormErrors();

  return (
    <section className="grid gap-6">
      <div>
        <h2 className="m-0 text-xl font-medium">Invite people</h2>
        <p className="mt-2 mb-0 text-sm text-muted">
          By email, or by @handle if they already use Strata. Each invite works once, for 14 days.
        </p>
      </div>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (!form.check(target, { who: [required('Enter an email address or a @handle.')], note: noteChecks })) {
            return;
          }
          const values = new FormData(target);
          const who = String(values.get('who')).trim();
          const note = String(values.get('note')).trim();
          void inviting
            .run(async () => {
              const created = await auth.request<{ invitation: SentInvitation; emailed: boolean }>(
                `/spaces/${space.id}/invitations`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    ...(who.includes('@') && !who.startsWith('@') ? { email: who } : { handle: who }),
                    role: values.get('role'),
                    ...(note ? { note } : {}),
                  }),
                },
              );
              pending.reload();
              return created.emailed ? `Invited ${who}.` : `Invited ${who}, but the email could not be sent.`;
            }, 'Could not send the invite')
            .then((sent) => sent && target.reset());
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <TextField autoCapitalize="none" autoComplete="off" label="Email or @handle" spellCheck={false} {...form.field('who')} />
          <label className="field-label">
            Role
            <select defaultValue="editor" name="role">
              <option value="owner">owner</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
        </div>
        <TextAreaField label="Note (optional)" maxLength={280} rows={2} {...form.field('note')} />
        <button className="primary-button inline-flex w-fit" disabled={inviting.busy} type="submit">
          {inviting.busy ? 'Inviting…' : 'Send invite'}
        </button>
      </form>

      {pending.data && pending.data.length > 0 && (
        <div>
          <h3 className="m-0 text-base font-medium">Waiting for an answer</h3>
          <ul className="mt-2 grid list-none gap-0 p-0">
            {pending.data.map((invitation) => (
              <li className="flex items-center justify-between gap-4 border-b border-line-soft py-3" key={invitation.id}>
                <div className="min-w-0">
                  <p className="m-0 truncate text-ink">
                    {invitation.invitee ? `${invitation.invitee.displayName} (@${invitation.invitee.handle})` : invitation.email}
                  </p>
                  <p className="mono-sm m-0 mt-1 text-faint">
                    as {invitation.role} · sent {timeAgo(invitation.createdAt)}
                  </p>
                </div>
                <button
                  className="secondary-button shrink-0 px-3 py-2 text-sm"
                  disabled={withdrawing.busy}
                  onClick={() =>
                    void withdrawing.run(async () => {
                      await auth.request(`/invitations/${invitation.id}`, { method: 'DELETE' });
                      pending.mutate((current) => current.filter((shown) => shown.id !== invitation.id));
                      return 'Invite withdrawn.';
                    }, 'Could not withdraw the invite')
                  }
                  type="button"
                >
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pending.error && <LoadError compact error={pending.error} onRetry={pending.reload} />}
    </section>
  );
}
