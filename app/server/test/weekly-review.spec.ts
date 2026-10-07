import { describe, expect, it } from 'vitest';
import { nextSundayEvening } from '../src/review/weekly-review.service';

describe('nextSundayEvening', () => {
  it('picks the coming Sunday at 18:00 in the person’s time zone', () => {
    expect(nextSundayEvening('Europe/London', new Date('2026-10-07T12:00:00Z')).toISOString()).toBe('2026-10-11T17:00:00.000Z');
    expect(nextSundayEvening('Europe/London', new Date('2026-10-11T16:59:00Z')).toISOString()).toBe('2026-10-11T17:00:00.000Z');
    expect(nextSundayEvening('Europe/London', new Date('2026-10-11T17:00:00Z')).toISOString()).toBe('2026-10-18T17:00:00.000Z');
    expect(nextSundayEvening('Asia/Tokyo', new Date('2026-10-10T20:00:00Z')).toISOString()).toBe('2026-10-11T09:00:00.000Z');
    expect(nextSundayEvening('Europe/London', new Date('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-25T18:00:00.000Z');
  });
});
