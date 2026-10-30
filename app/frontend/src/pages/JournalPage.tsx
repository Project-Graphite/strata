import { useLayoutEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatDay, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, ButtonLink } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { NotificationToggle } from '../components/NotificationToggle';
import { Page, Section } from '../components/Page';
import { PeriodNav } from '../components/PeriodNav';
import { ButtonSkeleton, IconButtonSkeleton, rowsOf, SkeletonLine } from '../components/Skeletons';
import { clockTime } from '../time';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';

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
  const journal = useResource<JournalYear>(`/me/journal${year ? `?year=${year}` : ''}`, true);
  const opening = useAction();
  const data = journal.data;
  const todayPage = data?.days.find((entry) => entry.day === data.today)?.noteId;
  const thisYear = data ? Number(data.today.slice(0, 4)) : 0;

  function open(path: string, fallback: string) {
    void opening.run(async () => {
      const { noteId } = await auth.request<{ noteId: string }>(path, { method: 'POST' });
      navigate(`/notes/${noteId}`);
      return '';
    }, fallback);
  }

  const writeDay = (day: string) => open(`/me/journal/${day}/page`, 'Could not open the journal page');

  return (
    <Page
      actions={
        data ? (
          <>
            <ActionsMenu items={[{ label: 'Write a weekly review', onSelect: () => open('/me/weekly-review', 'Could not write the weekly review') }]} name="Journal" />
            {todayPage ? (
              <ButtonLink icon="pencil" label="Open today’s page" large primary to={`/notes/${todayPage}`} />
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
            current={data.year < thisYear ? { label: 'This year', onSelect: () => navigate('/journal') } : undefined}
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
        <JournalMoods busy={opening.busy} journal={data} mutate={journal.mutate} onWrite={writeDay} />
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

function JournalMoods({ busy, journal, mutate, onWrite }: { busy: boolean; journal: JournalYear; mutate: Resource<JournalYear>['mutate']; onWrite: (day: string) => void }) {
  const auth = useAuth();
  const action = useAction();
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

  function setMood(mood: number) {
    const next = todayMood === mood ? null : mood;
    void action.run(async () => {
      await auth.request(`/me/journal/${today}/mood`, { method: 'PUT', body: JSON.stringify({ mood: next }) });
      mutate((current) => ({
        ...current,
        days: [...current.days.filter((entry) => entry.day !== today), { day: today, mood: next, noteId: entries.get(today)?.noteId ?? null }],
      }));
      return '';
    }, 'Could not save the mood');
  }

  return (
    <>
      <Section title="How was today?">
        <div aria-label="Today’s mood" className="flex flex-wrap gap-2" role="group">
          {moods.map((label, index) => (
            <Button disabled={action.busy} key={label} label={label} onClick={() => setMood(index + 1)} pressed={todayMood === index + 1} />
          ))}
        </div>
      </Section>
      {!days.some((entry) => entry.mood || entry.noteId) && (
        <Empty title={`No journal entries in ${shown}`}>Pick a mood or write a page, and the day lights up in the year below.</Empty>
      )}
      <div className="grid gap-3">
        <div aria-label={`Moods in ${shown}`} className="journal-year" ref={yearGrid} role="group">
          {Array.from({ length: leading }, (_, index) => (
            <span aria-hidden="true" className="journal-day is-blank" key={`blank-${index}`} />
          ))}
          {all.map((day) => {
            const entry = entries.get(day);
            const base = `${dayLabel(day)}${entry?.mood ? `: ${moods[entry.mood - 1]}` : ''}`;
            const className = `journal-day ${entry?.mood ? `mood-${entry.mood}` : ''} ${entry?.noteId ? 'has-page' : ''}`;
            if (day > today) return <span aria-hidden="true" className="journal-day is-future" key={day} />;
            return entry?.noteId ? (
              <Link
                aria-current={day === today ? 'date' : undefined}
                aria-label={`${base}, with a page`}
                className={className}
                key={day}
                title={`${base}, with a page`}
                to={`/notes/${entry.noteId}`}
              />
            ) : (
              <button
                aria-current={day === today ? 'date' : undefined}
                aria-label={`${base}, write a page`}
                className={`${className} cursor-pointer`}
                disabled={busy}
                key={day}
                onClick={() => onWrite(day)}
                title={`${base}, write a page`}
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
