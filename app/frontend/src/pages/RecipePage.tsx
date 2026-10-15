import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, IconButton } from '../components/Button';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { RecipeEditor } from '../components/RecipeEditor';
import { recipeFacts, type Recipe } from '../recipes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { PlanMealDialog } from './MealPlanPage';

export function RecipePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const recipe = useResource<Recipe>(`/recipes/${id}`, true);
  const action = useAction();
  const [dialog, setDialog] = useState<'edit' | 'plan'>();

  if (recipe.error) return <LoadError error={recipe.error} onRetry={recipe.reload} />;
  if (!recipe.data) return <PageSkeleton label="Loading the recipe" />;
  const shown = recipe.data;
  const space = spaces.data?.find((candidate) => candidate.id === shown.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');

  return (
    <Page
      actions={
        editable && (
          <>
            <Button icon="calendar" label="Plan it" onClick={() => setDialog('plan')} />
            <IconButton icon="pencil" label="Edit" onClick={() => setDialog('edit')} />
            <ActionsMenu
              items={[
                ...(shown.sourceUrl ? [{ label: 'Open the original', href: shown.sourceUrl }] : []),
                {
                  label: 'Move to trash',
                  separated: Boolean(shown.sourceUrl),
                  onSelect: () =>
                    void action.run(async () => {
                      await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
                      navigate('/recipes');
                      return `Moved ${shown.title} to the trash.`;
                    }, 'Could not move the recipe to the trash'),
                },
              ]}
              name={shown.title}
            />
          </>
        )
      }
      description={recipeFacts(shown) || undefined}
      eyebrow={shown.spaceName}
      title={shown.title}
    >
      <Section title="Ingredients">
        {shown.ingredients.length === 0 ? (
          <Hint>No ingredients written down yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {shown.ingredients.map((ingredient, index) => (
              <li className="panel-row text-ink" key={index}>
                {ingredient}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Steps">
        {shown.steps.length === 0 ? (
          <Hint>No steps written down yet.</Hint>
        ) : (
          <ol className="m-0 grid list-none gap-4 p-0">
            {shown.steps.map((step, index) => (
              <li className="flex gap-4" key={index}>
                <span aria-hidden="true" className="tag-mark tag-gray shrink-0" data-initial={String(index + 1)} />
                <span className="text-ink">{step}</span>
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
