import { useAuth } from './auth';
import { useAction } from './useAction';

export interface Habit {
  id: string;
  spaceId: string;
  spaceName: string;
  name: string;
  perWeek: number;
  position: number;
  today: string;
  checkedToday: boolean;
  thisWeek: number;
  streak: number;
  recent: string[];
}

export const goalText = (perWeek: number) => (perWeek >= 7 ? 'every day' : `${perWeek} day${perWeek === 1 ? '' : 's'} a week`);

function progressText(habit: Habit) {
  const streak = habit.streak === 0 ? 'no streak yet' : `${habit.streak}-${habit.perWeek >= 7 ? 'day' : 'week'} streak`;
  return habit.perWeek >= 7 ? streak : `${habit.thisWeek} of ${habit.perWeek} this week · ${streak}`;
}

function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function HabitRow({ habit, onChange, showSpace = false }: { habit: Habit; onChange: (habit: Habit) => void; showSpace?: boolean }) {
  const auth = useAuth();
  const saving = useAction();
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(habit.today, index - 6));

  function toggle(day: string) {
    void saving.run(async () => {
      onChange(await auth.request<Habit>(`/habits/${habit.id}/check-ins/${day}`, { method: habit.recent.includes(day) ? 'DELETE' : 'PUT' }));
      return '';
    }, 'Could not save the check-in');
  }

  return (
    <div className="flex items-center gap-3">
      <button
        aria-label={`${habit.name} today`}
        aria-pressed={habit.checkedToday}
        className={`habit-check ${habit.checkedToday ? 'is-done' : ''}`}
        disabled={saving.busy}
        onClick={() => toggle(habit.today)}
        type="button"
      >
        {habit.checkedToday && <span aria-hidden="true">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-ink">{habit.name}</p>
        <p className="mono-sm m-0 mt-0.5 text-faint">
          {showSpace ? `${habit.spaceName} · ` : ''}
          {progressText(habit)}
        </p>
      </div>
      <div aria-label="Last seven days" className="flex shrink-0 items-center gap-1" role="group">
        {days.map((day, index) =>
          index === 5 ? (
            <button
              aria-label={`${habit.name} yesterday`}
              aria-pressed={habit.recent.includes(day)}
              className={`habit-day ${habit.recent.includes(day) ? 'is-done' : ''}`}
              disabled={saving.busy}
              key={day}
              onClick={() => toggle(day)}
              title="Yesterday"
              type="button"
            />
          ) : (
            <span aria-hidden="true" className={`habit-day ${habit.recent.includes(day) ? 'is-done' : ''}`} key={day} title={day} />
          ),
        )}
      </div>
    </div>
  );
}
