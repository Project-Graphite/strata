export interface Recipe {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: string[];
  steps: string[];
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RecipeDraft = Pick<Recipe, 'title' | 'servings' | 'prepMinutes' | 'cookMinutes' | 'ingredients' | 'steps' | 'sourceUrl'>;

export type Meal = 'breakfast' | 'lunch' | 'dinner';

export interface PlannedMeal {
  id: string;
  day: string;
  meal: Meal;
  note: string;
  recipe: { id: string; title: string } | null;
}

export const meals: { value: Meal; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
];

export function durationText(total: number | null) {
  if (!total) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return [hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ');
}

export function recipeFacts(recipe: Pick<Recipe, 'servings' | 'prepMinutes' | 'cookMinutes'>) {
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return [recipe.servings && `Serves ${recipe.servings}`, durationText(total)].filter(Boolean).join(' · ');
}
