import { Link, useNavigate } from 'react-router';
import { Avatar, formatDay, Meter, Placeholder, Skeleton } from '@project-graphite/ui';
import { addDays, dayKey } from '../agenda';
import { useAuth } from '../auth';
import { periodLabel, progressText, type Goal } from '../goals';
import { nextBirthdayText, type Person } from '../people';
import { countdown, tripDates, type Trip } from '../trips';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, ButtonLink } from '../components/Button';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { ShowAll, SkeletonLine, SplitRowsSkeleton, WidgetEmpty } from './widget-parts';

const moods = ['Awful', 'Bad', 'Okay', 'Good', 'Great'];

interface JournalYear {
  today: string;
  days: { day: string; mood: number | null; noteId: string | null }[];
}

export function Journal() {
  const auth = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  const journal = useResource<JournalYear>('/me/journal', true, { live: ['journal'] });
  if (journal.error) return <LoadError compact error={journal.error} onRetry={journal.reload} />;
  if (!journal.data) {
    return (
      <Placeholder className="grid gap-3" label="Loading your journal">
        <SkeletonLine className="text-sm" width="w-28" />
        <div aria-hidden="true" className="flex gap-1.5">
          {moods.map((mood) => (
            <Skeleton className="widget-mood" key={mood} />
          ))}
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-8 w-36 rounded-field" />
      </Placeholder>
    );
  }
  const { days, today } = journal.data;
  const entries = new Map(days.map((entry) => [entry.day, entry]));
  const todayEntry = entries.get(today);
  const recent = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));
  let streak = 0;
  for (let day = todayEntry?.mood || todayEntry?.noteId ? today : addDays(today, -1); entries.get(day)?.mood || entries.get(day)?.noteId; day = addDays(day, -1)) streak += 1;

  function setMood(mood: number) {
    const next = todayEntry?.mood === mood ? null : mood;
    void action.run(async () => {
      await auth.request(`/me/journal/${today}/mood`, { method: 'PUT', body: JSON.stringify({ mood: next }) });
      journal.mutate((current) => ({
        ...current,
        days: [...current.days.filter((entry) => entry.day !== today), { day: today, mood: next, noteId: todayEntry?.noteId ?? null }],
      }));
      return '';
    }, 'Could not save the mood');
  }

  return (
    <div className="grid gap-3">
      <Hint>
        {todayEntry?.mood ? (
          <>
            Today was <span className="text-ink">{moods[todayEntry.mood - 1]!.toLowerCase()}</span>
          </>
        ) : (
          'How was today?'
        )}
      </Hint>
      <div aria-label="Today’s mood" className="flex flex-wrap gap-1.5" role="group">
        {moods.map((label, index) => (
          <button
            aria-label={label}
            aria-pressed={todayEntry?.mood === index + 1}
            className={`widget-mood journal-day mood-${index + 1}`}
            disabled={action.busy}
            key={label}
            onClick={() => setMood(index + 1)}
            title={label}
            type="button"
          />
        ))}
      </div>
      <div className="grid gap-1">
        <div aria-label="The last two weeks" className="grid grid-cols-14 gap-1" role="img">
          {recent.map((day) => {
            const entry = entries.get(day);
            return (
              <span
                className={`journal-day aspect-square ${entry?.mood ? `mood-${entry.mood}` : ''} ${entry?.noteId ? 'has-page' : ''}`}
                key={day}
                title={`${formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}${entry?.mood ? `: ${moods[entry.mood - 1]}` : ''}`}
              />
            );
          })}
        </div>
        <p className="mono-sm m-0 text-faint">{streak > 0 ? `${streak}-day streak` : 'Last two weeks'}</p>
      </div>
      {todayEntry?.noteId ? (
        <ButtonLink icon="pencil" label="Open today’s page" to={`/notes/${todayEntry.noteId}`} />
      ) : (
        <Button
          disabled={action.busy}
          icon="pencil"
          label="Write today’s page"
          onClick={() =>
            void action.run(async () => {
              const { noteId } = await auth.request<{ noteId: string }>(`/me/journal/${today}/page`, { method: 'POST' });
              navigate(`/notes/${noteId}`);
              return '';
            }, 'Could not open the journal page')
          }
        />
      )}
    </div>
  );
}

