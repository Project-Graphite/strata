import { TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Recipe, RecipeDraft } from '../recipes';
import type { Space } from '../spaces';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors, webAddress, type Check } from '../validation';
import { FormDialog } from './FormDialog';

const wholeNumber: Check = (value) => (!value.trim() || /^\d{1,5}$/.test(value.trim()) ? undefined : 'Enter a whole number.');
const linesOf = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const numberOf = (value: FormDataEntryValue | null) => (String(value ?? '').trim() ? Number(String(value).trim()) : null);

export function RecipeEditor({
  draft,
  onClose,
  onSaved,
  recipe,
  spaces,
}: {
  draft?: RecipeDraft;
  onClose: () => void;
  onSaved: (recipe: Recipe) => void;
  recipe?: Recipe;
  spaces: Space[];
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const start = recipe ?? draft;

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={recipe ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            title: [required('Name the recipe.'), atMost(200, 'Use at most 200 characters.')],
            servings: [wholeNumber],
            prepMinutes: [wholeNumber],
            cookMinutes: [wholeNumber],
            sourceUrl: [(value) => (value.trim() ? webAddress(value) : undefined)],
          })
        ) {
          return;
        }
        const values = new FormData(target);
        const body = {
          title: String(values.get('title')).trim(),
          servings: numberOf(values.get('servings')),
          prepMinutes: numberOf(values.get('prepMinutes')),
          cookMinutes: numberOf(values.get('cookMinutes')),
          ingredients: linesOf(values.get('ingredients')),
          steps: linesOf(values.get('steps')),
          sourceUrl: String(values.get('sourceUrl') ?? '').trim() || null,
        };
        void saving
          .run(async () => {
            onSaved(
              await auth.request<Recipe>(recipe ? `/recipes/${recipe.id}` : `/spaces/${String(values.get('spaceId'))}/recipes`, {
                method: recipe ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
              }),
            );
            return `${recipe ? 'Saved' : 'Added'} ${body.title}.`;
          }, 'Could not save the recipe')
          .then((saved) => saved && onClose());
      }}
      submitLabel={recipe ? 'Save changes' : 'Add recipe'}
      title={recipe ? 'Edit recipe' : 'New recipe'}
    >
      <TextField autoFocus defaultValue={start?.title} label="Name" maxLength={200} {...form.field('title')} />
      {!recipe && spaces[0] && <input name="spaceId" type="hidden" value={spaces[0]!.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField defaultValue={start?.servings ?? ''} inputMode="numeric" label="Serves" {...form.field('servings')} />
        <TextField defaultValue={start?.prepMinutes ?? ''} inputMode="numeric" label="Prep (minutes)" {...form.field('prepMinutes')} />
        <TextField defaultValue={start?.cookMinutes ?? ''} inputMode="numeric" label="Cooking (minutes)" {...form.field('cookMinutes')} />
      </div>
      <TextAreaField defaultValue={start?.ingredients.join('\n')} label="Ingredients" name="ingredients" rows={6} />
      <TextAreaField defaultValue={start?.steps.join('\n')} label="Steps" name="steps" rows={6} />
      <TextField defaultValue={start?.sourceUrl ?? ''} inputMode="url" label="Source link (optional)" {...form.field('sourceUrl')} />
    </FormDialog>
  );
}

export function ImportRecipe({ onClose, onRead }: { onClose: () => void; onRead: (draft: RecipeDraft) => void }) {
  const auth = useAuth();
  const reading = useAction();
  const form = useFormErrors();

  return (
    <FormDialog
      busy={reading.busy}
      busyLabel="Reading…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { url: [required('Paste the link to the recipe.'), webAddress] })) return;
        const url = String(new FormData(target).get('url')).trim();
        void reading.run(async () => {
          onRead(await auth.request<RecipeDraft>('/recipes/import', { method: 'POST', body: JSON.stringify({ url }) }));
          return '';
        }, 'Could not read that recipe');
      }}
      submitLabel="Read recipe"
      title="Add a recipe from a link"
    >
      <TextField
        autoFocus
        inputMode="url"
        label="Link to the recipe"
        type="url"
        {...form.field('url')}
      />
    </FormDialog>
  );
}
