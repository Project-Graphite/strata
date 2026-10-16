import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SecurityLog } from './SecurityLog';
import { Section } from '../../components/Page';
import { LoadError } from '../../components/LoadError';
import { Button } from '../../components/Button';
import { RowText } from '../../components/RowText';

interface Session {
  id: string;
  deviceLabel: string;
  signedInAt: string;
  lastUsedAt: string;
  current: boolean;
}

export function SessionsSection() {
  const auth = useAuth();
  const sessions = useResource<Session[]>('/me/sessions', true);
  const action = useAction();
  const [signingOut, setSigningOut] = useState(false);

  if (sessions.error) return <LoadError error={sessions.error} onRetry={sessions.reload} />;
  if (!sessions.data) return <ListSkeleton label="Loading your sessions" rows={3} />;
  const others = sessions.data.filter((session) => !session.current);

  function signOut(id: string) {
    void action.run(async () => {
      await auth.request(`/me/sessions/${id}`, { method: 'DELETE' });
      sessions.mutate((current) => current.filter((session) => session.id !== id));
      return 'That device was signed out.';
    }, 'Could not sign that device out');
  }

  return (
    <>
      <Section
        action={
          others.length > 0 && (
            <Button disabled={action.busy} label="Sign out all others" onClick={() => setSigningOut(true)} />
          )
        }
        title="Signed-in devices"
      >
        <ul className="panel-rows">
          {sessions.data.map((session) => (
            <li className="flex items-center justify-between gap-4 panel-row" key={session.id}>
              <RowText
                detail={<>signed in {timeAgo(session.signedInAt)} · last active {timeAgo(session.lastUsedAt)}</>}
                title={<>{session.deviceLabel} {session.current && <span className="mono-sm text-faint"> · this device</span>}</>}
              />
              {!session.current && (
                <Button disabled={action.busy} label="Sign out" onClick={() => signOut(session.id)} />
              )}
            </li>
          ))}
        </ul>
      </Section>
      <SecurityLog />
      {signingOut && (
        <ConfirmDialog
          busyLabel="Signing out…"
          confirmLabel="Sign out all others"
          errorFallback="Could not sign the other devices out"
          onClose={() => setSigningOut(false)}
          onConfirm={async () => {
            await auth.request('/me/sessions', { method: 'DELETE' });
            sessions.mutate((current) => current.filter((session) => session.current));
          }}
          title="Sign out every other device?"
          tone="danger"
        >
          Your personal access tokens and private calendar link are revoked too, and your webhooks are turned off.
        </ConfirmDialog>
      )}
    </>
  );
}
