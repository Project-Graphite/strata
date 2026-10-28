import { useState } from 'react';
import { ConfirmDialog, ListRow, Placeholder, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SecurityLog } from './SecurityLog';
import { Section } from '../../components/Page';
import { LoadError } from '../../components/LoadError';
import { Button } from '../../components/Button';
import { ButtonSkeleton, RowSkeleton, rowsOf, useRememberedShape } from '../../components/Skeletons';

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
  const { report } = useAction();
  const [signingOut, setSigningOut] = useState<Session | 'others'>();
  const [rows] = useRememberedShape('settings-sessions', sessions.data && [sessions.data.length], [2]);

  return (
    <>
      <Section
        action={
          sessions.data
            ? sessions.data.some((session) => !session.current) && <Button label="Sign out all others" onClick={() => setSigningOut('others')} />
            : !sessions.error && rows > 1 && <ButtonSkeleton width="w-36" />
        }
        title="Signed-in devices"
      >
        {sessions.error ? (
          <LoadError compact error={sessions.error} onRetry={sessions.reload} />
        ) : !sessions.data ? (
          <Placeholder label="Loading your sessions">
            <ul aria-hidden="true" className="panel-rows">
              {rowsOf(rows).map((row) => (
                <RowSkeleton key={row} row={row} trail={row > 0 && <ButtonSkeleton width="w-18" />} />
              ))}
            </ul>
          </Placeholder>
        ) : (
          <ul className="panel-rows">
            {sessions.data.map((session) => (
              <ListRow
                key={session.id}
                meta={<>signed in {timeAgo(session.signedInAt)} · last active {timeAgo(session.lastUsedAt)}</>}
                title={session.current ? `${session.deviceLabel} · this device` : session.deviceLabel}
                trail={!session.current && <Button label="Sign out" onClick={() => setSigningOut(session)} />}
              />
            ))}
          </ul>
        )}
      </Section>
      <SecurityLog />
      {signingOut && signingOut !== 'others' && (
        <ConfirmDialog
          busyLabel="Signing out…"
          confirmLabel="Sign out"
          errorFallback="Could not sign that device out"
          onClose={() => setSigningOut(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/sessions/${signingOut.id}`, { method: 'DELETE' });
            sessions.mutate((current) => current.filter((session) => session.id !== signingOut.id));
            report(`Signed out ${signingOut.deviceLabel}.`);
          }}
          title="Sign out this device?"
          tone="danger"
        >
          {signingOut.deviceLabel} needs your password to get back in.
        </ConfirmDialog>
      )}
      {signingOut === 'others' && (
        <ConfirmDialog
          busyLabel="Signing out…"
          confirmLabel="Sign out all others"
          errorFallback="Could not sign the other devices out"
          onClose={() => setSigningOut(undefined)}
          onConfirm={async () => {
            await auth.request('/me/sessions', { method: 'DELETE' });
            sessions.mutate((current) => current.filter((session) => session.current));
            report('Signed out every other device.');
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
