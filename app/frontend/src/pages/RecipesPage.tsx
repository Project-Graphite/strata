import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ListSkeleton, Tabs } from '@project-graphite/ui';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page } from '../components/Page';
import { ImportRecipe, RecipeEditor } from '../components/RecipeEditor';
import { recipeFacts, type Recipe, type RecipeDraft } from '../recipes';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';

export function RecipesTabs() {
  const { pathname } = useLocation();
  return (
    <Tabs
      items={[
        { active: pathname === '/recipes', href: '/recipes', label: 'Recipes' },
        { active: pathname === '/recipes/plan', href: '/recipes/plan', label: 'Meal plan' },
      ]}
      label="Recipes and meals"
    />
  );
}

export function RecipesPage() {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const recipes = useResource<Recipe[]>('/me/recipes', true);
  const [dialog, setDialog] = useState<'import' | { draft?: RecipeDraft }>();
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  return (
    <Page
      actions={
        writable.length > 0 && (
          <>
            <HeaderButton icon="link" label="Add from a link" onClick={() => setDialog('import')} />
            <HeaderButton icon="plus" label="New recipe" onClick={() => setDialog({})} primary />
          </>
        )
      }
      title="Recipes and meals"
    >
      <RecipesTabs />
      {recipes.error ? (
        <LoadError error={recipes.error} onRetry={recipes.reload} />
      ) : !recipes.data ? (
        <ListSkeleton label="Loading your recipes" rows={4} />
      ) : recipes.data.length === 0 ? (
        <Empty title="No recipes yet" />
      ) : (
        <ul className="panel-rows">
          {recipes.data.map((recipe) => (
            <li key={recipe.id}>
              <Link className="panel-row grid text-ink no-underline hover:bg-line-soft" to={`/recipes/${recipe.id}`}>
                <span className="truncate">{recipe.title}</span>
                <span className="truncate text-sm text-muted">{[recipe.spaceName, recipeFacts(recipe)].filter(Boolean).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {dialog === 'import' && <ImportRecipe onClose={() => setDialog(undefined)} onRead={(draft) => setDialog({ draft })} />}
      {dialog && dialog !== 'import' && (
        <RecipeEditor draft={dialog.draft} onClose={() => setDialog(undefined)} onSaved={(saved) => navigate(`/recipes/${saved.id}`)} spaces={writable} />
      )}
    </Page>
  );
}
