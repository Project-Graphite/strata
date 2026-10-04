import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar, ListSkeleton, timeAgo } from '@project-graphite/ui';
import type { Page } from '../api';
import { useAuth } from '../auth';
import { addDays, dayKey, entryLink, entryTime, type AgendaEntry } from '../agenda';
import type { InboxNotification } from '../inbox';
import { useSpaces } from '../spaces';
import { money, shortDate, type Subscription } from '../subscriptions';
import { TaskRow, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

export type WidgetType = 'clock' | 'today' | 'tasks' | 'shortcuts' | 'recurring' | 'inbox' | 'agenda';
export type WidgetSize = 'small' | 'medium' | 'wide' | 'full';

export interface Widget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  settings: Record<string, unknown>;
}

interface WidgetProps {
  settings: Record<string, unknown>;
}

interface SettingsProps extends WidgetProps {
  onChange: (settings: Record<string, unknown>) => void;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-muted">{children}</p>;
}

function Clock({ settings }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const zones = Array.isArray(settings.zones) ? (settings.zones as string[]) : [];
  const time = (timeZone?: string) => now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
  return (
    <div className="grid gap-3">
      <div>
        <p className="m-0 text-3xl text-ink">{time()}</p>
        <p className="mono-sm m-0 mt-1 text-faint">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      {zones.length > 0 && (
        <ul className="m-0 grid list-none gap-1 p-0">
          {zones.map((zone) => (
            <li className="flex justify-between gap-3 text-sm" key={zone}>
              <span className="truncate text-muted">{zone.split('/').pop()!.replaceAll('_', ' ')}</span>
              <span className="text-ink">{time(zone)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClockSettings({ onChange, settings }: SettingsProps) {
  const zones = Array.isArray(settings.zones) ? (settings.zones as string[]) : [];
  const all = Intl.supportedValuesOf('timeZone');
  return (
    <label className="field-label">
      World clocks
      <select
        multiple
        onChange={(event) => onChange({ zones: [...event.currentTarget.selectedOptions].map((option) => option.value).slice(0, 8) })}
        size={6}
        value={zones}
      >
        {all.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function TaskWidget({ path, empty }: { path: string | null; empty: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const tasks = useResource<Task[] | Page<Task>>(path, true);
  const action = useAction();
  if (!path) return <Empty>{empty}</Empty>;
  if (tasks.error) return <p className="error-message m-0">{tasks.error}</p>;
  if (!tasks.data) return <ListSkeleton label="Loading tasks" rows={3} />;
  const list = Array.isArray(tasks.data) ? tasks.data : tasks.data.results;
  if (list.length === 0) return <Empty>Nothing due. Enjoy it.</Empty>;
  return (
    <>
      <ul className="m-0 grid list-none gap-0 p-0">
        {list.slice(0, 8).map((task) => (
          <TaskRow
            disabled={action.busy || spaces.data?.find((space) => space.id === task.spaceId)?.role === 'viewer'}
            key={task.id}
            onEdit={() => navigate(`/spaces/${task.spaceId}/tasks`)}
            onToggle={() =>
              void action.run(async () => {
                await auth.request(`/tasks/${task.id}/complete`, { method: 'POST' });
                tasks.reload();
                return '';
              }, 'Could not update the task')
            }
            task={task}
          />
        ))}
      </ul>
      {action.status}
    </>
  );
}

function Today() {
  return <TaskWidget empty={null} path="/tasks/today" />;
}

function Tasks({ settings }: WidgetProps) {
  const spaceId = typeof settings.spaceId === 'string' ? settings.spaceId : null;
  const listId = typeof settings.listId === 'string' ? settings.listId : null;
  return (
    <TaskWidget
      empty="Choose a space and list in this widget's settings."
      path={spaceId ? `/spaces/${spaceId}/tasks?page=1${listId ? `&listId=${listId}` : ''}` : null}
    />
  );
}

function TasksSettings({ onChange, settings }: SettingsProps) {
  const spaces = useSpaces();
  const spaceId = typeof settings.spaceId === 'string' ? settings.spaceId : '';
  const lists = useResource<TaskList[]>(spaceId ? `/spaces/${spaceId}/lists` : null, true);
  return (
    <div className="grid gap-3">
      <label className="field-label">
        Space
        <select onChange={(event) => onChange({ spaceId: event.currentTarget.value || undefined })} value={spaceId}>
          <option value="">Choose a space</option>
          {(spaces.data ?? []).map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      {spaceId && (
        <label className="field-label">
          List
          <select
            onChange={(event) => onChange({ ...settings, listId: event.currentTarget.value || undefined })}
            value={typeof settings.listId === 'string' ? settings.listId : ''}
          >
            <option value="">All open tasks</option>
            {(lists.data ?? []).map((list) => (
              <option key={list.id} value={list.id}>
                {list.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

interface Shortcut {
  label: string;
  url: string;
}

function Shortcuts({ settings }: WidgetProps) {
  const links = Array.isArray(settings.links) ? (settings.links as Shortcut[]) : [];
  if (links.length === 0) return <Empty>Add links in this widget's settings.</Empty>;
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3 p-0">
      {links.map((link) => (
        <li key={`${link.label}-${link.url}`}>
          <a
            className="grid justify-items-center gap-2 rounded-lg p-2 text-center text-sm text-ink no-underline hover:bg-surface"
            href={link.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Avatar name={link.label} />
            <span className="w-full truncate">{link.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ShortcutsSettings({ onChange, settings }: SettingsProps) {
  const links = Array.isArray(settings.links) ? (settings.links as Shortcut[]) : [];
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('https://');
  const valid = label.trim().length > 0 && label.trim().length <= 40 && /^https:\/\/\S+\.\S+$/.test(url.trim());
  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-1 p-0">
        {links.map((link, index) => (
          <li className="flex items-center justify-between gap-3 text-sm" key={`${link.label}-${index}`}>
            <span className="min-w-0 truncate text-ink">
              {link.label} <span className="text-faint">{link.url}</span>
            </span>
            <button
              className="text-button mono-sm"
              onClick={() => onChange({ links: links.filter((_, kept) => kept !== index) })}
              type="button"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      {links.length < 24 && (
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input aria-label="Shortcut name" maxLength={40} onChange={(event) => setLabel(event.currentTarget.value)} placeholder="Name" value={label} />
          <input aria-label="Shortcut link" inputMode="url" onChange={(event) => setUrl(event.currentTarget.value)} value={url} />
          <button
            className="secondary-button px-3 py-2 text-sm"
            disabled={!valid}
            onClick={() => {
              onChange({ links: [...links, { label: label.trim(), url: url.trim() }] });
              setLabel('');
              setUrl('https://');
            }}
            type="button"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function Recurring() {
  const summary = useResource<{ totals: { currency: string; monthlyMinor: number }[]; upcoming: Subscription[] }>(
    '/subscriptions/summary',
    true,
  );
  if (summary.error) return <p className="error-message m-0">{summary.error}</p>;
  if (!summary.data) return <ListSkeleton label="Adding up your subscriptions" rows={3} />;
  if (summary.data.totals.length === 0) {
    return (
      <Empty>
        No subscriptions yet. <Link to="/recurring">Add some</Link>
      </Empty>
    );
  }
  return (
    <div className="grid gap-3">
      {summary.data.totals.map((total) => (
        <p className="m-0 text-xl text-ink" key={total.currency}>
          {money(total.monthlyMinor, total.currency)} <span className="text-sm text-muted">a month</span>
        </p>
      ))}
      <ul className="m-0 grid list-none gap-1 p-0">
        {summary.data.upcoming.slice(0, 3).map((subscription) => (
          <li className="flex justify-between gap-3 text-sm" key={subscription.id}>
            <span className="truncate text-ink">{subscription.name}</span>
            <span className="mono-sm shrink-0 text-faint">{shortDate(subscription.nextRenewal)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Inbox() {
  const notifications = useResource<Page<InboxNotification>>('/me/inbox?page=1', true);
  if (notifications.error) return <p className="error-message m-0">{notifications.error}</p>;
  if (!notifications.data) return <ListSkeleton label="Loading your inbox" rows={3} />;
  const unread = notifications.data.results.filter((notification) => !notification.read).slice(0, 5);
  if (unread.length === 0) return <Empty>You are all caught up.</Empty>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {unread.map((notification) => (
        <li className="text-sm" key={notification.id}>
          <Link className="text-ink no-underline hover:underline" to={notification.link ?? '/inbox'}>
            {notification.title}
          </Link>
          <span className="mono-sm block text-faint">{timeAgo(notification.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function Agenda() {
  const today = dayKey(new Date());
  const agenda = useResource<AgendaEntry[]>(`/agenda?from=${today}&to=${addDays(today, 7)}`, true);
  if (agenda.error) return <p className="error-message m-0">{agenda.error}</p>;
  if (!agenda.data) return <ListSkeleton label="Loading your agenda" rows={3} />;
  if (agenda.data.length === 0) return <Empty>Nothing in the next seven days.</Empty>;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {agenda.data.slice(0, 6).map((entry) => (
        <li className="text-sm" key={`${entry.kind}-${entry.itemId}-${entry.start}`}>
          <Link className="text-ink no-underline hover:underline" to={entryLink(entry)}>
            {entry.title}
          </Link>
          <span className="mono-sm block text-faint">
            {new Date(`${entry.allDay ? entry.start : dayKey(new Date(entry.start))}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} {entryTime(entry)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const widgetKinds: Record<
  WidgetType,
  { title: string; size: WidgetSize; settings: Record<string, unknown>; View: (props: WidgetProps) => ReactNode; Settings?: (props: SettingsProps) => ReactNode }
> = {
  clock: { title: 'Clock', size: 'small', settings: {}, View: Clock, Settings: ClockSettings },
  today: { title: 'Today', size: 'medium', settings: {}, View: Today },
  tasks: { title: 'Task list', size: 'medium', settings: {}, View: Tasks, Settings: TasksSettings },
  shortcuts: { title: 'Shortcuts', size: 'wide', settings: { links: [] }, View: Shortcuts, Settings: ShortcutsSettings },
  recurring: { title: 'Renewals and spend', size: 'small', settings: {}, View: Recurring },
  inbox: { title: 'Inbox', size: 'medium', settings: {}, View: Inbox },
  agenda: { title: 'Agenda', size: 'medium', settings: {}, View: Agenda },
};
