import { dateText, dayMs } from '../recurrence/dates';

export interface FeedEvent {
  id: string;
  title: string;
  updatedAt: Date;
  event: {
    startsOn: Date;
    startTime: string | null;
    endsOn: Date;
    endTime: string | null;
    timeZone: string;
    repeatRule: string | null;
    location: string | null;
    description: string;
  };
}

const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compactDate = (date: Date) => dateText(date).replaceAll('-', '');
const clock = (time: string) => `${time.replace(':', '')}00`;

function fold(line: string) {
  const parts: string[] = [];
  let current = '';
  for (const character of line) {
    if (Buffer.byteLength(current + character) > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  return [...parts, current].join('\r\n ');
}

export function calendarText(name: string, items: FeedEvent[], link: (path: string) => string) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Project Graphite//Strata//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(name)}`];
  for (const { id, title, updatedAt, event } of items) {
    lines.push('BEGIN:VEVENT', `UID:${id}@strata`, `DTSTAMP:${updatedAt.toISOString().replace(/[-:]|\.\d{3}/g, '')}`, `SUMMARY:${escapeText(title)}`);
    if (event.startTime) {
      lines.push(
        `DTSTART;TZID=${event.timeZone}:${compactDate(event.startsOn)}T${clock(event.startTime)}`,
        `DTEND;TZID=${event.timeZone}:${compactDate(event.endsOn)}T${clock(event.endTime ?? event.startTime)}`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(event.startsOn)}`, `DTEND;VALUE=DATE:${compactDate(new Date(event.endsOn.getTime() + dayMs))}`);
    }
    if (event.repeatRule) lines.push(`RRULE:${event.repeatRule}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push(`URL:${link(`/events/${id}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
