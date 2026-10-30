import { useCallback, useEffect } from 'react';
import type { TagColor } from '@project-graphite/ui';
import { useAuth } from './auth';
import { clockTime, formatDate, profileClock, profileDay, zoneLabel } from './time';
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

export type AgendaView = 'day' | 'week' | 'month' | 'list';

export const phoneQuery = '(max-width: 47.99rem)';

export const agendaPath = (from: string, to: string) => `/agenda?from=${from}&to=${to}`;

const kindColours: Record<Exclude<AgendaEntry['kind'], 'external'>, TagColor> = { event: 'blue', task: 'yellow', renewal: 'green', birthday: 'pink', payment: 'orange' };
const calendarColours: TagColor[] = ['purple', 'teal', 'red', 'green', 'orange', 'blue'];

const calendarRefreshEvery = 15 * 60_000;
let calendarRefresh: { at: number; refreshed: Promise<number> } | undefined;

function refreshCalendars(request: ReturnType<typeof useAuth>['request']) {
  if (!calendarRefresh || Date.now() - calendarRefresh.at >= calendarRefreshEvery) {
    calendarRefresh = {
      at: Date.now(),
      refreshed: request<{ refreshed: number }>('/me/calendars/refresh', { method: 'POST' }).then(({ refreshed }) => refreshed, () => 0),
    };
  }
  return calendarRefresh.refreshed;
}

export function useAgenda(from: string, to: string) {
  const { request } = useAuth();
  const agenda = useResource<AgendaEntry[]>(agendaPath(from, to), true, { live: ['items', 'tasks', 'subscriptions', 'spending'] });
  const calendars = useResource<{ id: string }[]>('/me/calendars', true);
  const { reload } = agenda;
  useEffect(() => {
    const refresh = () => void refreshCalendars(request).then((refreshed) => refreshed > 0 && reload());
    refresh();
    const timer = window.setInterval(refresh, calendarRefreshEvery);
    return () => window.clearInterval(timer);
  }, [request, reload]);
  const colourOf = useCallback(
    (entry: AgendaEntry): TagColor =>
      entry.kind === 'external'
        ? calendarColours[Math.max(0, calendars.data?.findIndex((calendar) => calendar.id === entry.calendarId) ?? 0) % calendarColours.length]!
        : kindColours[entry.kind],
    [calendars.data],
  );
  return { ...agenda, colourOf };
}

export function useTodaySchedule() {
  const today = profileDay();
  const agenda = useAgenda(today, addDays(today, 7));
  return { ...agenda, data: agenda.data?.filter((entry) => entry.kind !== 'task' && (entry.allDay ? entry.start : profileDay(entry.start)) <= today) };
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

export const weekOf = (day: string, weekStart: number) => addDays(day, -((new Date(`${day}T00:00:00`).getDay() - weekStart + 7) % 7));

export function monthDays(anchor: string, weekStart: number) {
  const date = new Date(`${anchor}T00:00:00`);
  const from = weekOf(dayKey(new Date(date.getFullYear(), date.getMonth(), 1)), weekStart);
  return { from, to: addDays(from, 42), days: 42 };
}

export function agendaPeriod(view: AgendaView, anchor: string, weekStart: number, phone: boolean) {
  if (view === 'month') return monthDays(anchor, weekStart);
  const [from, days] = view === 'list' ? [anchor, 30] : view === 'day' ? [anchor, 1] : phone ? [anchor, 3] : [weekOf(anchor, weekStart), 7];
  return { from, to: addDays(from, days), days };
}

export const entryKey = (entry: AgendaEntry) => `${entry.kind}-${entry.itemId}-${entry.start}`;

export function entryDay(entry: AgendaEntry) {
  return entry.allDay ? entry.start : profileDay(entry.start);
}

export function dayRange(from: string, to: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`));
}

export const entryClock = profileClock;

export function entryTime(entry: AgendaEntry) {
  if (entry.allDay) return 'all day';
  return entry.end && entry.end !== entry.start ? `${entryClock(entry.start)}–${entryClock(entry.end)}` : entryClock(entry.start);
}

export function entryWhen(entry: AgendaEntry) {
  if (entry.allDay) {
    return entry.end && entry.end !== entry.start ? `${formatDate(entry.start)} to ${formatDate(entry.end)}` : `${formatDate(entry.start)}, all day`;
  }
  const day = (at: string) => formatDate(profileDay(at));
  if (entry.end && profileDay(entry.end) !== profileDay(entry.start)) {
    return `${day(entry.start)} ${entryClock(entry.start)} to ${day(entry.end)} ${entryClock(entry.end)}`;
  }
  return `${day(entry.start)} ${entryTime(entry)}`;
}

export function eventWhen(event: PublicEvent) {
  const end = event.endsOn !== event.startsOn ? ` to ${formatDate(event.endsOn, event.endTime)}` : event.endTime ? `–${clockTime(event.endTime)}` : '';
  const zone = event.startTime ? zoneLabel(event.timeZone) : '';
  return `${formatDate(event.startsOn, event.startTime)}${end}${zone ? ` (${zone})` : ''}`;
}

export const kindLabels: Record<AgendaEntry['kind'], string> = { event: 'event', task: 'due', renewal: 'renews', external: 'calendar', birthday: 'birthday', payment: 'payment' };

export function entryLink(entry: AgendaEntry) {
  if (entry.kind === 'event') return `/events/${entry.itemId}`;
  if (entry.kind === 'task') return `/tasks?task=${entry.itemId}`;
  if (entry.kind === 'birthday') return `/people/${entry.itemId}`;
  if (entry.kind === 'payment') return `/spending/accounts?space=${entry.spaceId}`;
  return `/spending/recurring?subscription=${entry.itemId}`;
}
