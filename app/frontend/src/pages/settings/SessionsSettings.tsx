import { ListSkeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SecurityLog } from './SecurityLog';
import { SettingsSection } from './SettingsLayout';

interface Session {
  id: string;
  deviceLabel: string;
  signedInAt: string;
  lastUsedAt: string;
  current: boolean;
}

export function SessionsSettings() {
  const auth = useAuth();
  const sessions = useResource<Session[]>('/me/sessions', true);
  const action = useAction();

  if (sessions.error) return <p className="error-message">{sessions.error}</p>;
  if (!sessions.data) return <ListSkeleton label="Loading your sessions" rows={3} />;
  const others = sessions.data.filter((session) => !session.current);

  function signOut(id?: string) {
    void action.run(async () => {
      await auth.request(id ? `/me/sessions/${id}` : '/me/sessions', { method: 'DELETE' });
      sessions.mutate((current) => current.filter((session) => (id ? session.id !== id : session.current)));
      return id ? 'That device was signed out.' : 'Every other device was signed out.';
    }, 'Could not sign that device out');
  }

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <SettingsSection
        description="Every device signed in to your account. Sign out anything you do not recognise, then change your password."
        title="Signed-in devices"
      >
        <ul className="mt-5 grid list-none gap-0 p-0">
          {sessions.data.map((session) => (
            <li className="flex items-center justify-between gap-4 border-b border-line-soft py-4" key={session.id}>
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
                <button
                  className="secondary-button inline-flex shrink-0 px-3 py-2 text-sm"
                  disabled={action.busy}
                  onClick={() => signOut(session.id)}
                  type="button"
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      </SettingsSection>
      {action.status}
      {others.length > 0 && (
        <button
          className="secondary-button inline-flex w-fit"
          disabled={action.busy}
          onClick={() => signOut()}
          type="button"
        >
          Sign out every other device
        </button>
      )}
      <div className="mt-6">
        <SecurityLog />
      </div>
    </div>
  );
}
