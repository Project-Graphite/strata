import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { BrainstormBar, countVotes, useBoardSession, votesBy } from '../src/components/board-session';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shape = (id: string, x: number, y: number, width: number, height: number, extra: Partial<ExcalidrawElement> = {}) =>
  ({ id, type: 'rectangle', x, y, width, height, isDeleted: false, ...extra }) as ExcalidrawElement;
const dot = (id: string, x: number, y: number, voter: string, round = 100) =>
  shape(id, x - 11, y - 11, 22, 22, { type: 'ellipse', customData: { round, voter } } as Partial<ExcalidrawElement>);

describe('Board brainstorm sessions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('counts each dot of the round on the smallest shape under it', () => {
    const round = { startedAt: 100, perPerson: 3 };
    const scene = [
      shape('frame', 0, 0, 1000, 1000, { type: 'frame' } as Partial<ExcalidrawElement>),
      shape('tea', 10, 10, 100, 100),
      shape('cake', 200, 10, 100, 100),
      dot('a', 50, 50, 'amr'),
      dot('b', 60, 60, 'sam'),
      dot('c', 250, 50, 'amr'),
      dot('d', 600, 600, 'amr'),
      dot('old', 50, 50, 'amr', 99),
      { ...dot('gone', 250, 50, 'sam'), isDeleted: true } as ExcalidrawElement,
    ];
    const labels: Record<string, string> = { tea: 'Tea', cake: 'Cake', frame: 'Frame' };

    expect(countVotes(scene, round, (id) => labels[id]!)).toEqual([
      { id: 'tea', label: 'Tea', votes: 2 },
      { id: 'cake', label: 'Cake', votes: 1 },
      { id: 'frame', label: 'Frame', votes: 1 },
    ]);
    expect(votesBy(scene, round, 'amr')).toBe(3);
    expect(votesBy(scene, round, 'sam')).toBe(1);
  });

  it('shares a timer and a voting round through the board document', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
    const document = new Y.Doc();
    const counted = vi.fn();
    function Harness({ votesLeft }: { votesLeft: number }) {
      return <BrainstormBar controls onCount={counted} session={useBoardSession(document)} votesLeft={votesLeft} />;
    }
    await act(async () => root.render(<Harness votesLeft={2} />));
    const menu = async (label: string) => {
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Brainstorm: timer and voting"]')!.click());
      await act(async () => [...window.document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === label)!.click());
    };

    await menu('Start a 5-minute timer');
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('5:00 left');
    await act(async () => vi.advanceTimersByTime(61_000));
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('3:59 left');
    expect(document.getMap('session').get('timer')).toEqual({ endsAt: Date.parse('2026-10-11T10:05:00Z') });
    await act(async () => vi.advanceTimersByTime(4 * 60_000));
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('Time’s up');

    await menu('Start a vote, 3 dots each');
    expect(container.textContent).toContain('Voting · 2 of 3 dots left');
    await menu('End the vote and count');
    expect(counted).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.transact(() => {
        document.getMap('session').delete('round');
        document.getMap('session').set('results', [{ id: 'tea', label: 'Tea', votes: 2 }]);
      });
    });
    expect(container.querySelector('section[aria-label="Vote results"]')?.textContent).toContain('Tea2 dots');
    await menu('Clear the results');
    expect(container.querySelector('section[aria-label="Vote results"]')).toBeNull();
  });
});
