import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { formatDay, Icon, ListRow, Placeholder } from '@project-graphite/ui';
import { entryLink, entryTime, type AgendaEntry } from '../agenda';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button, ButtonLink } from '../components/Button';
import { CommentsPanel } from '../components/CommentsPanel';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { NotificationToggle } from '../components/NotificationToggle';
import { Page, Section } from '../components/Page';
import { PeriodNav } from '../components/PeriodNav';
import { ButtonSkeleton, IconButtonSkeleton, rowsOf, RowsSkeleton, SkeletonLine } from '../components/Skeletons';
import { journalPageHref, noteTitle } from '../notes';
import type { ExpenseDirection } from '../spending';
import { clockTime, formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const moods = ['Awful', 'Bad', 'Okay', 'Good', 'Great'];

interface JournalDay {
  day: string;
  mood: number | null;
  noteId: string | null;
}

interface JournalYear {
  year: number;
  today: string;
  days: JournalDay[];
  reviews: { id: string; title: string; createdAt: string }[];
}

interface DaySummary {
  day: string;
  mood: number | null;
  page: { id: string; title: string; preview: string } | null;
  agenda: AgendaEntry[];
  tasks: { id: string; title: string; spaceId: string }[];
  habits: { id: string; name: string }[];
  transactions: { id: string; title: string; amountMinor: number; currency: string; direction: ExpenseDirection }[] | null;
}

function yearDays(year: number) {
  const days: string[] = [];
  for (let date = new Date(Date.UTC(year, 0, 1)); date.getUTCFullYear() === year; date.setUTCDate(date.getUTCDate() + 1)) {
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

const dayLabel = (day: string) => formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' });

export function JournalPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const year = params.get('year');
  const journal = useResource<JournalYear>(`/me/journal${year ? `?year=${year}` : ''}`, true, { live: ['journal'] });
  const opening = useAction();
  const mooding = useAction();
  const [openDay, setOpenDay] = useState<string>();
  const data = journal.data;
  const todayPage = data?.days.find((entry) => entry.day === data.today)?.noteId;
  const thisYear = data ? Number(data.today.slice(0, 4)) : 0;

  function open(path: string, fallback: string) {
    void opening.run(async () => {
      const { noteId } = await auth.request<{ noteId: string }>(path, { method: 'POST' });
      navigate(journalPageHref(noteId));
      return '';
    }, fallback);
  }

  function setMood(day: string, current: number | null, mood: number) {
    const next = current === mood ? null : mood;
    void mooding.run(async () => {
      await auth.request(`/me/journal/${day}/mood`, { method: 'PUT', body: JSON.stringify({ mood: next }) });
      journal.mutate((shown) => ({
        ...shown,
        days: [...shown.days.filter((entry) => entry.day !== day), { day, mood: next, noteId: shown.days.find((entry) => entry.day === day)?.noteId ?? null }],
      }));
      return '';
    }, 'Could not save the mood');
  }

  const writeDay = (day: string) => open(`/me/journal/${day}/page`, 'Could not open the journal page');

  return (
    <Page
      actions={
        data ? (
          <>
            <ActionsMenu items={[{ label: 'Write a weekly review', onSelect: () => open('/me/weekly-review', 'Could not write the weekly review') }]} name="Journal" />
            {todayPage ? (
              <ButtonLink icon="pencil" label="Open today’s page" large primary to={journalPageHref(todayPage)} />
            ) : (
              <Button disabled={opening.busy} icon="pencil" label="Write today’s page" large onClick={() => writeDay(data.today)} primary />
            )}
          </>
        ) : (
          !journal.error && (
            <>
              <IconButtonSkeleton />
              <ButtonSkeleton large width="w-40" />
            </>
          )
        )
      }
      title="Journal"
      toolbar={
        data ? (
          <PeriodNav
            last={data.year >= thisYear}
            onShift={(step) => navigate(`/journal?year=${data.year + step}`)}
            title={data.year}
            unit="year"
          />
        ) : (
          !journal.error && (
            <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
              <IconButtonSkeleton />
              <IconButtonSkeleton />
              <SkeletonLine className="ml-2 text-h2" width="w-12" />
            </div>
          )
        )
      }
    >
      {journal.error ? (
        <LoadError error={journal.error} onRetry={journal.reload} />
      ) : !data ? (
        <Placeholder className="grid gap-8" label="Loading your journal">
          <Section title="How was today?">
            <div className="flex flex-wrap gap-2">
              {moods.map((label) => (
                <ButtonSkeleton key={label} width="w-16" />
              ))}
            </div>
          </Section>
          <div aria-hidden="true" className="grid gap-3">
            <div className="journal-year">
              {rowsOf(371).map((day) => (
                <span className="journal-day" key={day} />
              ))}
            </div>
            <SkeletonLine className="text-small" width="w-72 max-w-full" />
          </div>
        </Placeholder>
      ) : (
        <>
          <JournalMoods busy={mooding.busy} journal={data} onMood={setMood} onOpen={setOpenDay} openDay={openDay} />
          {data.reviews.length > 0 && (
            <Section title="Weekly reviews">
              <ul className="panel-rows">
                {data.reviews.map((review) => (
                  <ListRow href={journalPageHref(review.id)} key={review.id} lead={<Icon name="file" size={18} />} meta={`Written ${formatMoment(review.createdAt)}`} title={noteTitle(review)} />
                ))}
              </ul>
            </Section>
          )}
          <CommentsPanel closeLabel="Close the day" docked onClose={() => setOpenDay(undefined)} open={Boolean(openDay)} title={openDay ? dayLabel(openDay) : 'Day'}>
            {openDay && (
              <DayPanel
                busy={opening.busy}
                day={openDay}
                key={openDay}
                moodBusy={mooding.busy}
                onMood={setMood}
                onWrite={writeDay}
                today={data.today}
              />
            )}
          </CommentsPanel>
        </>
      )}
      <NotificationToggle
        description={`Sundays at ${clockTime('18:00')}, with a link that writes the review page for you.`}
        field="weeklyReview"
        label="Weekly review reminder"
        offMessage="Weekly review reminders are off."
        onMessage="You will be reminded on Sundays."
      />
    </Page>
  );
}

function MoodPicker({ busy, label, mood, onPick }: { busy: boolean; label: string; mood: number | null; onPick: (mood: number) => void }) {
  return (
    <div aria-label={label} className="flex flex-wrap gap-2" role="group">
      {moods.map((name, index) => (
        <Button disabled={busy} key={name} label={name} onClick={() => onPick(index + 1)} pressed={mood === index + 1} />
      ))}
    </div>
  );
}

function JournalMoods({
  busy,
  journal,
  onMood,
  onOpen,
  openDay,
}: {
  busy: boolean;
  journal: JournalYear;
  onMood: (day: string, current: number | null, mood: number) => void;
  onOpen: (day: string) => void;
  openDay?: string;
}) {
  const { today, days } = journal;
  const shown = journal.year;
  const entries = new Map(days.map((entry) => [entry.day, entry]));
  const todayMood = entries.get(today)?.mood ?? null;
  const all = yearDays(shown);
  const leading = (new Date(`${all[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const yearGrid = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = yearGrid.current!;
    const day = grid.querySelector('[aria-current="date"]');
    if (day) grid.scrollLeft += day.getBoundingClientRect().left - grid.getBoundingClientRect().left - grid.clientWidth / 2;
  }, [shown]);

  return (
    <>
      <Section title="How was today?">
        <MoodPicker busy={busy} label="Today’s mood" mood={todayMood} onPick={(mood) => onMood(today, todayMood, mood)} />
      </Section>
      {!days.some((entry) => entry.mood || entry.noteId) && (
        <Empty title={`No journal entries in ${shown}`}>Pick a mood or open a day to write its page, and the day lights up in the year below.</Empty>
      )}
      <div className="grid gap-3">
        <div aria-label={`Moods in ${shown}`} className="journal-year" ref={yearGrid} role="group">
          {Array.from({ length: leading }, (_, index) => (
            <span aria-hidden="true" className="journal-day is-blank" key={`blank-${index}`} />
          ))}
          {all.map((day) => {
            const entry = entries.get(day);
            if (day > today) return <span aria-hidden="true" className="journal-day is-future" key={day} />;
            const label = `${dayLabel(day)}${entry?.mood ? `: ${moods[entry.mood - 1]}` : ''}${entry?.noteId ? ', with a page' : ''}`;
            return (
              <button
                aria-current={day === today ? 'date' : undefined}
                aria-label={label}
                aria-pressed={day === openDay}
                className={`journal-day cursor-pointer ${entry?.mood ? `mood-${entry.mood}` : ''} ${entry?.noteId ? 'has-page' : ''}`}
                key={day}
                onClick={() => onOpen(day)}
                title={label}
                type="button"
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted">
          <span className="flex items-center gap-1">
            {moods[0]}
            {moods.map((label, index) => (
              <span aria-hidden="true" className={`journal-day mood-${index + 1} size-3`} key={label} />
            ))}
            {moods[4]}
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="journal-day has-page size-3" />
            The day has a page
          </span>
        </div>
      </div>
    </>
  );
}

function DayPanel({
  busy,
  day,
  moodBusy,
  onMood,
  onWrite,
  today,
}: {
  busy: boolean;
  day: string;
  moodBusy: boolean;
  onMood: (day: string, current: number | null, mood: number) => void;
  onWrite: (day: string) => void;
  today: string;
}) {
  const summary = useResource<DaySummary>(`/me/journal/${day}`, true, { live: ['journal', 'items', 'tasks', 'habits', 'spending'] });
  if (summary.error) return <LoadError error={summary.error} onRetry={summary.reload} />;
  if (!summary.data) {
    return (
      <Placeholder label="Loading the day">
        <RowsSkeleton rows={4} />
      </Placeholder>
    );
  }
  const { agenda, habits, mood, page, tasks, transactions } = summary.data;
  const quiet = agenda.length + tasks.length + habits.length + (transactions?.length ?? 0) === 0;
  return (
    <div className="grid gap-6">
      {day === today ? (
        <MoodPicker busy={moodBusy} label="Mood" mood={mood} onPick={(picked) => onMood(day, mood, picked)} />
      ) : (
        mood && <p className="m-0 text-body">You felt {moods[mood - 1]!.toLowerCase()}.</p>
      )}
      <Section level={3} title="Journal page">
        {page ? (
          <>
            <p className="m-0 line-clamp-5 text-small whitespace-pre-line text-muted">{page.preview || 'Nothing written yet.'}</p>
            <div>
              <ButtonLink icon="pencil" label="Open page" primary to={journalPageHref(page.id)} />
            </div>
          </>
        ) : (
          <div>
            <Button disabled={busy} icon="pencil" label={day === today ? 'Write today’s page' : 'Write this day’s page'} onClick={() => onWrite(day)} primary />
          </div>
        )}
      </Section>
      {agenda.length > 0 && (
        <Section level={3} title="On the agenda">
          <ul className="panel-rows">
            {agenda.map((entry) => (
              <ListRow
                href={entry.kind === 'external' ? undefined : entryLink(entry)}
                key={`${entry.kind}-${entry.itemId}-${entry.start}`}
                meta={[entryTime(entry), entry.calendar, entry.location].filter(Boolean).join(' · ')}
                title={entry.title}
              />
            ))}
          </ul>
        </Section>
      )}
      {tasks.length > 0 && (
        <Section level={3} title="Done">
          <ul className="panel-rows">
            {tasks.map((task) => (
              <ListRow href={`/tasks?task=${task.id}`} key={task.id} lead={<Icon name="check-mark" size={16} />} title={task.title} />
            ))}
          </ul>
        </Section>
      )}
      {habits.length > 0 && (
        <Section level={3} title="Habits">
          <ul className="panel-rows">
            {habits.map((habit) => (
              <ListRow href="/habits" key={habit.id} lead={<Icon name="check-mark" size={16} />} title={habit.name} />
            ))}
          </ul>
        </Section>
      )}
      {transactions && transactions.length > 0 && (
        <Section level={3} title="Spending">
          <ul className="panel-rows">
            {transactions.map((transaction) => (
              <ListRow
                href="/spending/transactions"
                key={transaction.id}
                title={transaction.title}
                trail={<Amount currency={transaction.currency} direction={transaction.direction} minor={transaction.amountMinor} />}
              />
            ))}
          </ul>
        </Section>
      )}
      {quiet && <p className="m-0 text-small text-muted">Nothing else was recorded on this day.</p>}
    </div>
  );
}
