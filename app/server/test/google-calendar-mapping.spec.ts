import { describe, expect, it } from 'vitest';
import { fieldsOf, fromGoogle, storedEvent, strataHash, toGoogle } from '../src/google/calendar-mapping';

const timed = {
  id: 'abc',
  etag: '"1"',
  summary: '  Standup ',
  start: { dateTime: '2026-11-09T09:00:00+01:00', timeZone: 'Europe/Paris' },
  end: { dateTime: '2026-11-09T09:15:00+01:00', timeZone: 'Europe/Paris' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Europe/Paris:20261111T090000,20261116T090000', 'EXDATE:20261118T080000Z'],
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 10 }] },
};

describe('fromGoogle', () => {
  it('reads a repeating timed event in its own time zone, with skipped dates, meeting link and popup reminder', () => {
    expect(fromGoogle(timed, 'Etc/UTC')).toEqual({
      unreadableRule: false,
      fields: {
        title: 'Standup',
        startsOn: '2026-11-09',
        startTime: '09:00',
        endsOn: '2026-11-09',
        endTime: '09:15',
        timeZone: 'Europe/Paris',
        repeatRule: 'FREQ=WEEKLY;BYDAY=MO,WE',
        excludedDates: ['2026-11-11', '2026-11-16', '2026-11-18'],
        location: null,
        description: '',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        reminderMinutes: 10,
      },
    });
  });

  it('reads an all-day event whose end date Google keeps exclusive, using the calendar time zone', () => {
    const read = fromGoogle({ id: 'trip', etag: '"2"', start: { date: '2026-12-20' }, end: { date: '2026-12-23' }, reminders: { useDefault: true } }, 'Africa/Cairo');

    expect(read?.fields).toMatchObject({ title: '(No title)', startsOn: '2026-12-20', startTime: null, endsOn: '2026-12-22', endTime: null, timeZone: 'Africa/Cairo', reminderMinutes: null });
  });

  it('keeps an event whose repeat rule Strata cannot read as a single event and says so', () => {
    const read = fromGoogle({ ...timed, recurrence: ['RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU'] }, 'Etc/UTC');

    expect(read).toMatchObject({ unreadableRule: true, fields: { repeatRule: null, excludedDates: [] } });
  });

  it('gives up on events without start and end times', () => {
    expect(fromGoogle({ id: 'x', etag: '"3"' }, 'Etc/UTC')).toBeNull();
  });
});

describe('toGoogle', () => {
  const { fields } = fromGoogle(timed, 'Etc/UTC')!;

  it('writes times in the event zone and leaves out dates that Google keeps as moved instances', () => {
    expect(toGoogle(fields, { keepRecurrence: false, instanceDates: new Set(['2026-11-16']) })).toEqual({
      summary: 'Standup',
      description: '',
      location: '',
      start: { date: null, dateTime: '2026-11-09T09:00:00', timeZone: 'Europe/Paris' },
      end: { date: null, dateTime: '2026-11-09T09:15:00', timeZone: 'Europe/Paris' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Europe/Paris:20261111T090000', 'EXDATE;TZID=Europe/Paris:20261118T090000'],
    });
  });

  it('leaves Google’s repeat rule alone when Strata could not read it, and clears it when the Strata event stopped repeating', () => {
    expect(toGoogle(fields, { keepRecurrence: true, instanceDates: new Set() })).not.toHaveProperty('recurrence');
    expect(toGoogle({ ...fields, repeatRule: null }, { keepRecurrence: false, instanceDates: new Set() }).recurrence).toEqual([]);
  });

  it('writes all-day events with an exclusive end date and default reminders', () => {
    const body = toGoogle({ ...fields, startTime: null, endTime: null, endsOn: '2026-11-10', repeatRule: null, reminderMinutes: null }, { keepRecurrence: false, instanceDates: new Set() });

    expect(body).toMatchObject({ start: { date: '2026-11-09', dateTime: null }, end: { date: '2026-11-11', dateTime: null }, reminders: { useDefault: true } });
  });
});

describe('strataHash', () => {
  it('survives a round trip through the database and ignores the meeting link Strata never sends', () => {
    const { fields } = fromGoogle(timed, 'Etc/UTC')!;
    const stored = fieldsOf(fields.title, { ...storedEvent(fields), meetingUrl: null });

    expect(strataHash(stored)).toBe(strataHash(fields));
    expect(strataHash({ ...fields, title: 'Retro' })).not.toBe(strataHash(fields));
  });
});
