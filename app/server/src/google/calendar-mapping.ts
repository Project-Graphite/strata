import { createHash } from 'node:crypto';
import { exdateLines } from '../calendar/ical';
import { dateText, dateValue, dayMs } from '../recurrence/dates';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';

export interface GoogleTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

export interface GoogleEventResource {
  id: string;
  etag: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleTime;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] };
  updated?: string;
}

export interface EventFields {
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  timeZone: string;
  repeatRule: string | null;
  excludedDates: string[];
  location: string | null;
  description: string;
  meetingUrl: string | null;
  reminderMinutes: number | null;
}

export interface StoredEvent {
  startsOn: Date;
  startTime: string | null;
  endsOn: Date;
  endTime: string | null;
  timeZone: string;
  repeatRule: string | null;
  excludedDates: Date[];
  location: string | null;
  description: string;
  meetingUrl: string | null;
  reminderMinutes: number | null;
}

const maxDays = 31;

function shift(day: string, days: number) {
  return dateText(new Date(dateValue(day).getTime() + days * dayMs));
}

function local(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((found) => found.type === type)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export function originalDate(time: GoogleTime, timeZone: string) {
  return time.date ?? local(new Date(time.dateTime!), time.timeZone ?? timeZone).date;
}

function excluded(lines: string[], timeZone: string) {
  return lines
    .filter((line) => /^EXDATE[;:]/i.test(line))
    .flatMap((line) => line.slice(line.indexOf(':') + 1).split(','))
    .map((value) => {
      const match = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}(Z)?)?$/.exec(value.trim());
      if (!match) return null;
      return match[4] ? local(new Date(`${match[1]}-${match[2]}-${match[3]}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`), timeZone).date : `${match[1]}-${match[2]}-${match[3]}`;
    })
    .filter((day): day is string => day !== null);
}

function readRule(lines: string[]) {
  const line = lines.find((found) => /^RRULE:/i.test(found));
  if (!line) return { repeatRule: null, unreadableRule: false };
  try {
    return { repeatRule: formatRule(parseRule(line)), unreadableRule: false };
  } catch (error) {
    if (error instanceof RuleError) return { repeatRule: null, unreadableRule: true };
    throw error;
  }
}

export function fromGoogle(event: GoogleEventResource, calendarZone: string) {
  if (!event.start || !event.end || !(event.start.date || event.start.dateTime)) return null;
  const timeZone = event.start.timeZone || calendarZone;
  let startsOn: string;
  let startTime: string | null = null;
  let endsOn: string;
  let endTime: string | null = null;
  if (event.start.date) {
    startsOn = event.start.date;
    endsOn = event.end.date ? shift(event.end.date, -1) : startsOn;
  } else {
    const start = local(new Date(event.start.dateTime!), timeZone);
    const end = local(new Date(event.end.dateTime ?? event.start.dateTime!), timeZone);
    startsOn = start.date;
    startTime = start.time;
    endsOn = end.date;
    endTime = end.date === start.date && end.time === start.time ? null : end.time;
  }
  if (endsOn < startsOn) endsOn = startsOn;
  if (dateValue(endsOn).getTime() - dateValue(startsOn).getTime() > maxDays * dayMs) endsOn = shift(startsOn, maxDays);
  const lines = event.recurrence ?? [];
  const { repeatRule, unreadableRule } = readRule(lines);
  const reminder = event.reminders?.useDefault === false ? (event.reminders.overrides?.find((override) => override.method === 'popup') ?? event.reminders.overrides?.[0]) : undefined;
  const fields: EventFields = {
    title: (event.summary ?? '').trim().slice(0, 200) || '(No title)',
    startsOn,
    startTime,
    endsOn,
    endTime,
    timeZone,
    repeatRule,
    excludedDates: repeatRule ? [...new Set(excluded(lines, timeZone))].sort() : [],
    location: event.location?.trim().slice(0, 200) || null,
    description: (event.description ?? '').slice(0, 5_000),
    meetingUrl: (event.hangoutLink ?? event.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')?.uri)?.slice(0, 500) ?? null,
    reminderMinutes: reminder?.minutes ?? null,
  };
  return { fields, unreadableRule };
}

export function fieldsOf(title: string, event: StoredEvent): EventFields {
  return {
    title,
    startsOn: dateText(event.startsOn),
    startTime: event.startTime,
    endsOn: dateText(event.endsOn),
    endTime: event.endTime,
    timeZone: event.timeZone,
    repeatRule: event.repeatRule,
    excludedDates: event.excludedDates.map((day) => dateText(day)).sort(),
    location: event.location,
    description: event.description,
    meetingUrl: event.meetingUrl,
    reminderMinutes: event.reminderMinutes,
  };
}

export function storedEvent(fields: EventFields) {
  return {
    startsOn: dateValue(fields.startsOn),
    startTime: fields.startTime,
    endsOn: dateValue(fields.endsOn),
    endTime: fields.endTime,
    timeZone: fields.timeZone,
    repeatRule: fields.repeatRule,
    excludedDates: fields.excludedDates.map(dateValue),
    location: fields.location,
    description: fields.description,
    reminderMinutes: fields.reminderMinutes,
  };
}

export function strataHash(fields: EventFields) {
  return createHash('sha256').update(JSON.stringify({ ...fields, meetingUrl: undefined })).digest('base64url');
}

export function toGoogle(fields: EventFields, options: { keepRecurrence: boolean; instanceDates: Set<string> }) {
  const at = (day: string, time: string) => ({ date: null, dateTime: `${day}T${time}:00`, timeZone: fields.timeZone });
  return {
    summary: fields.title,
    description: fields.description,
    location: fields.location ?? '',
    start: fields.startTime ? at(fields.startsOn, fields.startTime) : { date: fields.startsOn, dateTime: null, timeZone: null },
    end: fields.startTime ? at(fields.endsOn, fields.endTime ?? fields.startTime) : { date: shift(fields.endsOn, 1), dateTime: null, timeZone: null },
    reminders: fields.reminderMinutes === null ? { useDefault: true } : { useDefault: false, overrides: [{ method: 'popup', minutes: fields.reminderMinutes }] },
    ...(options.keepRecurrence
      ? {}
      : {
          recurrence: fields.repeatRule
            ? [`RRULE:${fields.repeatRule}`, ...exdateLines({ ...fields, excludedDates: fields.excludedDates.filter((day) => !options.instanceDates.has(day)) })]
            : [],
        }),
  };
}
