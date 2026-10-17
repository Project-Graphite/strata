import { useEffect } from 'react';
import { formatDay, type TagColor } from '@project-graphite/ui';
import { useAuth } from './auth';
import { clockTime, zoneLabel } from './time';
import { useResource } from './useResource';

export interface AgendaEntry {
  kind: 'event' | 'task' | 'renewal' | 'external' | 'birthday' | 'payment';
  itemId: string;
  spaceId: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string | null;
  location: string | null;
  calendar?: string;
  calendarId?: string;
  uid?: string;
}

export interface CalendarEvent {
  uid: string;
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  timeZone: string;
  repeatRule: string | null;
  location: string | null;
  description: string;
  meetingUrl: string | null;
  organizer: string | null;
  calendar: { id: string; spaceId: string; name: string; host: string };
}

const kindColours: Record<Exclude<AgendaEntry['kind'], 'external'>, TagColor> = { event: 'blue', task: 'yellow', renewal: 'green', birthday: 'pink', payment: 'orange' };
const calendarColours: TagColor[] = ['purple', 'teal', 'red', 'green', 'orange', 'blue'];

export function useAgenda(from: string, to: string) {
  const { request } = useAuth();
  const agenda = useResource<AgendaEntry[]>(`/agenda?from=${from}&to=${to}`, true, { live: ['items', 'tasks', 'subscriptions', 'spending'] });
  const calendars = useResource<{ id: string }[]>('/me/calendars', true);
  const { reload } = agenda;
  useEffect(() => {
    void request<{ refreshed: number }>('/me/calendars/refresh', { method: 'POST' }).then(({ refreshed }) => refreshed > 0 && reload());
  }, [request, reload]);
  const colourOf = (entry: AgendaEntry): TagColor =>
    entry.kind === 'external'
      ? calendarColours[Math.max(0, calendars.data?.findIndex((calendar) => calendar.id === entry.calendarId) ?? 0) % calendarColours.length]!
      : kindColours[entry.kind];
  return { ...agenda, colourOf };
}

export function useTodaySchedule() {
  const today = dayKey(new Date());
  const agenda = useAgenda(today, addDays(today, 1));
  return { ...agenda, data: agenda.data?.filter((entry) => entry.kind !== 'task') };
}

export interface PublicEvent {
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  timeZone: string;
  repeatRule: string | null;
  location: string | null;
  meetingUrl: string | null;
  description: string;
}

export interface Guest {
  id: string;
  name: string;
  email: string | null;
  response: 'pending' | 'yes' | 'no' | 'maybe';
  note: string | null;
  respondedAt: string | null;
}

export interface EventDetails extends PublicEvent {
  id: string;
  spaceId: string;
  reminderMinutes: number | null;
  guests: Guest[];
  headcount: Record<Guest['response'], number>;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function shiftMonth(month: string, by: number) {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
}

export function monthDays(anchor: string) {
  const date = new Date(`${anchor}T00:00:00`);
  const first = dayKey(new Date(date.getFullYear(), date.getMonth(), 1));
  const from = addDays(first, -((new Date(`${first}T00:00:00`).getDay() + 6) % 7));
  return { from, to: addDays(from, 42), days: 42 };
}

export function entryDay(entry: AgendaEntry) {
  return entry.allDay ? entry.start : dayKey(new Date(entry.start));
}

export function dayRange(from: string, to: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`));
}

export const entryClock = (at: string) => clockTime(new Date(at));

export function entryTime(entry: AgendaEntry) {
  if (entry.allDay) return 'all day';
  return entry.end && entry.end !== entry.start ? `${entryClock(entry.start)}–${entryClock(entry.end)}` : entryClock(entry.start);
}

export function entryWhen(entry: AgendaEntry) {
  const day = (at: Date) => formatDay(dayKey(at), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (entry.allDay) {
    const start = day(new Date(`${entry.start}T00:00:00`));
    return entry.end && entry.end !== entry.start ? `${start} to ${day(new Date(`${entry.end}T00:00:00`))}` : `${start}, all day`;
  }
  if (entry.end && dayKey(new Date(entry.end)) !== dayKey(new Date(entry.start))) {
    return `${day(new Date(entry.start))}, ${entryClock(entry.start)} to ${day(new Date(entry.end))}, ${entryClock(entry.end)}`;
  }
  return `${day(new Date(entry.start))}, ${entryTime(entry)}`;
}

export function eventWhen(event: PublicEvent) {
  const day = (text: string) =>
    formatDay(text, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const start = `${day(event.startsOn)}${event.startTime ? `, ${clockTime(event.startTime)}` : ''}`;
  const end =
    event.endsOn !== event.startsOn ? ` to ${day(event.endsOn)}${event.endTime ? `, ${clockTime(event.endTime)}` : ''}` : event.endTime ? `–${clockTime(event.endTime)}` : '';
  const zone = event.startTime ? zoneLabel(event.timeZone) : '';
  return `${start}${end}${zone ? ` (${zone})` : ''}`;
}

export const kindLabels: Record<AgendaEntry['kind'], string> = { event: 'event', task: 'due', renewal: 'renews', external: 'calendar', birthday: 'birthday', payment: 'payment' };

export function entryLink(entry: AgendaEntry) {
  if (entry.kind === 'event') return `/events/${entry.itemId}`;
  if (entry.kind === 'task') return `/tasks?task=${entry.itemId}`;
  if (entry.kind === 'birthday') return `/people/${entry.itemId}`;
  if (entry.kind === 'payment') return `/spending/accounts?space=${entry.spaceId}`;
  return `/spending/recurring?subscription=${entry.itemId}`;
}
