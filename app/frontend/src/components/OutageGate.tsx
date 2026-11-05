import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { nextTryLabel, outageCopy, retryDelay, serverHealth, type OutageCondition } from '../outage';
import '../outage.css';

const subscribeToClock = (changed: () => void) => {
  const timer = window.setInterval(changed, 250);
  return () => window.clearInterval(timer);
};

function OutageScreen({ condition, healthUrl }: { condition: OutageCondition; healthUrl: string }) {
  const [cause, setCause] = useState(condition);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [dueAt, setDueAt] = useState(() => Date.now() + retryDelay(0));
  const now = useSyncExternalStore(subscribeToClock, () => Math.floor(Date.now() / 250) * 250);
  const copy = outageCopy[cause];

  async function check() {
    setChecking(true);
    const health = await serverHealth(healthUrl);
    if (!health) {
      window.location.reload();
      return;
    }
    setCause(health);
    setChecking(false);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    const delay = retryDelay(attempt);
    setDueAt(Date.now() + delay);
    const timer = window.setTimeout(() => void check(), delay);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  useEffect(() => {
    const online = () => void check();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  return (
    <main className="outage" role="alert">
      <img alt="" height="56" src="/favicon.svg" width="56" />
      <p className="outage-eyebrow">{copy.eyebrow}</p>
      <h1 className="outage-title">{copy.title}</h1>
      <p className="outage-body">{copy.body}</p>
      <div className="outage-actions">
        <button className="outage-button" disabled={checking} onClick={() => void check()} type="button">
          Try again now
        </button>
        <span aria-live="polite" className="outage-next">
          {checking ? 'Checking the server…' : nextTryLabel(dueAt, now)}
        </span>
      </div>
    </main>
  );
}

export function OutageGate({ children, healthUrl, subscribe }: { children: ReactNode; healthUrl: string; subscribe: (listener: () => void) => () => void }) {
  const [down, setDown] = useState<OutageCondition | null>(null);

  useEffect(
    () =>
      subscribe(() => {
        void serverHealth(healthUrl).then((health) => health && setDown(health));
      }),
    [healthUrl, subscribe],
  );

  useEffect(() => {
    document.documentElement.toggleAttribute('data-outage', Boolean(down));
    return () => document.documentElement.removeAttribute('data-outage');
  }, [down]);

  return down ? <OutageScreen condition={down} healthUrl={healthUrl} /> : children;
}
