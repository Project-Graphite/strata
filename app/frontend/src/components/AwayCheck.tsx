import { useEffect, useState } from 'react';
import { Dialog } from '@project-graphite/ui';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { Empty } from './Empty';
import type { Connection } from './live-document';

const awayAfterMs = 20 * 60 * 1000;
const answerWithinMs = 2 * 60 * 1000;

export function AwayCheck({ connection }: { connection: Connection }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (connection.refused) return;
    let activeAt = Date.now();
    const active = () => {
      activeAt = Date.now();
    };
    window.addEventListener('pointerdown', active, { passive: true });
    window.addEventListener('keydown', active);
    window.addEventListener('scroll', active, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      if (Date.now() - activeAt > awayAfterMs) setAsking(true);
    }, 15_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('keydown', active);
      window.removeEventListener('scroll', active, true);
    };
  }, [connection]);

  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => {
      setAsking(false);
      connection.leave();
    }, answerWithinMs);
    return () => window.clearTimeout(timer);
  }, [asking, connection]);

  if (!asking) return null;
  return (
    <Dialog onClose={() => setAsking(false)} title="Are you still here?">
      <p className="mt-3">This shared page closes in 2 minutes for people who are away.</p>
      <DialogActions>
        <Button label="I'm here" onClick={() => setAsking(false)} primary />
      </DialogActions>
    </Dialog>
  );
}

export function LeftSharedPage({ connection }: { connection: Connection }) {
  return connection.refused === 'removed' ? (
    <Empty title="You were removed from this page">The person who shared it removed you. You can try the link again in an hour.</Empty>
  ) : (
    <Empty action={<Button label="Rejoin" onClick={connection.rejoin} primary />} title="You left this page">
      You were away for a while, so the shared page closed.
    </Empty>
  );
}
