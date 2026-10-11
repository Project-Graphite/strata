import { SpaceRole } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublic } from '../../src/widgets/safe-fetch';
import { integrationApp } from './harness';

vi.mock('../../src/widgets/safe-fetch', async (original) => ({ ...(await original<typeof import('../../src/widgets/safe-fetch')>()), fetchPublic: vi.fn() }));

const recipePage = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Tomato soup',
  recipeYield: '2',
  cookTime: 'PT25M',
  recipeIngredient: ['6 tomatoes', '1 onion'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Simmer.' }],
})}</script>`;

describe('Recipes and the meal plan against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  afterEach(() => vi.mocked(fetchPublic).mockReset());

  it('keeps recipes, reads one from a page, plans meals and turns them into a shopping list', async () => {
    const cook = await member('cook');
    const viewer = await member('taster');
    const outsider = await member('neighbour');
    const kitchen = (await cook.call('POST', '/spaces', { name: 'Kitchen' })).body;
    await strata.join(kitchen.id, viewer, SpaceRole.VIEWER);

    vi.mocked(fetchPublic).mockResolvedValueOnce(recipePage);
    const draft = (await cook.call('POST', '/recipes/import', { url: 'https://food.example/soup' })).body;
    expect(draft).toEqual({ title: 'Tomato soup', servings: 2, prepMinutes: null, cookMinutes: 25, ingredients: ['6 tomatoes', '1 onion'], steps: ['Simmer.'], sourceUrl: 'https://food.example/soup' });
    vi.mocked(fetchPublic).mockResolvedValueOnce('<p>Just a blog post</p>');
    expect((await cook.call('POST', '/recipes/import', { url: 'https://food.example/post' })).status).toBe(400);

    expect((await viewer.call('POST', `/spaces/${kitchen.id}/recipes`, draft)).status).toBe(403);
    expect((await cook.call('POST', `/spaces/${kitchen.id}/recipes`, { ...draft, servings: 0 })).status).toBe(400);
    const soup = (await cook.call('POST', `/spaces/${kitchen.id}/recipes`, { ...draft, ingredients: ['6 tomatoes', ' ', '1 onion '] })).body;
    expect(soup).toMatchObject({ title: 'Tomato soup', ingredients: ['6 tomatoes', '1 onion'], spaceName: 'Kitchen' });
    const toast = (await cook.call('POST', `/spaces/${kitchen.id}/recipes`, { title: 'Toast', ingredients: ['Bread', '1 Onion'] })).body;
    expect((await cook.call('PATCH', `/recipes/${toast.id}`, { steps: ['Toast the bread.'] })).body.steps).toEqual(['Toast the bread.']);
    expect((await outsider.call('GET', `/recipes/${soup.id}`)).status).toBe(404);
    expect((await viewer.call('GET', '/me/recipes')).body.map((recipe: { title: string }) => recipe.title)).toEqual(['Toast', 'Tomato soup']);

    const monday = '2026-10-12';
    expect((await cook.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: monday, meal: 'dinner' })).status).toBe(400);
    expect((await cook.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: monday, meal: 'supper', note: 'Out' })).status).toBe(400);
    const other = (await cook.call('POST', '/spaces', { name: 'Elsewhere' })).body;
    const foreign = (await cook.call('POST', `/spaces/${other.id}/recipes`, { title: 'Far away' })).body;
    expect((await cook.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: monday, meal: 'dinner', recipeId: foreign.id })).status).toBe(400);
    expect((await viewer.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: monday, meal: 'dinner', note: 'Pizza' })).status).toBe(403);

    await cook.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: monday, meal: 'dinner', recipeId: soup.id });
    await cook.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: '2026-10-13', meal: 'breakfast', recipeId: toast.id });
    expect((await cook.call('POST', `/spaces/${kitchen.id}/meal-plan`, { day: '2026-10-14', meal: 'lunch', note: 'Leftovers' })).body).toMatchObject({ day: '2026-10-14', meal: 'lunch', note: 'Leftovers', recipe: null });
    const week = (await cook.call('GET', `/spaces/${kitchen.id}/meal-plan?from=${monday}`)).body;
    expect(week.map((entry: { day: string; meal: string; recipe: { title: string } | null; note: string }) => [entry.day, entry.meal, entry.recipe?.title ?? entry.note])).toEqual([
      [monday, 'dinner', 'Tomato soup'],
      ['2026-10-13', 'breakfast', 'Toast'],
      ['2026-10-14', 'lunch', 'Leftovers'],
    ]);
    expect((await viewer.call('GET', `/spaces/${kitchen.id}/meal-plan?from=${monday}`)).body).toHaveLength(3);
    expect((await cook.call('GET', `/spaces/${kitchen.id}/meal-plan?from=2026-10-19`)).body).toEqual([]);

    const shopping = (await cook.call('POST', `/spaces/${kitchen.id}/meal-plan/shopping-list`, { from: monday })).body;
    expect(shopping).toMatchObject({ added: 3, already: 0 });
    expect((await cook.call('POST', `/spaces/${kitchen.id}/meal-plan/shopping-list`, { from: monday })).body).toMatchObject({ listId: shopping.listId, added: 0, already: 3 });
    const tasks = (await cook.call('GET', `/spaces/${kitchen.id}/tasks?page=1&listId=${shopping.listId}`)).body.results.map((task: { title: string }) => task.title);
    expect(tasks.sort()).toEqual(['1 onion', '6 tomatoes', 'Bread']);
    expect((await cook.call('POST', `/spaces/${kitchen.id}/meal-plan/shopping-list`, { from: '2026-10-19' })).status).toBe(400);

    expect((await viewer.call('DELETE', `/meal-plan/${week[2].id}`)).status).toBe(403);
    expect((await cook.call('DELETE', `/meal-plan/${week[2].id}`)).status).toBe(204);
    expect((await outsider.call('DELETE', `/meal-plan/${week[0].id}`)).status).toBe(404);
  });
});
