import { describe, expect, it } from 'vitest';
import { nextMondayMorning } from '../src/tidy/tidy.service';

describe('nextMondayMorning', () => {
  it('picks the coming Monday at 09:00 in the person’s time zone', () => {
    expect(nextMondayMorning('Europe/London', new Date('2026-10-04T12:00:00Z')).toISOString()).toBe('2026-10-05T08:00:00.000Z');
    expect(nextMondayMorning('Europe/London', new Date('2026-10-05T07:59:00Z')).toISOString()).toBe('2026-10-05T08:00:00.000Z');
    expect(nextMondayMorning('Europe/London', new Date('2026-10-05T08:00:00Z')).toISOString()).toBe('2026-10-12T08:00:00.000Z');
    expect(nextMondayMorning('Asia/Tokyo', new Date('2026-10-04T23:30:00Z')).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(nextMondayMorning('America/New_York', new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });
});
