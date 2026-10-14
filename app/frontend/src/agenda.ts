import { useEffect } from 'react';
import { useAuth } from './auth';
import { clockTime, timeOptions } from './time';
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

const kindColours: Record<Exclude<AgendaEntry['kind'], 'external'>, string> = { event: '#82aaff', task: '#d7a54a', renewal: '#46b97a', birthday: '#e88fb8', payment: '#e0795f' };
const calendarColours = ['#c792ea', '#5fc4c4', '#f2a09a', '#a6d189', '#ffb86c', '#89b4fa'];

export function useAgenda(from: string, to: string) {
  const { request } = useAuth();
  const agenda = useResource<AgendaEntry[]>(`/agenda?from=${from}&to=${to}`, true);
  const calendars = useResource<{ id: string }[]>('/me/calendars', true);
  const { reload } = agenda;
  useEffect(() => {
    void request<{ refreshed: number }>('/me/calendars/refresh', { method: 'POST' }).then(({ refreshed }) => refreshed > 0 && reload());
  }, [request, reload]);
  const colourOf = (entry: AgendaEntry) =>
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

export function monthDays(anchor: string) {
  const date = new Date(`${anchor}T00:00:00`);
  const first = dayKey(new Date(date.getFullYear(), date.getMonth(), 1));
  const from = addDays(first, -((new Date(`${first}T00:00:00`).getDay() + 6) % 7));
  return { from, to: addDays(from, 42), days: 42 };
}

export function entryDay(entry: AgendaEntry) {
  return entry.allDay ? entry.start : dayKey(new Date(entry.start));
}

export const clock = (at: string) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...timeOptions() });

export function entryTime(entry: AgendaEntry) {
  if (entry.allDay) return 'all day';
  return entry.end && entry.end !== entry.start ? `${clock(entry.start)}–${clock(entry.end)}` : clock(entry.start);
}

export function entryWhen(entry: AgendaEntry) {
  const day = (at: Date) => at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (entry.allDay) {
    const start = day(new Date(`${entry.start}T00:00:00`));
    return entry.end && entry.end !== entry.start ? `${start} to ${day(new Date(`${entry.end}T00:00:00`))}` : `${start}, all day`;
  }
  if (entry.end && dayKey(new Date(entry.end)) !== dayKey(new Date(entry.start))) {
    return `${day(new Date(entry.start))}, ${clock(entry.start)} to ${day(new Date(entry.end))}, ${clock(entry.end)}`;
  }
  return `${day(new Date(entry.start))}, ${entryTime(entry)}`;
}

export function eventWhen(event: PublicEvent) {
  const day = (text: string) =>
    new Date(`${text}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const start = `${day(event.startsOn)}${event.startTime ? `, ${clockTime(event.startTime)}` : ''}`;
  const end =
    event.endsOn !== event.startsOn ? ` to ${day(event.endsOn)}${event.endTime ? `, ${clockTime(event.endTime)}` : ''}` : event.endTime ? `–${clockTime(event.endTime)}` : '';
  return `${start}${end}${event.startTime ? ` (${event.timeZone.replaceAll('_', ' ')})` : ''}`;
}

export const kindLabels: Record<AgendaEntry['kind'], string> = { event: 'event', task: 'due', renewal: 'renews', external: 'calendar', birthday: 'birthday', payment: 'payment' };

export function entryLink(entry: AgendaEntry) {
  if (entry.kind === 'event') return `/events/${entry.itemId}`;
  if (entry.kind === 'task') return `/spaces/${entry.spaceId}/tasks`;
  if (entry.kind === 'birthday') return `/people/${entry.itemId}`;
  if (entry.kind === 'payment') return `/spending?space=${entry.spaceId}`;
  return `/spaces/${entry.spaceId}/recurring`;
}
