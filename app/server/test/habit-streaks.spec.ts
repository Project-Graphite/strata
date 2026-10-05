import { describe, expect, it } from 'vitest';
import { habitStats } from '../src/habits/streaks';

describe('habit streaks', () => {
  it('counts daily streaks up to today, or up to yesterday before today’s check-in', () => {
    expect(habitStats(['2026-10-03', '2026-10-04', '2026-10-05'], 7, '2026-10-05')).toMatchObject({ checkedToday: true, streak: 3 });
    expect(habitStats(['2026-10-03', '2026-10-04'], 7, '2026-10-05')).toMatchObject({ checkedToday: false, streak: 2 });
    expect(habitStats(['2026-10-01', '2026-10-02', '2026-10-04'], 7, '2026-10-05')).toMatchObject({ streak: 1 });
    expect(habitStats(['2026-10-02'], 7, '2026-10-05').streak).toBe(0);
  });

  it('counts weeks that met the goal, including this week only once it is met', () => {
    const lastTwoWeeks = ['2026-09-22', '2026-09-24', '2026-09-29', '2026-10-01'];
    expect(habitStats(lastTwoWeeks, 2, '2026-10-05')).toMatchObject({ thisWeek: 0, streak: 2 });
    expect(habitStats([...lastTwoWeeks, '2026-10-05'], 2, '2026-10-05')).toMatchObject({ thisWeek: 1, streak: 2 });
    expect(habitStats([...lastTwoWeeks, '2026-10-05', '2026-10-06'], 2, '2026-10-06')).toMatchObject({ thisWeek: 2, streak: 3 });
    expect(habitStats(['2026-09-22', '2026-10-01'], 2, '2026-10-05').streak).toBe(0);
  });

  it('lists the check-ins of the last seven days', () => {
    expect(habitStats(['2026-09-28', '2026-09-29', '2026-10-05'], 7, '2026-10-05').recent).toEqual(['2026-09-29', '2026-10-05']);
  });
});
