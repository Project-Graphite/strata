export interface AgendaEntry {
  kind: 'event' | 'task' | 'renewal';
  itemId: string;
  spaceId: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string | null;
  location: string | null;
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

export function entryTime(entry: AgendaEntry) {
  return entry.allDay ? 'all day' : new Date(entry.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function eventWhen(event: PublicEvent) {
  const day = (text: string) =>
    new Date(`${text}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const start = `${day(event.startsOn)}${event.startTime ? `, ${event.startTime}` : ''}`;
  const end =
    event.endsOn !== event.startsOn ? ` to ${day(event.endsOn)}${event.endTime ? `, ${event.endTime}` : ''}` : event.endTime ? `–${event.endTime}` : '';
  return `${start}${end}${event.startTime ? ` (${event.timeZone.replaceAll('_', ' ')})` : ''}`;
}

export const kindLabels: Record<AgendaEntry['kind'], string> = { event: 'event', task: 'due', renewal: 'renews' };

export function entryLink(entry: AgendaEntry) {
  if (entry.kind === 'event') return `/events/${entry.itemId}`;
  if (entry.kind === 'task') return `/spaces/${entry.spaceId}/tasks`;
  return `/spaces/${entry.spaceId}/recurring`;
}
