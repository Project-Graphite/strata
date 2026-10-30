import { useState, type ReactNode } from 'react';
import { formatDay, Icon, ListRow } from '@project-graphite/ui';
import { addDays } from './agenda';
import { useAuth } from './auth';
import { capitalised } from './time';
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

export function HabitRow({ actions, habit, onChange, showSpace = false }: { actions?: ReactNode; habit: Habit; onChange: (habit: Habit) => void; showSpace?: boolean }) {
  const auth = useAuth();
  const saving = useAction();
  const [pressed, setPressed] = useState(false);
  const days = Array.from({ length: 7 }, (_, index) => addDays(habit.today, index - 6));

  function toggle(day: string) {
    setPressed(true);
    void saving.run(async () => {
      onChange(await auth.request<Habit>(`/habits/${habit.id}/check-ins/${day}`, { method: habit.recent.includes(day) ? 'DELETE' : 'PUT' }));
      return '';
    }, 'Could not save the check-in');
  }

  return (
    <ListRow
      lead={
        <button
          aria-label={`${habit.name} today`}
          aria-pressed={habit.checkedToday}
          className={`habit-check ${habit.checkedToday ? 'is-done' : ''}`}
          data-pressed={pressed || undefined}
          disabled={saving.busy}
          onClick={() => toggle(habit.today)}
          type="button"
        >
          {habit.checkedToday && (
            <span aria-hidden="true" className="flex">
              <Icon name="check-mark" size={16} />
            </span>
          )}
        </button>
      }
      meta={capitalised(`${showSpace ? `${habit.spaceName} · ` : ''}${progressText(habit)}`)}
      title={habit.name}
      trail={
        <>
          <span aria-label="Last seven days" className="flex items-center gap-1" role="group">
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
                <span aria-hidden="true" className={`habit-day ${habit.recent.includes(day) ? 'is-done' : ''}`} key={day} title={formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })} />
              ),
            )}
          </span>
          {actions}
        </>
      }
    />
  );
}
