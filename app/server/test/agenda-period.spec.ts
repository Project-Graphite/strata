import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/auth', () => ({ useAuth: () => ({}) }));
vi.mock('../../frontend/src/useResource', () => ({ useResource: () => ({}) }));

const { agendaPeriod } = await import('../../frontend/src/agenda');

describe('agenda periods', () => {
  it('shows a whole week from the week start', () => {
    expect(agendaPeriod('week', '2026-10-30', 0)).toEqual({ from: '2026-10-25', to: '2026-11-01', days: 7 });
    expect(agendaPeriod('week', '2026-10-30', 1)).toEqual({ from: '2026-10-26', to: '2026-11-02', days: 7 });
    expect(agendaPeriod('week', '2026-10-30', 6)).toEqual({ from: '2026-10-24', to: '2026-10-31', days: 7 });
  });

  it('starts day and list periods on the chosen date', () => {
    expect(agendaPeriod('day', '2026-10-30', 1)).toEqual({ from: '2026-10-30', to: '2026-10-31', days: 1 });
    expect(agendaPeriod('list', '2026-10-30', 1)).toEqual({ from: '2026-10-30', to: '2026-11-29', days: 30 });
  });
});
