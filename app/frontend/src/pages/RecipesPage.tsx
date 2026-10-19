import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ListSkeleton } from '@project-graphite/ui';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { RowText } from '../components/RowText';
import { ImportRecipe, RecipeEditor } from '../components/RecipeEditor';
import { recipeFacts, type Recipe, type RecipeDraft } from '../recipes';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';

export function RecipesArea({ children, tab, toolbar, toolbarEnd }: { children: ReactNode; tab: 'recipes' | 'plan'; toolbar?: ReactNode; toolbarEnd?: ReactNode }) {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [dialog, setDialog] = useState<'import' | { draft?: RecipeDraft }>();
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  return (
    <Page
      actions={
        writable.length > 0 && (
          <>
            <ActionsMenu items={[{ label: 'Add from a link', onSelect: () => setDialog('import') }]} name="Recipes" />
            <Button icon="plus" label="New recipe" large onClick={() => setDialog({})} primary />
          </>
        )
      }
      tabs={[
        { active: tab === 'recipes', href: '/recipes', label: 'Recipes' },
        { active: tab === 'plan', href: '/recipes/plan', label: 'Meal plan' },
      ]}
      title="Recipes and meals"
      toolbar={toolbar}
      toolbarEnd={toolbarEnd}
    >
      {children}
      {dialog === 'import' && <ImportRecipe onClose={() => setDialog(undefined)} onRead={(draft) => setDialog({ draft })} />}
      {dialog && dialog !== 'import' && (
        <RecipeEditor draft={dialog.draft} onClose={() => setDialog(undefined)} onSaved={(saved) => navigate(`/recipes/${saved.id}`)} spaces={writable} />
      )}
    </Page>
  );
}

export function RecipesPage() {
  const recipes = useResource<Recipe[]>('/me/recipes', true);

  return (
    <RecipesArea tab="recipes">
      {recipes.error ? (
        <LoadError error={recipes.error} onRetry={recipes.reload} />
      ) : !recipes.data ? (
        <ListSkeleton label="Loading your recipes" rows={4} />
      ) : recipes.data.length === 0 ? (
        <Empty title="No recipes yet">Write down the recipes you cook, or paste a link to read one from a recipe site.</Empty>
      ) : (
        <ul className="panel-rows">
          {recipes.data.map((recipe) => (
            <li key={recipe.id}>
              <Link className="panel-row flex items-center gap-3 text-ink no-underline hover:bg-line-soft" to={`/recipes/${recipe.id}`}>
                <RowText detail={[recipe.spaceName, recipeFacts(recipe)].filter(Boolean).join(' · ')} title={recipe.title} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RecipesArea>
  );
}
