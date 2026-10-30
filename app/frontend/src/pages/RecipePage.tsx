import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ListRow } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { Hint } from '../components/Hint';
import { DetailState, Page, Section } from '../components/Page';
import { RecipeEditor } from '../components/RecipeEditor';
import { HintSkeleton, RowsSkeleton, rowsOf, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { recipeFacts, type Recipe } from '../recipes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { PlanMealDialog } from './MealPlanPage';

const emptyIngredients = { title: 'No ingredients yet', hint: 'Edit the recipe to write down what goes into it.' };
const emptySteps = { title: 'No steps yet', hint: 'Edit the recipe to write down how to make it.' };

export function RecipePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const recipe = useResource<Recipe>(`/recipes/${id}`, true);
  const action = useAction();
  const [dialog, setDialog] = useState<'edit' | 'plan'>();

  const space = spaces.data?.find((candidate) => candidate.id === recipe.data?.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
  const [wasEditable, ingredientRows, stepRows, sourced] = useRememberedShape(
    `recipe-${id}`,
    recipe.data && spaces.data && [Number(editable), recipe.data.ingredients.length, recipe.data.steps.length, Number(Boolean(recipe.data.sourceUrl))],
    [1, 4, 3, 0],
  );

  const back = { to: '/recipes', label: 'Recipes' };
  if (!recipe.data) {
    return (
      <DetailState actions={wasEditable ? 1 : 0} back={back} resource={recipe} thing="Recipe">
        <Section title="Ingredients">
          {ingredientRows ? (
            <RowsSkeleton detail={false} rows={ingredientRows} />
          ) : (
            <Empty loading title={emptyIngredients.title}>
              {emptyIngredients.hint}
            </Empty>
          )}
        </Section>
        <Section title="Steps">
          {stepRows ? (
            <ol aria-hidden="true" className="m-0 grid list-none gap-4 p-0">
              {rowsOf(stepRows).map((step) => (
                <li className="flex gap-4" key={step}>
                  <span className="w-5 shrink-0" />
                  <SkeletonLine className="flex-1" width={step % 2 ? 'w-3/5' : 'w-4/5'} />
                </li>
              ))}
            </ol>
          ) : (
            <Empty loading title={emptySteps.title}>
              {emptySteps.hint}
            </Empty>
          )}
        </Section>
        {sourced > 0 && <HintSkeleton />}
      </DetailState>
    );
  }
  const shown = recipe.data;

  return (
    <Page
      actions={
        editable && (
          <>
            <ActionsMenu
              items={[
                { label: 'Plan a meal…', onSelect: () => setDialog('plan') },
                {
                  label: 'Move to trash',
                  separated: true,
                  onSelect: () =>
                    void action.run(async () => {
                      await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
                      navigate('/recipes');
                      return {
                        message: `Moved ${shown.title} to the trash.`,
                        undo: async () => {
                          await auth.request(`/items/${shown.id}/restore`, { method: 'POST' });
                          navigate(`/recipes/${shown.id}`);
                          return '';
                        },
                      };
                    }, 'Could not move the recipe to the trash'),
                },
              ]}
              name={shown.title}
            />
            <Button icon="pencil" label="Edit" large onClick={() => setDialog('edit')} primary />
          </>
        )
      }
      back={back}
      description={[shown.spaceName, recipeFacts(shown)].filter(Boolean).join(' · ')}
      title={shown.title}
    >
      <Section title="Ingredients">
        {shown.ingredients.length === 0 ? (
          <Empty title={emptyIngredients.title}>{emptyIngredients.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {shown.ingredients.map((ingredient, index) => (
              <ListRow key={index} title={ingredient} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Steps">
        {shown.steps.length === 0 ? (
          <Empty title={emptySteps.title}>{emptySteps.hint}</Empty>
        ) : (
          <ol className="m-0 grid min-w-0 grid-cols-1 list-none gap-4 p-0">
            {shown.steps.map((step, index) => (
              <li className="flex items-baseline gap-4" key={index}>
                <span aria-hidden="true" className="w-5 shrink-0 text-right text-small text-muted tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 wrap-anywhere text-ink">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
      {shown.sourceUrl && (
        <Hint>
          From{' '}
          <a href={shown.sourceUrl} rel="noopener noreferrer nofollow" target="_blank">
            {new URL(shown.sourceUrl).hostname.replace(/^www\./, '')}
          </a>
        </Hint>
      )}
      {dialog === 'edit' && space && <RecipeEditor onClose={() => setDialog(undefined)} onSaved={(saved) => recipe.mutate(() => saved)} recipe={shown} spaces={[space]} />}
      {dialog === 'plan' && <PlanMealDialog onClose={() => setDialog(undefined)} recipe={shown} spaceId={shown.spaceId} />}
    </Page>
  );
}
