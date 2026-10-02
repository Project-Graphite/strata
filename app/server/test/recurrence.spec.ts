import { describe, expect, it } from 'vitest';
import { occurrences } from '../src/recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../src/recurrence/rule';

const everything = { from: new Date('2000-01-01T00:00:00Z'), to: new Date('2100-01-01T00:00:00Z') };

function expand(rule: string, date: string, time = '09:00', timeZone = 'America/New_York', window = everything) {
  return occurrences(parseRule(rule), { date, time, timeZone }, window).map((at) => at.toISOString());
}

describe('Repetition rules', () => {
  it('expands the RFC 5545 examples Strata supports', () => {
    expect(expand('FREQ=DAILY;COUNT=3', '2026-09-02')).toEqual([
      '2026-09-02T13:00:00.000Z',
      '2026-09-03T13:00:00.000Z',
      '2026-09-04T13:00:00.000Z',
    ]);
    expect(expand('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=4', '2026-09-01')).toEqual([
      '2026-09-01T13:00:00.000Z',
      '2026-09-03T13:00:00.000Z',
      '2026-09-15T13:00:00.000Z',
      '2026-09-17T13:00:00.000Z',
    ]);
    expect(expand('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', '2026-09-25')).toEqual([
      '2026-09-25T13:00:00.000Z',
      '2026-10-30T13:00:00.000Z',
      '2026-11-27T14:00:00.000Z',
    ]);
    expect(expand('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3', '2026-09-30')).toEqual([
      '2026-09-30T13:00:00.000Z',
      '2026-10-30T13:00:00.000Z',
      '2026-11-30T14:00:00.000Z',
    ]);
    expect(expand('FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3', '2027-01-31')).toEqual([
      '2027-01-31T14:00:00.000Z',
      '2027-02-28T14:00:00.000Z',
      '2027-03-31T13:00:00.000Z',
    ]);
  });

  it('skips months and years without the start day, like the standard says', () => {
    expect(expand('FREQ=MONTHLY;COUNT=3', '2027-01-31')).toEqual([
      '2027-01-31T14:00:00.000Z',
      '2027-03-31T13:00:00.000Z',
      '2027-05-31T13:00:00.000Z',
    ]);
    expect(expand('FREQ=YEARLY;COUNT=2', '2028-02-29', '12:00', 'UTC')).toEqual([
      '2028-02-29T12:00:00.000Z',
      '2032-02-29T12:00:00.000Z',
    ]);
  });

  it('keeps the local time across daylight saving changes and stops at UNTIL', () => {
    expect(expand('FREQ=DAILY;UNTIL=20270329T235959Z', '2027-03-27', '09:00', 'Europe/London')).toEqual([
      '2027-03-27T09:00:00.000Z',
      '2027-03-28T08:00:00.000Z',
      '2027-03-29T08:00:00.000Z',
    ]);
    expect(expand('FREQ=DAILY;COUNT=1', '2027-03-28', '01:30', 'Europe/London')).toEqual(['2027-03-28T01:30:00.000Z']);
  });

  it('returns only the occurrences inside the window while counting from the start', () => {
    const window = { from: new Date('2026-10-05T00:00:00Z'), to: new Date('2026-10-08T00:00:00Z') };
    expect(expand('FREQ=DAILY;COUNT=5', '2026-10-02', '08:00', 'UTC', window)).toEqual([
      '2026-10-05T08:00:00.000Z',
      '2026-10-06T08:00:00.000Z',
    ]);
    expect(expand('FREQ=WEEKLY', '2020-01-06', '08:00', 'UTC', window)).toEqual(['2026-10-05T08:00:00.000Z']);
  });

  it('refuses rules Strata does not support and round-trips the ones it does', () => {
    for (const rule of [
      'FREQ=SECONDLY',
      'FREQ=DAILY;COUNT=2;UNTIL=20270101T000000Z',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=WEEKLY;BYDAY=1MO',
      'FREQ=YEARLY;BYMONTHDAY=1',
      'FREQ=DAILY;BYSETPOS=1',
      'FREQ=MONTHLY;BYHOUR=9',
      'FREQ=DAILY;INTERVAL=0',
      'FREQ=DAILY;FREQ=WEEKLY',
    ]) {
      expect(() => parseRule(rule), rule).toThrow(RuleError);
    }
    expect(formatRule(parseRule('rrule:freq=monthly;interval=2;byday=mo,-1fr;bysetpos=1;until=20271231T000000Z;wkst=su'))).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO,-1FR;BYSETPOS=1;UNTIL=20271231T000000Z;WKST=SU',
    );
  });
});