export function Goals() {
  const goals = useResource<Goal[]>('/me/goals', true, { live: ['items', 'tasks', 'habits'] });
  if (goals.error) return <LoadError compact error={goals.error} onRetry={goals.reload} />;
  if (!goals.data) {
    return (
      <Placeholder className="grid gap-3" label="Loading your goals">
        {[0, 1, 2].map((row) => (
          <div aria-hidden="true" className="grid gap-1" key={row}>
            <SplitRowsSkeleton rows={1} />
            <Skeleton className="h-1.5 rounded-full" />
            <SkeletonLine className="mono-sm" width="w-32" />
          </div>
        ))}
      </Placeholder>
    );
  }
  if (goals.data.length === 0) return <WidgetEmpty action={<ButtonLink label="Set a goal" to="/goals" />} icon="target" title="No goals yet" />;
  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-3 p-0">
        {goals.data.slice(0, 4).map((goal) => (
          <li className="grid gap-1" key={goal.id}>
            <span className="flex justify-between gap-3 text-sm">
              <Link className="min-w-0 truncate text-ink no-underline hover:underline" to={`/goals/${goal.id}`}>
                {goal.title}
              </Link>
              <span className="mono-sm shrink-0 text-faint">{periodLabel(goal.period, goal.startsOn)}</span>
            </span>
            {goal.progress !== null && <Meter label={`${goal.title} progress`} value={goal.progress} />}
            <span className="mono-sm text-faint">{progressText(goal)}</span>
          </li>
        ))}
      </ul>
      {goals.data.length > 4 && <ShowAll count={goals.data.length} href="/goals" />}
    </div>
  );
}

export function NextTrip() {
  const trips = useResource<Trip[]>('/me/trips', true, { live: ['items'] });
  const today = dayKey(new Date());
  if (trips.error) return <LoadError compact error={trips.error} onRetry={trips.reload} />;
  if (!trips.data) {
    return (
      <Placeholder className="grid gap-1" label="Looking for your next trip">
        <SkeletonLine className="text-2xl" width="w-32" />
        <SkeletonLine width="w-40" />
        <SkeletonLine className="mono-sm" width="w-36" />
      </Placeholder>
    );
  }
  const trip = trips.data.filter((candidate) => candidate.when !== 'past').sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  if (!trip) return <WidgetEmpty action={<ButtonLink label="Plan a trip" to="/trips" />} icon="plane" title="No trips planned" />;
  return (
    <Link className="grid gap-1 text-ink no-underline" to={`/trips/${trip.id}`}>
      <span className="text-2xl text-ink">{countdown(trip, today)}</span>
      <span className="truncate text-sm text-ink">{trip.destination || trip.title}</span>
      <span className="mono-sm truncate text-faint">{tripDates(trip)}</span>
    </Link>
  );
}

export function Birthdays() {
  const people = useResource<Person[]>('/me/people', true, { live: ['items'] });
  const today = dayKey(new Date());
  if (people.error) return <LoadError compact error={people.error} onRetry={people.reload} />;
  if (!people.data) {
    return (
      <Placeholder className="grid gap-2.5" label="Looking for birthdays">
        {[0, 1, 2].map((row) => (
          <div aria-hidden="true" className="flex items-center gap-2.5" key={row}>
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonLine className="text-sm" width={row % 2 ? 'w-1/2' : 'w-2/3'} />
              <SkeletonLine className="mono-sm" width="w-24" />
            </div>
          </div>
        ))}
      </Placeholder>
    );
  }
  const coming = people.data.filter((person) => person.nextBirthday).sort((a, b) => a.nextBirthday!.localeCompare(b.nextBirthday!));
  if (coming.length === 0) return <WidgetEmpty action={<ButtonLink label="Add someone" to="/people" />} icon="gift" title="No birthdays coming up" />;
  return (
    <div className="grid gap-2.5">
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {coming.slice(0, 5).map((person) => (
          <li key={person.id}>
            <Link className="flex items-center gap-2.5 no-underline" to={`/people/${person.id}`}>
              <Avatar name={person.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{person.name}</span>
                <span className="mono-sm block truncate text-faint">{nextBirthdayText(person, today)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {coming.length > 5 && <ShowAll count={coming.length} href="/people" />}
    </div>
  );
}
