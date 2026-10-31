import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ListRow, Placeholder, type MenuItem } from '@project-graphite/ui';
import { ActionsMenu } from '../components/ActionsMenu';
import { AddButton, Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { RowsSkeleton, useRememberedShape } from '../components/Skeletons';

const empty = { title: 'No recipes yet', hint: 'Write down the recipes you cook, or paste a link to read one from a recipe site.' };
import { ImportRecipe, RecipeEditor } from '../components/RecipeEditor';
import { recipeFacts, type Recipe, type RecipeDraft } from '../recipes';
import { useSpaces } from '../spaces';
import { useResource } from '../useResource';

export function RecipesArea({
  children,
  menu = [],
  tab,
  toolbar,
}: {
  children: ReactNode | ((newRecipe: ReactNode) => ReactNode);
  menu?: MenuItem[];
  tab: 'recipes' | 'plan';
  toolbar?: ReactNode;
}) {
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [dialog, setDialog] = useState<'import' | { draft?: RecipeDraft }>();
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  return (
    <Page
      actions={
        writable.length > 0 && (
          <>
            <ActionsMenu items={[{ label: 'Add from a link', onSelect: () => setDialog('import') }, ...menu]} name="Recipes" />
            <AddButton label="New recipe" large onClick={() => setDialog({})} primary />
          </>
        )
      }
      tabs={[
        { active: tab === 'recipes', href: '/recipes', label: 'Recipes' },
        { active: tab === 'plan', href: '/recipes/plan', label: 'Meal plan' },
      ]}
      title="Recipes and meals"
      toolbar={toolbar}
    >
      {typeof children === 'function' ? children(writable.length > 0 && <Button icon="plus" label="New recipe" onClick={() => setDialog({})} primary />) : children}
      {dialog === 'import' && <ImportRecipe onClose={() => setDialog(undefined)} onRead={(draft) => setDialog({ draft })} />}
      {dialog && dialog !== 'import' && (
        <RecipeEditor draft={dialog.draft} onClose={() => setDialog(undefined)} onSaved={(saved) => navigate(`/recipes/${saved.id}`)} spaces={writable} />
      )}
    </Page>
  );
}

export function RecipesPage() {
  const recipes = useResource<Recipe[]>('/me/recipes', true);
  const [rows] = useRememberedShape('recipes', recipes.data && [recipes.data.length], [4]);

  return (
    <RecipesArea tab="recipes">
      {(newRecipe) =>
        recipes.error ? (
          <LoadError error={recipes.error} onRetry={recipes.reload} />
        ) : !recipes.data ? (
          <Placeholder label="Loading your recipes">
            {rows ? (
              <RowsSkeleton rows={rows} />
            ) : (
              <Empty action={newRecipe} icon="utensils" loading title={empty.title} variant="page">
                {empty.hint}
              </Empty>
            )}
          </Placeholder>
        ) : recipes.data.length === 0 ? (
          <Empty action={newRecipe} icon="utensils" title={empty.title} variant="page">
            {empty.hint}
          </Empty>
        ) : (
          <ul className="panel-rows">
            {recipes.data.map((recipe) => (
              <ListRow href={`/recipes/${recipe.id}`} key={recipe.id} meta={[recipe.spaceName, recipeFacts(recipe)].filter(Boolean).join(' · ')} title={recipe.title} />
            ))}
          </ul>
        )
      }
    </RecipesArea>
  );
}
