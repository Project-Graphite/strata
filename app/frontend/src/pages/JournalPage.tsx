import { useLayoutEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ListSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Button, ButtonLink } from '../components/Button';
import { LoadError } from '../components/LoadError';
import { Page, Subheading } from '../components/Page';
import { OpenCreatedPage } from '../components/OpenCreatedPage';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';
import { PeriodNav } from '../components/PeriodNav';

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

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function JournalPage() {
  const [params] = useSearchParams();
  const year = params.get('year');
  const journal = useResource<JournalYear>(`/me/journal${year ? `?year=${year}` : ''}`, true);

  return (
    <Page
      actions={
        <ButtonLink label="Write a weekly review" to="/review" />
      }
      title="Journal"
    >
      {journal.error ? (
        <LoadError error={journal.error} onRetry={journal.reload} />
      ) : !journal.data ? (
        <ListSkeleton label="Loading your journal" rows={6} />
      ) : (
        <JournalMoods journal={journal.data} mutate={journal.mutate} />
      )}
    </Page>
  );
}

function JournalMoods({ journal, mutate }: { journal: JournalYear; mutate: Resource<JournalYear>['mutate'] }) {
  const auth = useAuth();
  const navigate = useNavigate();
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
    }, 'The mood could not be saved.');
  }

  return (
    <>
      <div className="panel grid gap-4 p-5">
        <Subheading level={2}>How was today?</Subheading>
        <div aria-label="Today’s mood" className="flex flex-wrap gap-2" role="group">
          {moods.map((label, index) => (
            <Button disabled={action.busy} key={label} label={label} onClick={() => setMood(index + 1)} pressed={todayMood === index + 1} />
          ))}
        </div>
        <Button label={entries.get(today)?.noteId ? 'Open today’s page' : 'Write today’s page'} onClick={() => navigate(`/journal/${today}`)} />
      </div>

      <div className="grid gap-3">
        <PeriodNav
          current={shown < Number(today.slice(0, 4)) ? { label: 'This year', onSelect: () => navigate('/journal') } : undefined}
          last={shown >= Number(today.slice(0, 4))}
          onShift={(step) => navigate(`/journal?year=${shown + step}`)}
          title={shown}
          unit="year"
        />
        <div aria-label={`Moods in ${shown}`} className="journal-year" ref={yearGrid} role="list">
          {Array.from({ length: leading }, (_, index) => (
            <span aria-hidden="true" className="journal-day is-blank" key={`blank-${index}`} />
          ))}
          {all.map((day) => {
            const entry = entries.get(day);
            const label = `${dayLabel(day)}${entry?.mood ? `: ${moods[entry.mood - 1]}` : ''}${entry?.noteId ? ', with a page' : ''}`;
            return day > today ? (
              <span aria-hidden="true" className="journal-day is-future" key={day} />
            ) : (
              <Link
                aria-current={day === today ? 'date' : undefined}
                aria-label={label}
                className={`journal-day ${entry?.mood ? `mood-${entry.mood}` : ''} ${entry?.noteId ? 'has-page' : ''}`}
                key={day}
                role="listitem"
                title={label}
                to={`/journal/${day}`}
              />
            );
          })}
        </div>
        <div className="mono-sm flex flex-wrap items-center gap-x-4 gap-y-1 text-faint">
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

export function JournalDayPage() {
  const { day = '' } = useParams();
  return <OpenCreatedPage back="/journal" fallback="The journal page could not be opened." label="Opening the journal page" path={`/me/journal/${day}/page`} />;
}
