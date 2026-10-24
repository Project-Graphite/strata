import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, DatePicker, formatDay, Meter, Placeholder, Select, Skeleton, TagChip, TextField, timeAgo, type IconName, type TagColor } from '@project-graphite/ui';
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
import { LoadError } from '../components/LoadError';
import { QuickAddTask } from '../components/QuickAddTask';
import { OpenTask } from '../components/TaskEditor';
import { Capture } from './capture-widget';
import { PaymentsWidget, SavingsWidget, SpendingWidget } from './money-widgets';
import { News, NewsSettings, Weather, WeatherSettings } from './outside-widgets';
import { Birthdays, Goals, Journal, NextTrip } from './plans-widgets';
import { quoteFor } from './quotes';
import { CalendarWidget, DayProgress } from './time-widgets';
import {
  AgendaCardsSkeleton,
  LinkRowsSkeleton,
  PageLinks,
  PageLinksSkeleton,
  SkeletonLine,
  SplitRowsSkeleton,
  TaskRowsSkeleton,
  WidgetEmpty,
  type SettingsProps,
  type WidgetProps,
} from './widget-parts';
import { clockTime } from '../time';
import { Button, ButtonLink, TextButton } from '../components/Button';

export type WidgetType = 'clock' | 'today' | 'tasks' | 'shortcuts' | 'recurring' | 'inbox' | 'agenda' | 'calendar' | 'countdown' | 'focus' | 'progress' | 'tidy' | 'weather' | 'news' | 'capture' | 'habits' | 'journal' | 'goals' | 'trip' | 'birthdays' | 'pages' | 'board' | 'bookmarks' | 'files' | 'quote' | 'spending' | 'payments' | 'savings';
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
        <p className="widget-figure">{clockTime(now)}</p>
        <p className="mono-sm m-0 mt-1 text-faint">
          {formatDay(dayKey(now), { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      {zones.length > 0 && (
        <ul className="widget-list">
          {zones.map((zone) => (
            <li className="flex items-baseline justify-between gap-3 text-sm" key={zone}>
              <span className="truncate text-muted">{zone.split('/').pop()!.replaceAll('_', ' ')}</span>
              <span className="shrink-0 text-ink tabular-nums">{clockTime(now, zone)}</span>
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

function TaskWidget({ add, empty, path }: { add?: { spaceId: string; listId?: string }; empty?: ReactNode; path: string }) {
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
      {list.length === 0 && empty}
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
      <TaskWidget
        empty={
          schedule.data.length === 0 && (
            <WidgetEmpty icon="calendar" title="Nothing scheduled or due" />
          )
        }
        path="/tasks/today"
      />
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
      empty={<WidgetEmpty icon="check-mark" title="All done" />}
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

function Shortcuts({ configure, settings }: WidgetProps) {
  const links = Array.isArray(settings.links) ? (settings.links as Shortcut[]) : [];
  if (links.length === 0) {
    return <WidgetEmpty action={configure && <Button label="Add shortcuts" onClick={configure} />} icon="link" title="No shortcuts yet" />;
  }
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 p-0">
      {links.map((link) => (
        <li key={`${link.label}-${link.url}`}>
          <a className="widget-shortcut" href={link.url} rel="noopener noreferrer" target="_blank">
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
        <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <TextField label="Shortcut name" maxLength={40} onChange={(event) => setLabel(event.currentTarget.value)} value={label} />
          <TextField inputMode="url" label="Shortcut link" onChange={(event) => setUrl(event.currentTarget.value)} value={url} />
          <Button
            disabled={!valid}
            label="Add"
            large
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
        <SkeletonLine className="text-2xl" width="w-36" />
        <SplitRowsSkeleton className="gap-1.5" rows={3} />
      </Placeholder>
    );
  }
  if (summary.data.totals.length === 0) {
    return <WidgetEmpty action={<ButtonLink label="Add a subscription" to="/spending/recurring" />} icon="repeat" title="No subscriptions yet" />;
  }
  return (
    <div className="grid gap-3">
      {summary.data.totals.map((total) => (
        <p className="m-0 text-2xl text-ink tabular-nums" key={total.currency}>
          {money(total.monthlyMinor, total.currency)} <span className="text-sm text-muted">a month</span>
        </p>
      ))}
      <ul className="widget-list">
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
  if (unread.length === 0) return <WidgetEmpty icon="check" title="You’re all caught up" />;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {unread.map((notification) => (
        <li className="flex gap-2.5 text-sm" key={notification.id}>
          <span aria-hidden="true" className="unread-dot mt-2" />
          <span className="min-w-0">
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
          </span>
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
  if (agenda.data.length === 0) {
    return (
      <WidgetEmpty action={<ButtonLink label="Open agenda" to="/agenda/week" />} icon="calendar" title="A free week">
        Nothing in the next seven days.
      </WidgetEmpty>
    );
  }
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
    <figure className="widget-quote">
      <blockquote className="m-0 text-lg leading-snug text-ink">{text}</blockquote>
      <figcaption className="mono-sm text-faint">{author}</figcaption>
    </figure>
  );
}

function Countdown({ configure, settings }: WidgetProps) {
  const label = typeof settings.label === 'string' && settings.label ? settings.label : 'the day';
  if (typeof settings.date !== 'string') {
    return <WidgetEmpty action={configure && <Button label="Choose a date" onClick={configure} />} icon="gift" title="Count down to a day" />;
  }
  const days = Math.round((new Date(`${settings.date}T00:00:00`).getTime() - new Date(`${dayKey(new Date())}T00:00:00`).getTime()) / 86_400_000);
  return (
    <div>
      <p className="widget-figure">
        {days === 0 ? 'Today' : Math.abs(days)}
        {days !== 0 && <span className="widget-unit">{Math.abs(days) === 1 ? 'day' : 'days'}</span>}
      </p>
      <p className="m-0 mt-1 text-sm text-muted">
        {days === 0 ? `${label} is today` : days > 0 ? `until ${label}` : `since ${label}`}
        <span className="mono-sm text-faint"> · {shortDate(settings.date)}</span>
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
        <p className="widget-figure" role="timer">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </p>
        <p className="m-0 mt-1 text-sm text-muted">{phase === 'focus' ? 'Focus' : 'Break'}</p>
      </div>
      <Meter label={`${phase === 'focus' ? 'Focus' : 'Break'} done`} value={1 - left / duration} />
      <div className="flex flex-wrap gap-2">
        <Button label={endsAt === undefined ? 'Start' : 'Pause'} onClick={() => setEndsAt(endsAt === undefined ? Date.now() + left : undefined)} primary={endsAt === undefined} />
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
  const personal = useSpaces().data?.find((space) => space.kind === 'personal');
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
  if (habits.data.length === 0) {
    return <WidgetEmpty action={personal && <ButtonLink label="Add a habit" to={`/spaces/${personal.id}/habits`} />} icon="checklist" title="No habits yet" />;
  }
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

function Board({ configure, settings }: WidgetProps) {
  const boardId = typeof settings.boardId === 'string' ? settings.boardId : null;
  if (!boardId) return <WidgetEmpty action={configure && <Button label="Choose a board" onClick={configure} />} icon="board" title="No board chosen" />;
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
    return <WidgetEmpty action={<ButtonLink label="Write a page" to="/pages" />} icon="file" title="No pages yet" />;
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
    return <WidgetEmpty action={<ButtonLink label="Open bookmarks" to="/bookmarks" />} icon="bookmark" title="Nothing to read later" />;
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

interface StoredFile {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
}

function RecentFiles() {
  const storage = useResource<{ quotaBytes: number; usedBytes: number; files: StoredFile[] }>('/me/storage', true, { live: ['items'] });
  if (storage.error) return <LoadError compact error={storage.error} onRetry={storage.reload} />;
  if (!storage.data) {
    return (
      <Placeholder className="grid gap-3" label="Loading your files">
        <SkeletonLine className="text-sm" width="w-40" />
        <Skeleton className="h-1.5 rounded-full" />
        <SplitRowsSkeleton className="gap-1.5" rows={3} />
      </Placeholder>
    );
  }
  const { files, quotaBytes, usedBytes } = storage.data;
  if (files.length === 0) return <WidgetEmpty action={<ButtonLink label="Upload files" to="/files" />} icon="library" title="No files yet" />;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <p className="m-0 text-sm text-muted">
          <span className="text-ink">{fileSize(usedBytes)}</span> of {fileSize(quotaBytes)} used
        </p>
        <Meter label="Storage used" value={quotaBytes ? usedBytes / quotaBytes : 1} />
      </div>
      <ul className="widget-list">
        {files.slice(0, 4).map((file) => (
          <li className="flex justify-between gap-3 text-sm" key={file.id}>
            <Link className="min-w-0 truncate text-ink no-underline hover:underline" to="/files">
              {file.name}
            </Link>
            <span className="mono-sm shrink-0 text-faint">{timeAgo(file.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
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
  const tidied = last ? `Last tidied ${timeAgo(last.createdAt)}` : 'Not tidied yet';
  if (findings.length === 0) {
    return (
      <WidgetEmpty icon="check-mark" title="No suggestions">
        {tidied}
      </WidgetEmpty>
    );
  }
  return (
    <div className="grid gap-2 text-sm">
      <ul className="widget-list">
        {findings.map((finding) => (
          <li className="text-ink" key={finding}>
            {finding}
          </li>
        ))}
      </ul>
      <p className="mono-sm m-0 text-faint">{tidied}</p>
    </div>
  );
}

export const widgetKinds: Record<
  WidgetType,
  {
    title: string;
    group: WidgetGroup;
    description: string;
    icon: IconName;
    size: WidgetSize;
    minW: number;
    maxW: number;
    minH: number;
    app?: string;
    href?: string;
    settings: Record<string, unknown>;
    View: (props: WidgetProps) => ReactNode;
    Settings?: (props: SettingsProps) => ReactNode;
  }
> = {
  clock: { title: 'Clock', group: 'Around you', description: 'The time here and in other cities.', icon: 'clock', size: 'small', minW: 3, maxW: 6, minH: 6, settings: {}, View: Clock, Settings: ClockSettings },
  today: { title: 'Today', group: 'Your day', description: "What's on today and what's due.", icon: 'home', size: 'medium', minW: 4, maxW: 12, minH: 8, settings: {}, View: Today },
  tasks: { title: 'Tasks', group: 'Your day', description: 'Tasks to tick off.', icon: 'check-mark', size: 'medium', minW: 4, maxW: 12, minH: 10, app: 'tasks', href: '/tasks', settings: {}, View: Tasks, Settings: TasksSettings },
  agenda: { title: 'Agenda', group: 'Your day', description: 'The week ahead.', icon: 'list', size: 'medium', minW: 3, maxW: 12, minH: 8, app: 'agenda', href: '/agenda/week', settings: {}, View: Agenda },
  calendar: { title: 'Calendar', group: 'Your day', description: 'The month at a glance, with busy days marked.', icon: 'calendar', size: 'small', minW: 3, maxW: 6, minH: 13, app: 'agenda', href: '/agenda/month', settings: {}, View: CalendarWidget },
  habits: { title: 'Habits', group: 'Your day', description: "Today's habits to check off.", icon: 'checklist', size: 'medium', minW: 4, maxW: 12, minH: 8, app: 'tasks', settings: {}, View: Habits },
  journal: { title: 'Journal', group: 'Your day', description: "Today's mood, your last two weeks and today's page.", icon: 'pencil', size: 'small', minW: 3, maxW: 6, minH: 10, app: 'journal', href: '/journal', settings: {}, View: Journal },
  goals: { title: 'Goals', group: 'Your day', description: 'Your active goals and how far along they are.', icon: 'target', size: 'medium', minW: 3, maxW: 12, minH: 8, app: 'goals', href: '/goals', settings: {}, View: Goals },
  countdown: { title: 'Countdown', group: 'Your day', description: 'Days left until a date.', icon: 'gift', size: 'small', minW: 3, maxW: 6, minH: 6, settings: {}, View: Countdown, Settings: CountdownSettings },
  focus: { title: 'Focus timer', group: 'Your day', description: 'A focus timer with breaks.', icon: 'target', size: 'small', minW: 3, maxW: 6, minH: 8, settings: { minutes: 25, breakMinutes: 5 }, View: Focus, Settings: FocusSettings },
  progress: { title: 'Day progress', group: 'Your day', description: 'How much of the day, week, month and year has gone.', icon: 'clock', size: 'small', minW: 3, maxW: 6, minH: 8, settings: {}, View: DayProgress },
  recurring: { title: 'Renewals and spend', group: 'Money', description: 'Monthly subscriptions and the next renewals.', icon: 'repeat', size: 'small', minW: 3, maxW: 6, minH: 8, app: 'spending', href: '/spending/recurring', settings: {}, View: Recurring },
  spending: { title: 'Spending this month', group: 'Money', description: 'Spent against your budget this month.', icon: 'wallet', size: 'medium', minW: 4, maxW: 12, minH: 10, app: 'spending', href: '/spending', settings: {}, View: SpendingWidget },
  payments: { title: 'Upcoming payments', group: 'Money', description: 'Installments and card payments coming up.', icon: 'wallet', size: 'small', minW: 3, maxW: 8, minH: 6, app: 'spending', href: '/spending/accounts', settings: {}, View: PaymentsWidget },
  savings: { title: 'Savings goals', group: 'Money', description: 'Progress towards your savings goals.', icon: 'shield', size: 'small', minW: 3, maxW: 8, minH: 6, app: 'spending', href: '/spending/net-worth', settings: {}, View: SavingsWidget },
  shortcuts: { title: 'Shortcuts', group: 'Notes and links', description: 'Links to the sites you use most.', icon: 'link', size: 'wide', minW: 3, maxW: 12, minH: 6, settings: { links: [] }, View: Shortcuts, Settings: ShortcutsSettings },
  inbox: { title: 'Inbox', group: 'Notes and links', description: 'Your latest notifications.', icon: 'bell', size: 'medium', minW: 3, maxW: 12, minH: 8, href: '/inbox', settings: {}, View: Inbox },
  capture: { title: 'Quick note', group: 'Notes and links', description: 'Jot a note straight from Home and see your latest ones.', icon: 'plus', size: 'medium', minW: 4, maxW: 12, minH: 10, app: 'pages', href: '/pages/quick-notes', settings: {}, View: Capture },
  pages: { title: 'Pinned and recent pages', group: 'Notes and links', description: 'Pages you pinned and the ones you opened last.', icon: 'file', size: 'medium', minW: 3, maxW: 12, minH: 8, app: 'pages', href: '/pages', settings: {}, View: Pages },
  board: { title: 'Board', group: 'Notes and links', description: 'One of your boards.', icon: 'board', size: 'wide', minW: 4, maxW: 12, minH: 10, app: 'boards', settings: {}, View: Board, Settings: BoardSettings },
  bookmarks: { title: 'Read later', group: 'Notes and links', description: 'Articles saved to read later.', icon: 'bookmark', size: 'medium', minW: 3, maxW: 12, minH: 8, app: 'bookmarks', href: '/bookmarks', settings: {}, View: ReadLater },
  files: { title: 'Recent files', group: 'Notes and links', description: 'Your latest uploads and the storage they use.', icon: 'library', size: 'small', minW: 3, maxW: 8, minH: 8, app: 'files', href: '/files', settings: {}, View: RecentFiles },
  tidy: { title: 'Tidy status', group: 'Notes and links', description: 'What Tidy suggests clearing up.', icon: 'sparkles', size: 'small', minW: 3, maxW: 6, minH: 6, app: 'tidy', href: '/tidy', settings: {}, View: Tidy },
  weather: { title: 'Weather', group: 'Around you', description: 'The forecast where you are.', icon: 'compass', size: 'small', minW: 3, maxW: 8, minH: 8, settings: { unit: 'celsius' }, View: Weather, Settings: WeatherSettings },
  news: { title: 'News', group: 'Around you', description: 'Headlines from feeds you choose.', icon: 'mail', size: 'medium', minW: 4, maxW: 12, minH: 8, settings: { feeds: [], count: 5 }, View: News, Settings: NewsSettings },
  trip: { title: 'Next trip', group: 'Around you', description: 'Your next trip and how long until you leave.', icon: 'plane', size: 'small', minW: 3, maxW: 6, minH: 6, app: 'trips', href: '/trips', settings: {}, View: NextTrip },
  birthdays: { title: 'Birthdays', group: 'Around you', description: 'Whose birthday is coming up.', icon: 'users', size: 'small', minW: 3, maxW: 6, minH: 6, app: 'people', href: '/people', settings: {}, View: Birthdays },
  quote: { title: 'Quote of the day', group: 'Around you', description: 'A new quote every day.', icon: 'quote', size: 'medium', minW: 3, maxW: 9, minH: 6, settings: {}, View: Quote },
};
