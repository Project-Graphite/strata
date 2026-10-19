import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DatePicker, formatDay, IconButton, ListSkeleton, Select, TextField, Button as UiButton, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { addDays, dayKey } from '../agenda';
import { Button } from '../components/Button';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { meals, type Meal, type PlannedMeal, type Recipe } from '../recipes';
import { SpaceChooser, useChosenSpace } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { RecipesArea } from './RecipesPage';
import { PeriodNav } from '../components/PeriodNav';

const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const weekRange = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function MealPlanPage() {
  const auth = useAuth();
  const action = useAction();
  const show = useSnackbar();
  const [params, setParams] = useSearchParams();
  const today = dayKey(new Date());
  const monday = mondayOf(params.get('week') ?? today);
  const { spaceId, space, editable } = useChosenSpace();
  const plan = useResource<PlannedMeal[]>(spaceId ? `/spaces/${spaceId}/meal-plan?from=${monday}` : null, true);
  const [adding, setAdding] = useState<{ day: string; meal: Meal }>();
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const go = (next: Record<string, string>) => setParams((current) => ({ ...Object.fromEntries(current), ...next }));

  function remove(entry: PlannedMeal) {
    void action.run(async () => {
      await auth.request(`/meal-plan/${entry.id}`, { method: 'DELETE' });
      plan.mutate((current) => current.filter((kept) => kept.id !== entry.id));
      return {
        message: `Removed ${entry.recipe?.title ?? entry.note} from the plan.`,
        undo: async () => {
          const restored = await auth.request<PlannedMeal>(`/spaces/${spaceId}/meal-plan`, {
            method: 'POST',
            body: JSON.stringify({ day: entry.day, meal: entry.meal, ...(entry.recipe ? { recipeId: entry.recipe.id } : { note: entry.note }) }),
          });
          plan.mutate((current) => [...current, restored]);
          return '';
        },
      };
    }, 'Could not remove the meal');
  }

  return (
    <RecipesArea
      tab="plan"
      toolbar={
        <PeriodNav
          current={{ label: 'This week', onSelect: () => go({ week: mondayOf(today) }) }}
          onShift={(step) => go({ week: addDays(monday, step * 7) })}
          title={weekRange.formatRange(new Date(`${monday}T00:00:00Z`), new Date(`${addDays(monday, 6)}T00:00:00Z`))}
          unit="week"
        />
      }
      toolbarEnd={
        <>
          <SpaceChooser />
          {editable && (
            <Button
              disabled={action.busy || !plan.data?.some((entry) => entry.recipe)}
              icon="check"
              label="Make a shopping list"
              onClick={() =>
                void action.run(async () => {
                  const made = await auth.request<{ listId: string; added: number; already: number }>(`/spaces/${spaceId}/meal-plan/shopping-list`, {
                    method: 'POST',
                    body: JSON.stringify({ from: monday }),
                  });
                  show({
                    message: made.added
                      ? `Added ${made.added} ingredient${made.added === 1 ? '' : 's'} to the Shopping list in ${space!.name}.`
                      : 'Everything is already on the Shopping list.',
                    action: { label: 'Open', href: `/tasks?list=${made.listId}` },
                  });
                  return '';
                }, 'Could not make the shopping list')
              }
            />
          )}
        </>
      }
    >
      {plan.error ? (
        <LoadError error={plan.error} onRetry={plan.reload} />
      ) : !plan.data ? (
        <ListSkeleton label="Loading the meal plan" rows={7} />
      ) : (
        <ul className="panel-rows">
          {days.map((day) => (
            <li className="panel-row grid grid-cols-3 gap-3 md:grid-cols-[8rem_repeat(3,minmax(0,1fr))]" key={day}>
              <p className={`m-0 text-sm max-md:col-span-3 ${day === today ? 'font-medium text-ink' : 'text-muted'}`}>
                {formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}
                {day === today && <span className="block text-muted">Today</span>}
              </p>
              {meals.map(({ value, label }) => {
                const planned = plan.data!.filter((entry) => entry.day === day && entry.meal === value);
                return (
                  <div className="grid content-start gap-1" key={value}>
                    <span className="text-sm text-faint">{label}</span>
                    {planned.map((entry) => (
                      <span className="flex min-w-0 items-center gap-1" key={entry.id}>
                        {entry.recipe ? (
                          <Link className="min-w-0 flex-1 truncate text-sm text-ink" to={`/recipes/${entry.recipe.id}`}>
                            {entry.recipe.title}
                          </Link>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.note || 'A recipe that was removed'}</span>
                        )}
                        {editable && (
                          <IconButton
                            disabled={action.busy}
                            icon="x"
                            label={`Remove ${entry.recipe?.title ?? entry.note} from ${label.toLowerCase()} on ${formatDay(day)}`}
                            onClick={() => remove(entry)}
                          />
                        )}
                      </span>
                    ))}
                    {editable && (
                      <UiButton
                        aria-label={`Add ${label.toLowerCase()} on ${formatDay(day)}`}
                        className="w-fit"
                        icon="plus"
                        onClick={() => setAdding({ day, meal: value })}
                        size="small"
                        variant="text"
                      >
                        Add
                      </UiButton>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
      {adding && spaceId && (
        <PlanMealDialog
          day={adding.day}
          meal={adding.meal}
          onClose={() => setAdding(undefined)}
          onPlanned={(entry) => plan.mutate((current) => [...current, entry])}
          spaceId={spaceId}
        />
      )}
    </RecipesArea>
  );
}

export function PlanMealDialog({
  day,
  meal,
  onClose,
  onPlanned,
  recipe,
  spaceId,
}: {
  day?: string;
  meal?: Meal;
  onClose: () => void;
  onPlanned?: (entry: PlannedMeal) => void;
  recipe?: Recipe;
  spaceId: string;
}) {
  const auth = useAuth();
  const saving = useAction();
  const recipes = useResource<Recipe[]>(recipe ? null : '/me/recipes', true);
  const [chosen, setChosen] = useState('');
  const [when, setWhen] = useState({ day: day ?? dayKey(new Date()), meal: meal ?? ('dinner' as Meal) });
  const [error, setError] = useState<string>();
  const inSpace = (recipes.data ?? []).filter((candidate) => candidate.spaceId === spaceId);
  const mealLabel = meals.find((option) => option.value === when.meal)!.label;

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Adding…"
      onClose={onClose}
      onSubmit={(target) => {
        const note = String(new FormData(target).get('note') ?? '').trim();
        const recipeId = recipe?.id ?? chosen;
        if (!recipeId && !note) {
          setError('Choose a recipe or write what you will eat.');
          return;
        }
        void saving
          .run(async () => {
            onPlanned?.(
              await auth.request<PlannedMeal>(`/spaces/${spaceId}/meal-plan`, {
                method: 'POST',
                body: JSON.stringify({ day: when.day, meal: when.meal, ...(recipeId ? { recipeId } : { note }) }),
              }),
            );
            return `Planned ${recipe?.title ?? inSpace.find((candidate) => candidate.id === recipeId)?.title ?? note} for ${mealLabel.toLowerCase()} on ${formatDay(when.day)}.`;
          }, 'Could not plan the meal')
          .then((saved) => saved && onClose());
      }}
      submitLabel="Add to plan"
      title={recipe ? 'Plan a meal' : `${mealLabel} on ${formatDay(when.day, { weekday: 'long', day: 'numeric', month: 'long' })}`}
    >
      {recipe ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker label="Day" onChange={(next) => setWhen({ ...when, day: next })} optional={false} value={when.day} />
          <Select label="Meal" onChange={(next) => setWhen({ ...when, meal: next })} options={meals} value={when.meal} />
        </div>
      ) : (
        <>
          <Select
            error={error}
            label="Recipe"
            onChange={(next) => {
              setChosen(next);
              setError(undefined);
            }}
            options={inSpace.map((candidate) => ({ value: candidate.id, label: candidate.title }))}
            placeholder={recipes.data ? (inSpace.length ? 'Choose a recipe' : 'No recipes in this space yet') : 'Loading recipes…'}
            searchable
            value={chosen}
          />
          <TextField disabled={Boolean(chosen)} label="Or write what you will eat" maxLength={200} name="note" onInput={() => setError(undefined)} placeholder="Leftovers, eating out" />
        </>
      )}
    </FormDialog>
  );
}
