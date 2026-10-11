import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar, ListSkeleton, timeAgo } from '@project-graphite/ui';
import type { Page } from '../api';
import { useAuth } from '../auth';
import { siteLabel, type Bookmark } from '../bookmarks';
import { fileSize } from '../files';
import { HabitRow, type Habit } from '../habits';
import { noteTitle, type Note } from '../notes';
import { addDays, dayKey, entryLink, entryTime, type AgendaEntry } from '../agenda';
import type { InboxNotification } from '../inbox';
import { useSpaces } from '../spaces';
import { money, shortDate, type Subscription } from '../subscriptions';
import { TaskRow, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { BoardPreview } from '../components/BoardPreview';
import { LoadError } from '../components/LoadError';
import { Capture } from './capture-widget';
import { News, NewsSettings, projectGraphiteSites, SiteStatus, SiteStatusSettings, Weather, WeatherSettings } from './outside-widgets';
import { quoteFor } from './quotes';
import { Empty, type SettingsProps, type WidgetProps } from './widget-parts';

export type WidgetType = 'clock' | 'today' | 'tasks' | 'shortcuts' | 'recurring' | 'inbox' | 'agenda' | 'countdown' | 'focus' | 'tidy' | 'weather' | 'news' | 'capture' | 'habits' | 'pages' | 'board' | 'bookmarks' | 'status' | 'quote';
export type WidgetSize = 'small' | 'medium' | 'wide' | 'full';

export interface Widget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  settings: Record<string, unknown>;
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
  if (tasks.error) return <LoadError compact error={tasks.error} onRetry={tasks.reload} />;
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
  const address = /^[a-z][a-z\d+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const valid = label.trim().length > 0 && label.trim().length <= 40 && /^https:\/\/\S+\.\S+$/.test(address);
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
              onChange({ links: [...links, { label: label.trim(), url: address }] });
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
  if (summary.error) return <LoadError compact error={summary.error} onRetry={summary.reload} />;
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
  if (notifications.error) return <LoadError compact error={notifications.error} onRetry={notifications.reload} />;
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
  if (agenda.error) return <LoadError compact error={agenda.error} onRetry={agenda.reload} />;
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

function Quote() {
  const [text, author] = quoteFor(dayKey(new Date()));
  return (
    <figure className="m-0 grid gap-2">
      <blockquote className="m-0 text-lg text-ink">“{text}”</blockquote>
      <figcaption className="mono-sm text-faint">{author}</figcaption>
    </figure>
  );
}

function Countdown({ settings }: WidgetProps) {
  const label = typeof settings.label === 'string' && settings.label ? settings.label : 'the day';
  if (typeof settings.date !== 'string') return <Empty>Choose a date in this widget's settings.</Empty>;
  const days = Math.round((new Date(`${settings.date}T00:00:00`).getTime() - new Date(`${dayKey(new Date())}T00:00:00`).getTime()) / 86_400_000);
  return (
    <div>
      <p className="m-0 text-3xl text-ink">{days === 0 ? 'Today' : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`}</p>
      <p className="mono-sm m-0 mt-1 text-faint">
        {days === 0 ? `${label} is today` : days > 0 ? `until ${label}` : `since ${label}`} · {shortDate(settings.date)}
      </p>
    </div>
  );
}

function CountdownSettings({ onChange, settings }: SettingsProps) {
  return (
    <div className="grid gap-3">
      <label className="field-label">
        Label
        <input maxLength={60} onChange={(event) => onChange({ ...settings, label: event.currentTarget.value })} value={typeof settings.label === 'string' ? settings.label : ''} />
      </label>
      <label className="field-label">
        Date
        <input
          onChange={(event) => onChange({ ...settings, date: event.currentTarget.value || undefined })}
          type="date"
          value={typeof settings.date === 'string' ? settings.date : ''}
        />
      </label>
    </div>
  );
}

const minuteMs = 60_000;

function Focus({ settings }: WidgetProps) {
  const focusMinutes = typeof settings.minutes === 'number' ? settings.minutes : 25;
  const breakMinutes = typeof settings.breakMinutes === 'number' ? settings.breakMinutes : 5;
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [left, setLeft] = useState(focusMinutes * minuteMs);
  const [endsAt, setEndsAt] = useState<number>();

  useEffect(() => {
    if (endsAt === undefined) return;
    const timer = window.setInterval(() => {
      const remaining = endsAt - Date.now();
      if (remaining > 0) {
        setLeft(remaining);
        return;
      }
      const next = phase === 'focus' ? 'break' : 'focus';
      setPhase(next);
      setEndsAt(undefined);
      setLeft((next === 'focus' ? focusMinutes : breakMinutes) * minuteMs);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [endsAt, phase, focusMinutes, breakMinutes]);

  const seconds = Math.ceil(left / 1_000);
  return (
    <div className="grid gap-3">
      <div>
        <p className="m-0 text-3xl text-ink" role="timer">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </p>
        <p className="mono-sm m-0 mt-1 text-faint">{phase === 'focus' ? 'Focus' : 'Break'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="secondary-button px-3 py-2 text-sm" onClick={() => setEndsAt(endsAt === undefined ? Date.now() + left : undefined)} type="button">
          {endsAt === undefined ? 'Start' : 'Pause'}
        </button>
        <button
          className="secondary-button px-3 py-2 text-sm"
          onClick={() => {
            setEndsAt(undefined);
            setPhase('focus');
            setLeft(focusMinutes * minuteMs);
          }}
          type="button"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function FocusSettings({ onChange, settings }: SettingsProps) {
  const choice = (key: 'minutes' | 'breakMinutes', label: string, options: number[], fallback: number) => (
    <label className="field-label">
      {label}
      <select onChange={(event) => onChange({ ...settings, [key]: Number(event.currentTarget.value) })} value={typeof settings[key] === 'number' ? settings[key] : fallback}>
        {options.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes} minutes
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {choice('minutes', 'Focus', [15, 25, 50], 25)}
      {choice('breakMinutes', 'Break', [5, 10, 15], 5)}
    </div>
  );
}

interface TidyScanSummary {
  files: { duplicates: { savingBytes: number; items: unknown[] }[]; old: unknown[] };
  subscriptions: { unused: { id: string }[]; duplicates: { items: { id: string }[] }[]; overlapping: { items: { id: string }[] }[] };
}

function Habits() {
  const habits = useResource<Habit[]>('/me/habits', true);
  if (habits.error) return <LoadError error={habits.error} onRetry={habits.reload} />;
  if (!habits.data) return <ListSkeleton label="Loading your habits" rows={3} />;
  if (habits.data.length === 0) return <Empty>No habits yet. Add them in a space’s Habits tab.</Empty>;
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {habits.data.map((habit) => (
        <li key={habit.id}>
          <HabitRow habit={habit} onChange={(next) => habits.mutate((current) => current.map((shown) => (shown.id === next.id ? next : shown)))} showSpace />
        </li>
      ))}
    </ul>
  );
}

function PageLinks({ heading, pages }: { heading: string; pages: Note[] }) {
  const spaces = useSpaces();
  return (
    <section className="grid gap-1">
      <h3 className="mono-sm m-0 text-faint">{heading}</h3>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {pages.map((page) => (
          <li className="text-sm" key={page.id}>
            <Link className="text-ink no-underline hover:underline" to={`/notes/${page.id}`}>
              {page.icon ? `${page.icon} ` : ''}
              {page.title || 'Untitled'}
            </Link>
            <span className="mono-sm block text-faint">
              {spaces.data?.find((space) => space.id === page.spaceId)?.name} · {timeAgo(page.updatedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Board({ settings }: WidgetProps) {
  const boardId = typeof settings.boardId === 'string' ? settings.boardId : null;
  if (!boardId) return <Empty>Choose a board in this widget's settings.</Empty>;
  return (
    <Link className="block no-underline" to={`/notes/${boardId}`}>
      <BoardPreview boardId={boardId} key={boardId} label="Board preview" />
    </Link>
  );
}

function BoardSettings({ onChange, settings }: SettingsProps) {
  const boards = useResource<Note[]>('/me/notes?kind=board', true);
  return (
    <label className="field-label">
      Board
      <select onChange={(event) => onChange({ boardId: event.currentTarget.value || undefined })} value={typeof settings.boardId === 'string' ? settings.boardId : ''}>
        <option value="">Choose a board</option>
        {(boards.data ?? []).map((board) => (
          <option key={board.id} value={board.id}>
            {noteTitle(board)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Pages() {
  const pages = useResource<{ pinned: Note[]; recent: Note[] }>('/me/pages', true);
  if (pages.error) return <LoadError compact error={pages.error} onRetry={pages.reload} />;
  if (!pages.data) return <ListSkeleton label="Loading your pages" rows={4} />;
  const { pinned, recent } = pages.data;
  if (pinned.length === 0 && recent.length === 0) return <Empty>No pages yet. Write one in a space’s Notes tab.</Empty>;
  return (
    <div className="grid gap-3">
      {pinned.length > 0 && <PageLinks heading="Pinned" pages={pinned} />}
      {recent.length > 0 && <PageLinks heading="Recently edited" pages={recent} />}
    </div>
  );
}

function ReadLater() {
  const bookmarks = useResource<Bookmark[]>('/me/bookmarks?status=unread', true);
  if (bookmarks.error) return <LoadError compact error={bookmarks.error} onRetry={bookmarks.reload} />;
  if (!bookmarks.data) return <ListSkeleton label="Loading your reading list" rows={3} />;
  if (bookmarks.data.length === 0) return <Empty>Nothing to read later. Save links on the Bookmarks page.</Empty>;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {bookmarks.data.slice(0, 5).map((bookmark) => (
        <li className="text-sm" key={bookmark.id}>
          <Link className="text-ink no-underline hover:underline" to={`/bookmarks/${bookmark.id}`}>
            {bookmark.title}
          </Link>
          <span className="mono-sm block text-faint">
            {siteLabel(bookmark)} · saved {timeAgo(bookmark.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Tidy() {
  const scan = useResource<TidyScanSummary>('/tidy/scan', true);
  const history = useResource<{ createdAt: string }[]>('/tidy/history', true);
  if (scan.error) return <LoadError compact error={scan.error} onRetry={scan.reload} />;
  if (!scan.data) return <ListSkeleton label="Looking for clutter" rows={2} />;
  const { files, subscriptions } = scan.data;
  const copies = files.duplicates.reduce((total, group) => total + group.items.length - 1, 0);
  const saving = files.duplicates.reduce((total, group) => total + group.savingBytes, 0);
  const toCheck = new Set(
    [...subscriptions.unused, ...subscriptions.duplicates.flatMap((group) => group.items), ...subscriptions.overlapping.flatMap((group) => group.items)].map(
      (entry) => entry.id,
    ),
  ).size;
  const findings = [
    copies ? `${copies} extra cop${copies === 1 ? 'y' : 'ies'} (${fileSize(saving)})` : '',
    files.old.length ? `${files.old.length} old upload${files.old.length === 1 ? '' : 's'}` : '',
    toCheck ? `${toCheck} subscription${toCheck === 1 ? '' : 's'} to check` : '',
  ].filter(Boolean);
  const last = history.data?.[0];
  return (
    <div className="grid gap-2 text-sm">
      {findings.length ? (
        <ul className="m-0 grid list-none gap-1 p-0">
          {findings.map((finding) => (
            <li className="text-ink" key={finding}>
              {finding}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing to tidy.</Empty>
      )}
      <p className="mono-sm m-0 text-faint">{last ? `Last tidied ${timeAgo(last.createdAt)}` : 'Not tidied yet'}</p>
      <Link className="w-fit text-ink" to="/tidy">
        Open Tidy
      </Link>
    </div>
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
  countdown: { title: 'Countdown', size: 'small', settings: {}, View: Countdown, Settings: CountdownSettings },
  focus: { title: 'Focus timer', size: 'small', settings: { minutes: 25, breakMinutes: 5 }, View: Focus, Settings: FocusSettings },
  tidy: { title: 'Tidy status', size: 'small', settings: {}, View: Tidy },
  weather: { title: 'Weather', size: 'small', settings: { unit: 'celsius' }, View: Weather, Settings: WeatherSettings },
  news: { title: 'News', size: 'medium', settings: { feeds: [], count: 5 }, View: News, Settings: NewsSettings },
  capture: { title: 'Quick note', size: 'medium', settings: {}, View: Capture },
  habits: { title: 'Habits', size: 'medium', settings: {}, View: Habits },
  pages: { title: 'Pinned and recent pages', size: 'medium', settings: {}, View: Pages },
  board: { title: 'Board', size: 'wide', settings: {}, View: Board, Settings: BoardSettings },
  bookmarks: { title: 'Read later', size: 'medium', settings: {}, View: ReadLater },
  status: { title: 'Are my apps up?', size: 'medium', settings: { sites: projectGraphiteSites }, View: SiteStatus, Settings: SiteStatusSettings },
  quote: { title: 'Quote of the day', size: 'medium', settings: {}, View: Quote },
};
