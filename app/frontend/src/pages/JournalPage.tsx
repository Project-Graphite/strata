import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ListSkeleton, Tabs } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { OpenCreatedPage } from '../components/OpenCreatedPage';
import { useAction } from '../useAction';
import { pagesTabs } from '../notes';
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

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function JournalPage() {
  const [params] = useSearchParams();
  const year = params.get('year');
  const journal = useResource<JournalYear>(`/me/journal${year ? `?year=${year}` : ''}`, true);

  return (
    <Page
      actions={
        <Link className="secondary-button px-3 py-2 text-sm no-underline" to="/review">
          Write a weekly review
        </Link>
      }
      title="Pages"
    >
      <Tabs items={pagesTabs('journal')} label="Pages" />
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
        <h2 className="m-0 text-base font-medium">How was today?</h2>
        <div aria-label="Today’s mood" className="flex flex-wrap gap-2" role="group">
          {moods.map((label, index) => (
            <button
              aria-pressed={todayMood === index + 1}
              className={`${todayMood === index + 1 ? 'primary-button' : 'secondary-button'} px-3 py-2 text-sm`}
              disabled={action.busy}
              key={label}
              onClick={() => setMood(index + 1)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button className="secondary-button w-fit px-3 py-2 text-sm" onClick={() => navigate(`/journal/${today}`)} type="button">
          {entries.get(today)?.noteId ? 'Open today’s page' : 'Write today’s page'}
        </button>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <Link className="secondary-button px-3 py-2 text-sm no-underline" to={`/journal?year=${shown - 1}`}>
            ← {shown - 1}
          </Link>
          <h2 className="m-0 text-base font-medium">{shown}</h2>
          {shown < Number(today.slice(0, 4)) && (
            <Link className="secondary-button px-3 py-2 text-sm no-underline" to={`/journal?year=${shown + 1}`}>
              {shown + 1} →
            </Link>
          )}
        </div>
        <div aria-label={`Moods in ${shown}`} className="journal-year" role="list">
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
        <p className="mono-sm m-0 text-faint">Darker days felt better. A ring means the day has a page.</p>
      </div>
    </>
  );
}

export function JournalDayPage() {
  const { day = '' } = useParams();
  return <OpenCreatedPage back="/journal" fallback="The journal page could not be opened." label="Opening the journal page" path={`/me/journal/${day}/page`} />;
}
