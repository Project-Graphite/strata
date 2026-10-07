import { dateText, dateValue, dayMs } from '../recurrence/dates';
import { zonedInstant } from '../recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';

export interface ReadEvent {
  uid: string;
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  timeZone: string;
  repeatRule: string | null;
  location: string | null;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Moment {
  date: string;
  time: string | null;
  zone: string;
}

const maxEvents = 2_000;
const maxDays = 31;

function validZone(zone: string | undefined) {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

const unescapeText = (value: string) => value.replace(/\\([\\;,nN])/g, (_, character: string) => (character.toLowerCase() === 'n' ? '\n' : character));

function properties(text: string): Property[] {
  return text
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (!match) return [];
      const params = Object.fromEntries(
        match[2]!
          .split(';')
          .filter(Boolean)
          .map((param) => {
            const [key = '', ...value] = param.split('=');
            return [key.toUpperCase(), value.join('=').replace(/^"|"$/g, '')];
          }),
      );
      return [{ name: match[1]!.toUpperCase(), params, value: match[3]!.trim() }];
    });
}

function moment(property: Property | undefined, fallbackZone: string): Moment | null {
  if (!property) return null;
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(property.value);
  if (dateOnly) return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null, zone: fallbackZone };
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}(Z?)$/.exec(property.value);
  if (!dateTime) return null;
  const date = `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`;
  if (dateText(dateValue(date)) !== date) return null;
  return { date, time: `${dateTime[4]}:${dateTime[5]}`, zone: dateTime[6] ? 'Etc/UTC' : (validZone(property.params.TZID) ?? fallbackZone) };
}

function instantOf(at: Moment) {
  const [hour, minute] = (at.time ?? '00:00').split(':').map(Number) as [number, number];
  return zonedInstant(dateValue(at.date).getTime() / dayMs, hour, minute, at.zone);
}

function inZone(instant: Date, zone: string): Moment {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, zone };
}

function durationMs(value: string | undefined) {
  const match = value && /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return null;
  const [, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match.map((part) => Number(part ?? 0));
  return ((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function repeatRule(value: string | undefined) {
  if (!value) return null;
  try {
    return formatRule(parseRule(value));
  } catch (error) {
    if (error instanceof RuleError) return null;
    throw error;
  }
}

function event(block: Property[], index: number, fallbackZone: string): ReadEvent | null {
  const get = (name: string) => block.find((property) => property.name === name);
  if (get('RECURRENCE-ID') || get('STATUS')?.value.toUpperCase() === 'CANCELLED') return null;
  const start = moment(get('DTSTART'), fallbackZone);
  if (!start) return null;
  const duration = durationMs(get('DURATION')?.value);
  let endsOn = start.date;
  let endTime: string | null = null;
  if (!start.time) {
    const end = moment(get('DTEND'), start.zone);
    const exclusive = end ? end.date : duration ? dateText(new Date(dateValue(start.date).getTime() + duration)) : null;
    if (exclusive && exclusive > start.date) endsOn = dateText(new Date(dateValue(exclusive).getTime() - dayMs));
  } else {
    const end = moment(get('DTEND'), start.zone);
    const finish = end?.time ? instantOf(end) : duration !== null ? new Date(instantOf(start).getTime() + duration) : instantOf(start);
    const local = inZone(finish > instantOf(start) ? finish : instantOf(start), start.zone);
    endsOn = local.date;
    endTime = local.time;
  }
  const latestEnd = dateText(new Date(dateValue(start.date).getTime() + maxDays * dayMs));
  if (endsOn > latestEnd) {
    endsOn = latestEnd;
    endTime = start.time ? '23:59' : null;
  }
  const text = (name: string) => unescapeText(get(name)?.value ?? '').trim();
  return {
    uid: get('UID')?.value.slice(0, 500) || `event-${index}`,
    title: text('SUMMARY').slice(0, 200) || 'Busy',
    startsOn: start.date,
    startTime: start.time,
    endsOn,
    endTime,
    timeZone: start.zone,
    repeatRule: repeatRule(get('RRULE')?.value),
    location: text('LOCATION').slice(0, 200) || null,
  };
}

export function readCalendar(text: string, since: Date) {
  const lines = properties(text);
  if (lines[0]?.name !== 'BEGIN' || lines[0].value.toUpperCase() !== 'VCALENDAR') throw new Error('That address is not an iCalendar file');
  const fallbackZone = validZone(lines.find((property) => property.name === 'X-WR-TIMEZONE')?.value) ?? 'Etc/UTC';
  const events: ReadEvent[] = [];
  let block: Property[] | null = null;
  let depth = 0;
  for (const property of lines) {
    if (property.name === 'BEGIN' && property.value.toUpperCase() === 'VEVENT') {
      block = [];
      depth = 0;
      continue;
    }
    if (!block) continue;
    if (property.name === 'BEGIN') depth += 1;
    else if (property.name === 'END' && depth > 0) depth -= 1;
    else if (property.name === 'END' && property.value.toUpperCase() === 'VEVENT') {
      const read = event(block, events.length, fallbackZone);
      if (read && (read.repeatRule || read.endsOn >= dateText(since))) events.push(read);
      block = null;
      if (events.length >= maxEvents) break;
    } else if (depth === 0) block.push(property);
  }
  return { events, name: unescapeText(lines.find((property) => property.name === 'X-WR-CALNAME')?.value ?? '').trim() || null };
}
