import { describe, expect, it } from 'vitest';
import { readCalendar } from '../src/calendar/ical-reader';

const calendar = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Holidays\\, Portugal', 'X-WR-TIMEZONE:Europe/Lisbon', ...events, 'END:VCALENDAR'].join('\r\n');
const since = new Date('2026-01-01T00:00:00Z');

describe('readCalendar', () => {
  it('reads timed, all-day, repeating and floating events, and skips what it cannot show', () => {
    const { name, events } = readCalendar(
      calendar(
        ['BEGIN:VEVENT', 'UID:a', 'SUMMARY:Standup\\, team', 'DTSTART;TZID=Europe/Berlin:20261106T090000', 'DTEND;TZID=Europe/Berlin:20261106T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR', 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'UID:b', 'SUMMARY:Trip to', '  Porto', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261113', 'LOCATION:Porto\\nPortugal', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'UID:c', 'SUMMARY:Call', 'DTSTART:20261106T230000Z', 'DTEND;TZID=Asia/Tokyo:20261107T090000', 'END:VEVENT'].join('\n'),
        ['BEGIN:VEVENT', 'UID:d', 'DTSTART:20261108T100000', 'DURATION:PT1H30M', 'RRULE:FREQ=WEEKLY;BYWEEKNO=20', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'UID:a', 'RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000', 'DTSTART;TZID=Europe/Berlin:20261109T100000', 'SUMMARY:Moved', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'UID:e', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261120', 'SUMMARY:Off', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'UID:f', 'DTSTART;VALUE=DATE:20250101', 'SUMMARY:Last year', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'UID:g', 'DTSTART:not-a-date', 'SUMMARY:Broken', 'END:VEVENT'].join('\r\n'),
      ),
      since,
    );

    expect(name).toBe('Holidays, Portugal');
    expect(events).toEqual([
      {
        uid: 'a',
        title: 'Standup, team',
        startsOn: '2026-11-06',
        startTime: '09:00',
        endsOn: '2026-11-06',
        endTime: '09:30',
        timeZone: 'Europe/Berlin',
        repeatRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        location: null,
      },
      { uid: 'b', title: 'Trip to Porto', startsOn: '2026-11-10', startTime: null, endsOn: '2026-11-12', endTime: null, timeZone: 'Europe/Lisbon', repeatRule: null, location: 'Porto\nPortugal' },
      { uid: 'c', title: 'Call', startsOn: '2026-11-06', startTime: '23:00', endsOn: '2026-11-07', endTime: '00:00', timeZone: 'Etc/UTC', repeatRule: null, location: null },
      { uid: 'd', title: 'Busy', startsOn: '2026-11-08', startTime: '10:00', endsOn: '2026-11-08', endTime: '11:30', timeZone: 'Europe/Lisbon', repeatRule: null, location: null },
    ]);
  });

  it('refuses something that is not a calendar', () => {
    expect(() => readCalendar('<html>Not found</html>', since)).toThrow('not an iCalendar file');
  });
});
