import { useEffect, useState } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { Menu } from '@project-graphite/ui';
import type * as Y from 'yjs';

export interface VoteRound {
  startedAt: number;
  perPerson: number;
}

export interface VoteResult {
  id: string;
  label: string;
  votes: number;
}

interface Session {
  timer?: { endsAt: number };
  round?: VoteRound;
  results?: VoteResult[];
}

const isVote = (element: ExcalidrawElement, round: VoteRound) => !element.isDeleted && element.customData?.round === round.startedAt;

export const votesBy = (scene: readonly ExcalidrawElement[], round: VoteRound, voter: string) =>
  scene.filter((element) => isVote(element, round) && element.customData?.voter === voter).length;

export function countVotes(scene: readonly ExcalidrawElement[], round: VoteRound, label: (id: string) => string): VoteResult[] {
  const targets = scene.filter(
    (element) =>
      !element.isDeleted &&
      !element.customData?.round &&
      !['arrow', 'line', 'freedraw'].includes(element.type) &&
      !(element.type === 'text' && element.containerId),
  );
  const counts = new Map<string, number>();
  for (const vote of scene.filter((element) => isVote(element, round))) {
    const x = vote.x + vote.width / 2;
    const y = vote.y + vote.height / 2;
    const target = targets
      .filter((element) => x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (target) counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
  }
  return [...counts]
    .map(([id, votes]) => ({ id, label: label(id), votes }))
    .sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label));
}

function readSession(map: Y.Map<unknown>): Session {
  return { timer: map.get('timer') as Session['timer'], round: map.get('round') as Session['round'], results: map.get('results') as Session['results'] };
}

export function useBoardSession(document: Y.Doc) {
  const map = document.getMap<unknown>('session');
  const [session, setSession] = useState(() => readSession(map));
  useEffect(() => {
    const update = () => setSession(readSession(map));
    map.observe(update);
    return () => map.unobserve(update);
  }, [map]);
  const set = (key: keyof Session, value: Session[keyof Session]) => (value === undefined ? map.delete(key) : map.set(key, value));
  return { ...session, set };
}

function useNow(running: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1_000)).padStart(2, '0')}`;

export function BrainstormBar({
  controls,
  onCount,
  session,
  votesLeft,
}: {
  controls: boolean;
  onCount: () => void;
  session: ReturnType<typeof useBoardSession>;
  votesLeft: number;
}) {
  const now = useNow(Boolean(session.timer));
  const left = session.timer ? session.timer.endsAt - now : 0;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {controls && (
          <Menu
            items={[
              ...[5, 10, 15].map((minutes) => ({ label: `Start a ${minutes}-minute timer`, onSelect: () => session.set('timer', { endsAt: Date.now() + minutes * 60_000 }) })),
              ...(session.timer ? [{ label: 'Stop the timer', onSelect: () => session.set('timer', undefined) }] : []),
              session.round
                ? { label: 'End the vote and count', onSelect: onCount }
                : { label: 'Start a vote, 3 dots each', onSelect: () => session.set('round', { startedAt: Date.now(), perPerson: 3 }) },
              ...(session.results ? [{ label: 'Clear the results', onSelect: () => session.set('results', undefined) }] : []),
            ]}
            label="Brainstorm"
            trigger="Brainstorm"
            triggerClassName="secondary-button px-3 py-1.5 text-sm"
            triggerLabel="Brainstorm: timer and voting"
          />
        )}
        {session.timer && (
          <span className={`mono-sm ${left > 0 ? 'text-ink' : 'text-faint'}`} role="timer">
            {left > 0 ? `${clock(left)} left` : 'Time’s up'}
          </span>
        )}
        {session.round && (
          <span className="mono-sm text-ink" role="status">
            Voting · {votesLeft === 0 ? 'no dots left' : `${votesLeft} of ${session.round.perPerson} dots left`}
          </span>
        )}
      </div>
      {session.results && (
        <section aria-label="Vote results" className="grid gap-1 rounded-lg border border-line-soft px-3 py-2">
          <h3 className="mono-sm m-0 text-faint">Vote results</h3>
          {session.results.length === 0 ? (
            <p className="m-0 text-sm text-muted">No dots landed on a shape.</p>
          ) : (
            <ol className="m-0 grid list-none gap-0.5 p-0 text-sm">
              {session.results.map((result) => (
                <li className="flex justify-between gap-3" key={result.id}>
                  <span className="truncate text-ink">{result.label}</span>
                  <span className="mono-sm shrink-0 text-faint">
                    {result.votes} {result.votes === 1 ? 'dot' : 'dots'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
