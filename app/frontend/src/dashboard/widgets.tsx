import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, DatePicker, formatDay, Placeholder, Select, Skeleton, TagChip, TextField, timeAgo, type TagColor } from '@project-graphite/ui';
import type { Page } from '../api';
import { useAuth } from '../auth';
import { siteLabel, type Bookmark } from '../bookmarks';
import { fileSize } from '../files';
import { HabitRow, type Habit } from '../habits';
import { noteTitle, type Note } from '../notes';
import { addDays, dayKey, entryDay, entryTime, useAgenda, useTodaySchedule } from '../agenda';
import { useInbox, type InboxNotification } from '../inbox';
import { timeZoneOptions } from '../choices';
import { spaceOptions, useSpaces } from '../spaces';
import { money, shortDate, type Subscription } from '../subscriptions';
import { completeTask, TaskRow, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { AgendaCard, AgendaEntryLink } from '../components/AgendaEntryLink';
import { BoardPreview } from '../components/BoardPreview';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { QuickAddTask } from '../components/QuickAddTask';
import { OpenTask } from '../components/TaskEditor';
import { Capture } from './capture-widget';
import { PaymentsWidget, SavingsWidget, SpendingWidget } from './money-widgets';
import { News, NewsSettings, Weather, WeatherSettings } from './outside-widgets';
import { quoteFor } from './quotes';
import {
  AgendaCardsSkeleton,
  LinkRowsSkeleton,
  PageLinks,
  PageLinksSkeleton,
  SkeletonLine,
  SplitRowsSkeleton,
  TaskRowsSkeleton,
  type SettingsProps,
  type WidgetProps,
} from './widget-parts';
import { clockTime } from '../time';
import { Button, TextButton } from '../components/Button';

export type WidgetType = 'clock' | 'today' | 'tasks' | 'shortcuts' | 'recurring' | 'inbox' | 'agenda' | 'countdown' | 'focus' | 'tidy' | 'weather' | 'news' | 'capture' | 'habits' | 'pages' | 'board' | 'bookmarks' | 'quote' | 'spending' | 'payments' | 'savings';
export const widgetGroups = ['Your day', 'Money', 'Notes and links', 'Around you'] as const;
export type WidgetGroup = (typeof widgetGroups)[number];
export type WidgetSize = 'small' | 'medium' | 'wide' | 'full';

export type CardPadding = 'compact' | 'normal' | 'roomy';

export interface Widget {
  id: string;
  type: WidgetType;
  size?: WidgetSize;
  x?: number;
  y?: number;
  w?: number;
  h?: number | null;
  title?: string;
  hideTitle?: boolean;
  accent?: TagColor;
  padding?: CardPadding;
  settings: Record<string, unknown>;
}

export type PlacedWidget = Widget & { x: number; y: number; w: number };

function Clock({ settings }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const zones = Array.isArray(settings.zones) ? (settings.zones as string[]) : [];
  return (
    <div className="grid gap-3">
      <div>
        <p className="m-0 text-3xl text-ink">{clockTime(now)}</p>
        <p className="mono-sm m-0 mt-1 text-faint">
          {formatDay(dayKey(now), { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      {zones.length > 0 && (
        <ul className="m-0 grid list-none gap-1 p-0">
          {zones.map((zone) => (
            <li className="flex justify-between gap-3 text-sm" key={zone}>
              <span className="truncate text-muted">{zone.split('/').pop()!.replaceAll('_', ' ')}</span>
              <span className="text-ink">{clockTime(now, zone)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClockSettings({ onChange, settings }: SettingsProps) {
  const zones = Array.isArray(settings.zones) ? (settings.zones as string[]) : [];
  const options = timeZoneOptions();
  return (
    <div className="grid gap-2">
      <Select
        disabled={zones.length >= 8}
        hint={zones.length >= 8 ? 'Up to 8 clocks.' : undefined}
        label="World clocks"
        onChange={(zone) => onChange({ zones: [...zones, zone] })}
        options={options.filter((option) => !zones.includes(option.value))}
        placeholder="Add a city"
        searchable
        size="small"
        value=""
      />
      {zones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {zones.map((zone) => (
            <TagChip
              key={zone}
              label={options.find((option) => option.value === zone)?.label ?? zone}
              onRemove={() => onChange({ zones: zones.filter((shown) => shown !== zone) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TasksSkeleton({ adding }: { adding: boolean }) {
  return (
    <Placeholder className="grid gap-2" label="Loading tasks">
      {adding && <Skeleton className="h-12 rounded-lg" />}
      <TaskRowsSkeleton rows={3} />
    </Placeholder>
  );
}

function TaskWidget({ add, path, quiet = false }: { add?: { spaceId: string; listId?: string }; path: string; quiet?: boolean }) {
  const auth = useAuth();
  const spaces = useSpaces();
  const tasks = useResource<Task[] | Page<Task>>(path, true, { live: ['tasks', 'items'] });
  const action = useAction();
  const [opened, setOpened] = useState<Task>();
  if (tasks.error) return <LoadError compact error={tasks.error} onRetry={tasks.reload} />;
  if (!tasks.data) return <TasksSkeleton adding={Boolean(add)} />;
  const list = Array.isArray(tasks.data) ? tasks.data : tasks.data.results;
  return (
    <div className="fade-in grid gap-2">
      {add && <QuickAddTask listId={add.listId} onAdded={tasks.reload} spaceId={add.spaceId} />}
      {list.length === 0 && !quiet && <Hint>{add ? 'Nothing to do.' : 'Nothing due. Enjoy it.'}</Hint>}
      {list.length > 0 && (
        <ul className="panel-rows">
          {list.slice(0, 8).map((task) => (
            <TaskRow
              disabled={action.busy || spaces.data?.find((space) => space.id === task.spaceId)?.role === 'viewer'}
              key={task.id}
              onEdit={() => setOpened(task)}
              onToggle={() => void action.run(() => completeTask(auth.request, task, tasks.reload), 'Could not update the task')}
              task={task}
            />
          ))}
        </ul>
      )}
      {opened && <OpenTask onChanged={tasks.reload} onClose={() => setOpened(undefined)} task={opened} />}
    </div>
  );
}

function Today() {
  const schedule = useTodaySchedule();
  if (schedule.error) return <LoadError compact error={schedule.error} onRetry={schedule.reload} />;
  if (!schedule.data) {
    return (
      <Placeholder className="grid gap-3" label="Loading today">
        <AgendaCardsSkeleton rows={2} />
        <TaskRowsSkeleton rows={2} />
      </Placeholder>
    );
  }
  return (
    <div className="grid gap-3">
      {schedule.data.length > 0 && (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {schedule.data.map((entry) => (
            <li key={`${entry.kind}-${entry.itemId}-${entry.start}`}>
              <AgendaCard colour={schedule.colourOf(entry)} entry={entry} />
            </li>
          ))}
        </ul>
      )}
      <TaskWidget path="/tasks/today" quiet={schedule.data.length > 0} />
    </div>
  );
}

function useTodoSpaceId(settings: Record<string, unknown>) {
  const spaces = useSpaces();
  return typeof settings.spaceId === 'string' ? settings.spaceId : spaces.data?.find((space) => space.kind === 'personal')?.id;
}

function Tasks({ settings }: WidgetProps) {
  const spaces = useSpaces();
  const spaceId = useTodoSpaceId(settings);
  const listId = typeof settings.listId === 'string' ? settings.listId : undefined;
  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  if (!spaceId) return <TasksSkeleton adding />;
  return (
    <TaskWidget
      add={space && space.role !== 'viewer' ? { spaceId, listId } : undefined}
      key={`${spaceId}/${listId ?? ''}`}
      path={`/spaces/${spaceId}/tasks?page=1${listId ? `&listId=${listId}` : ''}`}
    />
  );
}

function TasksSettings({ onChange, settings }: SettingsProps) {
  const spaces = useSpaces();
  const spaceId = useTodoSpaceId(settings) ?? '';
  const lists = useResource<TaskList[]>(spaceId ? `/spaces/${spaceId}/lists` : null, true);
  return (
    <div className="grid gap-3">
      <Select label="Space" onChange={(chosen) => onChange({ spaceId: chosen })} options={spaceOptions(spaces.data ?? [])} placeholder="Choose a space" size="small" value={spaceId} />
      {spaceId && (
        <Select
          label="List"
          onChange={(listId) => onChange({ ...settings, listId: listId || undefined })}
          options={[{ value: '', label: 'All open tasks' }, ...(lists.data ?? []).map((list) => ({ value: list.id, label: list.title }))]}
          size="small"
          value={typeof settings.listId === 'string' ? settings.listId : ''}
        />
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
  if (links.length === 0) return <Hint>Add links in this widget's settings.</Hint>;
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3 p-0">
      {links.map((link) => (
        <li key={`${link.label}-${link.url}`}>
          <a
            className="grid justify-items-center gap-2 rounded-field p-2 text-center text-sm text-ink no-underline hover:bg-line-soft"
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
            <TextButton label="Remove" onClick={() => onChange({ links: links.filter((_, kept) => kept !== index) })} />
          </li>
        ))}
      </ul>
      {links.length < 24 && (
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <TextField label="Shortcut name" maxLength={40} onChange={(event) => setLabel(event.currentTarget.value)} value={label} />
          <TextField inputMode="url" label="Shortcut link" onChange={(event) => setUrl(event.currentTarget.value)} value={url} />
          <Button
            disabled={!valid}
            label="Add"
            onClick={() => {
              onChange({ links: [...links, { label: label.trim(), url: address }] });
              setLabel('');
              setUrl('https://');
            }}
          />
        </div>
      )}
    </div>
  );
}

function Recurring() {
  const summary = useResource<{ totals: { currency: string; monthlyMinor: number }[]; upcoming: Subscription[] }>(
    '/subscriptions/summary',
    true,
    { live: ['subscriptions', 'items'] },
  );
  if (summary.error) return <LoadError compact error={summary.error} onRetry={summary.reload} />;
  if (!summary.data) {
    return (
      <Placeholder className="grid gap-3" label="Adding up your subscriptions">
        <SkeletonLine className="text-xl" width="w-36" />
        <SplitRowsSkeleton className="gap-1" rows={3} />
      </Placeholder>
    );
  }
  if (summary.data.totals.length === 0) {
    return (
      <Hint>
        No subscriptions yet. <Link to="/spending/recurring">Add some</Link>
      </Hint>
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
          <li key={subscription.id}>
            <Link className="flex justify-between gap-3 text-sm text-ink no-underline hover:underline" to={`/spending/recurring?subscription=${subscription.id}`}>
              <span className="truncate">{subscription.name}</span>
              <span className="mono-sm shrink-0 text-faint">{shortDate(subscription.nextRenewal)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Inbox() {
  const auth = useAuth();
  const inbox = useInbox();
  const action = useAction();
  const notifications = useResource<Page<InboxNotification>>('/me/inbox?page=1', true, { live: ['inbox'] });
  if (notifications.error) return <LoadError compact error={notifications.error} onRetry={notifications.reload} />;
  if (!notifications.data) {
    return (
      <Placeholder label="Loading your inbox">
        <LinkRowsSkeleton className="gap-2" rows={3} />
      </Placeholder>
    );
  }
  const unread = notifications.data.results.filter((notification) => !notification.read).slice(0, 5);
  if (unread.length === 0) return <Hint>You are all caught up.</Hint>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {unread.map((notification) => (
        <li className="text-sm" key={notification.id}>
          <Link
            className="text-ink no-underline hover:underline"
            onClick={() =>
              void action.run(async () => {
                await auth.request(`/me/inbox/${notification.id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
                inbox.reload();
                return '';
              }, 'Could not update that notification')
            }
            to={notification.link ?? '/inbox'}
          >
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
  const agenda = useAgenda(today, addDays(today, 7));
  if (agenda.error) return <LoadError compact error={agenda.error} onRetry={agenda.reload} />;
  if (!agenda.data) {
    return (
      <Placeholder label="Loading your agenda">
        <AgendaCardsSkeleton rows={3} />
      </Placeholder>
    );
  }
  if (agenda.data.length === 0) return <Hint>Nothing in the next seven days.</Hint>;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {agenda.data.slice(0, 6).map((entry) => (
        <li className="text-sm" key={`${entry.kind}-${entry.itemId}-${entry.start}`}>
          <AgendaEntryLink className="agenda-card" colour={agenda.colourOf(entry)} entry={entry}>
            <span className="block truncate text-ink">{entry.title}</span>
            <span className="mono-sm block truncate text-faint">
              {formatDay(entryDay(entry), { weekday: 'short' })} {entryTime(entry)}
            </span>
          </AgendaEntryLink>
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
  if (typeof settings.date !== 'string') return <Hint>Choose a date in this widget's settings.</Hint>;
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
      <TextField label="Label" maxLength={60} onChange={(event) => onChange({ ...settings, label: event.currentTarget.value })} value={typeof settings.label === 'string' ? settings.label : ''} />
      <DatePicker label="Date" onChange={(date) => onChange({ ...settings, date: date || undefined })} size="small" value={typeof settings.date === 'string' ? settings.date : ''} />
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
  const duration = (phase === 'focus' ? focusMinutes : breakMinutes) * minuteMs;
  const [chosenDuration, setChosenDuration] = useState(duration);
  if (duration !== chosenDuration) {
    setChosenDuration(duration);
    if (endsAt === undefined) setLeft(duration);
  }

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
        <p className="m-0 mt-1 text-sm text-muted">{phase === 'focus' ? 'Focus' : 'Break'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button label={endsAt === undefined ? 'Start' : 'Pause'} onClick={() => setEndsAt(endsAt === undefined ? Date.now() + left : undefined)} />
        <Button
          label="Reset"
          onClick={() => {
            setEndsAt(undefined);
            setPhase('focus');
            setLeft(focusMinutes * minuteMs);
          }}
        />
      </div>
    </div>
  );
}

function FocusSettings({ onChange, settings }: SettingsProps) {
  const choice = (key: 'minutes' | 'breakMinutes', label: string, options: number[], fallback: number) => (
    <Select
      label={label}
      onChange={(minutes) => onChange({ ...settings, [key]: Number(minutes) })}
      options={options.map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` }))}
      size="small"
      value={String(typeof settings[key] === 'number' ? settings[key] : fallback)}
    />
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
  const habits = useResource<Habit[]>('/me/habits', true, { live: ['habits'] });
  if (habits.error) return <LoadError compact error={habits.error} onRetry={habits.reload} />;
  if (!habits.data) {
    return (
      <Placeholder className="grid gap-3" label="Loading your habits">
        {[0, 1, 2].map((row) => (
          <div aria-hidden="true" className="flex items-center gap-3" key={row}>
            <Skeleton className="habit-check rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonLine width={row % 2 ? 'w-1/2' : 'w-2/3'} />
              <SkeletonLine className="mono-sm mt-0.5" width="w-28" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <span className="habit-day" key={day} />
              ))}
            </div>
          </div>
        ))}
      </Placeholder>
    );
  }
  if (habits.data.length === 0) return <Hint>No habits yet. Add them in a space’s Habits tab.</Hint>;
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

function Board({ settings }: WidgetProps) {
  const boardId = typeof settings.boardId === 'string' ? settings.boardId : null;
  if (!boardId) return <Hint>Choose a board in this widget's settings.</Hint>;
  return (
    <Link className="block no-underline" to={`/notes/${boardId}`}>
      <BoardPreview boardId={boardId} key={boardId} label="Board preview" live />
    </Link>
  );
}

function BoardSettings({ onChange, settings }: SettingsProps) {
  const boards = useResource<Note[]>('/me/notes?kind=board', true);
  return (
    <Select
      label="Board"
      onChange={(boardId) => onChange({ boardId })}
      options={(boards.data ?? []).map((board) => ({ value: board.id, label: noteTitle(board) }))}
      placeholder="Choose a board"
      size="small"
      value={typeof settings.boardId === 'string' ? settings.boardId : ''}
    />
  );
}

function Pages() {
  const pages = useResource<{ pinned: Note[]; recent: Note[] }>('/me/pages', true, { live: ['items', 'pages'] });
  if (pages.error) return <LoadError compact error={pages.error} onRetry={pages.reload} />;
  if (!pages.data) {
    return (
      <Placeholder label="Loading your pages">
        <PageLinksSkeleton rows={4} />
      </Placeholder>
    );
  }
  const { pinned, recent } = pages.data;
  if (pinned.length === 0 && recent.length === 0) {
    return (
      <Hint>
        No pages yet. <Link to="/pages">Write one</Link>
      </Hint>
    );
  }
  return (
    <div className="grid gap-3">
      {pinned.length > 0 && <PageLinks heading="Pinned" pages={pinned} />}
      {recent.length > 0 && <PageLinks heading="Recently edited" pages={recent} />}
    </div>
  );
}

function ReadLater() {
  const bookmarks = useResource<Bookmark[]>('/me/bookmarks?status=unread', true, { live: ['items'] });
  if (bookmarks.error) return <LoadError compact error={bookmarks.error} onRetry={bookmarks.reload} />;
  if (!bookmarks.data) {
    return (
      <Placeholder label="Loading your reading list">
        <LinkRowsSkeleton className="gap-1.5" rows={3} />
      </Placeholder>
    );
  }
  if (bookmarks.data.length === 0) {
    return (
      <Hint>
        Nothing to read later. <Link to="/bookmarks">Add a bookmark</Link>
      </Hint>
    );
  }
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
  const scan = useResource<TidyScanSummary>('/tidy/scan', true, { live: ['items', 'subscriptions'] });
  const history = useResource<{ createdAt: string }[]>('/tidy/history', true, { live: ['items', 'subscriptions'] });
  if (scan.error) return <LoadError compact error={scan.error} onRetry={scan.reload} />;
  if (!scan.data) {
    return (
      <Placeholder className="grid gap-2 text-sm" label="Looking for clutter">
        <div className="grid gap-1">
          <SkeletonLine width="w-3/4" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonLine className="mono-sm" width="w-28" />
        <SkeletonLine width="w-16" />
      </Placeholder>
    );
  }
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
        <Hint>Nothing to tidy.</Hint>
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
  {
    title: string;
    group: WidgetGroup;
    description: string;
    size: WidgetSize;
    settings: Record<string, unknown>;
    View: (props: WidgetProps) => ReactNode;
    Settings?: (props: SettingsProps) => ReactNode;
  }
> = {
  clock: { title: 'Clock', group: 'Around you', description: 'The time here and in other cities.', size: 'small', settings: {}, View: Clock, Settings: ClockSettings },
  today: { title: 'Today', group: 'Your day', description: "What's on today and what's due.", size: 'medium', settings: {}, View: Today },
  tasks: { title: 'Tasks', group: 'Your day', description: 'Tasks to tick off.', size: 'medium', settings: {}, View: Tasks, Settings: TasksSettings },
  shortcuts: { title: 'Shortcuts', group: 'Notes and links', description: 'Links to the sites you use most.', size: 'wide', settings: { links: [] }, View: Shortcuts, Settings: ShortcutsSettings },
  recurring: { title: 'Renewals and spend', group: 'Money', description: 'Monthly subscriptions and the next renewals.', size: 'small', settings: {}, View: Recurring },
  inbox: { title: 'Inbox', group: 'Notes and links', description: 'Your latest notifications.', size: 'medium', settings: {}, View: Inbox },
  agenda: { title: 'Agenda', group: 'Your day', description: 'The week ahead.', size: 'medium', settings: {}, View: Agenda },
  countdown: { title: 'Countdown', group: 'Your day', description: 'Days left until a date.', size: 'small', settings: {}, View: Countdown, Settings: CountdownSettings },
  focus: { title: 'Focus timer', group: 'Your day', description: 'A focus timer with breaks.', size: 'small', settings: { minutes: 25, breakMinutes: 5 }, View: Focus, Settings: FocusSettings },
  tidy: { title: 'Tidy status', group: 'Notes and links', description: 'What Tidy suggests clearing up.', size: 'small', settings: {}, View: Tidy },
  weather: { title: 'Weather', group: 'Around you', description: 'The forecast where you are.', size: 'small', settings: { unit: 'celsius' }, View: Weather, Settings: WeatherSettings },
  news: { title: 'News', group: 'Around you', description: 'Headlines from feeds you choose.', size: 'medium', settings: { feeds: [], count: 5 }, View: News, Settings: NewsSettings },
  capture: { title: 'Quick note', group: 'Notes and links', description: 'Jot a note straight from Home and see your latest ones.', size: 'medium', settings: {}, View: Capture },
  habits: { title: 'Habits', group: 'Your day', description: "Today's habits to check off.", size: 'medium', settings: {}, View: Habits },
  pages: { title: 'Pinned and recent pages', group: 'Notes and links', description: 'Pages you pinned and the ones you opened last.', size: 'medium', settings: {}, View: Pages },
  board: { title: 'Board', group: 'Notes and links', description: 'One of your boards.', size: 'wide', settings: {}, View: Board, Settings: BoardSettings },
  bookmarks: { title: 'Read later', group: 'Notes and links', description: 'Articles saved to read later.', size: 'medium', settings: {}, View: ReadLater },
  quote: { title: 'Quote of the day', group: 'Around you', description: 'A new quote every day.', size: 'medium', settings: {}, View: Quote },
  spending: { title: 'Spending this month', group: 'Money', description: 'Spent against your budget this month.', size: 'medium', settings: {}, View: SpendingWidget },
  payments: { title: 'Upcoming payments', group: 'Money', description: 'Installments and card payments coming up.', size: 'small', settings: {}, View: PaymentsWidget },
  savings: { title: 'Savings goals', group: 'Money', description: 'Progress towards your savings goals.', size: 'small', settings: {}, View: SavingsWidget },
};
