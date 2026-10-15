import { ListSkeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SecurityLog } from './SecurityLog';
import { Section } from '../../components/Page';
import { LoadError } from '../../components/LoadError';
import { Button } from '../../components/Button';

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

  if (sessions.error) return <LoadError error={sessions.error} onRetry={sessions.reload} />;
  if (!sessions.data) return <ListSkeleton label="Loading your sessions" rows={3} />;
  const others = sessions.data.filter((session) => !session.current);

  function signOut(id?: string) {
    void action.run(async () => {
      await auth.request(id ? `/me/sessions/${id}` : '/me/sessions', { method: 'DELETE' });
      sessions.mutate((current) => current.filter((session) => (id ? session.id !== id : session.current)));
      return id ? 'That device was signed out.' : 'Every other device was signed out and your access tokens were revoked.';
    }, 'Could not sign that device out');
  }

  return (
    <>
      <Section
        action={
          others.length > 0 && (
            <Button disabled={action.busy} label="Sign out all others" onClick={() => signOut()} />
          )
        }
        title="Signed-in devices"
      >
        <ul className="panel-rows">
          {sessions.data.map((session) => (
            <li className="flex items-center justify-between gap-4 panel-row" key={session.id}>
              <div className="min-w-0">
                <p className="m-0 truncate text-ink">
                  {session.deviceLabel}
                  {session.current && <span className="mono-sm text-faint"> · this device</span>}
                </p>
                <p className="mono-sm m-0 mt-1 text-faint">
                  signed in {timeAgo(session.signedInAt)} · last active {timeAgo(session.lastUsedAt)}
                </p>
              </div>
              {!session.current && (
                <Button disabled={action.busy} label="Sign out" onClick={() => signOut(session.id)} />
              )}
            </li>
          ))}
        </ul>
      </Section>
      <SecurityLog />
    </>
  );
}
