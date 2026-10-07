import { describe, expect, it } from 'vitest';
import { calendarText } from '../src/calendar/ical';

const event = {
  startsOn: new Date('2026-11-06T00:00:00Z'),
  startTime: '20:00',
  endsOn: new Date('2026-11-06T00:00:00Z'),
  endTime: '22:30',
  timeZone: 'Europe/Lisbon',
  repeatRule: null,
  location: 'Rua Augusta, 12',
  description: 'Bring wine; and snacks\nSee you',
};

describe('calendarText', () => {
  it('writes timed and all-day events with escaped text, repeat rules and folded lines', () => {
    const longTitle = 'Trip '.repeat(20).trim();
    const text = calendarText(
      'Amr’s Strata agenda',
      [
        { id: 'dinner', title: 'Dinner, finally', updatedAt: new Date('2026-10-07T10:00:00.123Z'), event },
        {
          id: 'trip',
          title: longTitle,
          updatedAt: new Date('2026-10-07T10:00:00Z'),
          event: { ...event, startTime: null, endTime: null, endsOn: new Date('2026-11-08T00:00:00Z'), repeatRule: 'FREQ=YEARLY', location: null, description: '' },
        },
      ],
      (path) => `https://strata.example${path}`,
    );
    const lines = text.split('\r\n');

    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines).toEqual(
      expect.arrayContaining([
        'X-WR-CALNAME:Amr’s Strata agenda',
        'UID:dinner@strata',
        'DTSTAMP:20261007T100000Z',
        'SUMMARY:Dinner\\, finally',
        'DTSTART;TZID=Europe/Lisbon:20261106T200000',
        'DTEND;TZID=Europe/Lisbon:20261106T223000',
        'LOCATION:Rua Augusta\\, 12',
        'DESCRIPTION:Bring wine\\; and snacks\\nSee you',
        'URL:https://strata.example/events/dinner',
        'DTSTART;VALUE=DATE:20261106',
        'DTEND;VALUE=DATE:20261109',
        'RRULE:FREQ=YEARLY',
      ]),
    );
    expect(lines.every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(text.replace(/\r\n /g, '')).toContain(`SUMMARY:${longTitle}\r\n`);
  });
});
