import { describe, expect, it } from 'vitest';
import { minutes, readRecipe } from '../src/recipes/recipe-page';

const page = (data: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;

describe('reading a recipe from a page', () => {
  it('reads schema.org Recipe data, including from a graph, with sections and HTML in the text', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Ignore me' },
        {
          '@type': ['Recipe'],
          name: 'Slow bread &amp; butter',
          recipeYield: ['4 servings', '4'],
          prepTime: 'PT20M',
          cookTime: 'PT1H5M',
          recipeIngredient: ['500 g flour', ' 10 g <b>salt</b> ', ''],
          recipeInstructions: [
            { '@type': 'HowToSection', name: 'Dough', itemListElement: [{ '@type': 'HowToStep', text: 'Mix everything.' }] },
            { '@type': 'HowToStep', text: 'Bake until golden.' },
          ],
        },
      ],
    });
    expect(readRecipe(html)).toEqual({
      title: 'Slow bread & butter',
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 65,
      ingredients: ['500 g flour', '10 g salt'],
      steps: ['Mix everything.', 'Bake until golden.'],
    });
  });

  it('skips broken blocks and pages without a recipe', () => {
    expect(readRecipe('<script type="application/ld+json">{not json</script>' + page({ '@type': 'Recipe', name: 'Soup', recipeInstructions: 'Boil.\nServe.' }))).toMatchObject({
      title: 'Soup',
      steps: ['Boil.', 'Serve.'],
      servings: null,
    });
    expect(readRecipe(page({ '@type': 'Article', name: 'News' }))).toBeNull();
    expect(readRecipe('<p>Nothing here</p>')).toBeNull();
  });

  it('turns ISO durations into minutes', () => {
    expect(minutes('PT1H30M')).toBe(90);
    expect(minutes('P1DT2H')).toBe(1560);
    expect(minutes('PT0M')).toBeNull();
    expect(minutes('soon')).toBeNull();
  });
});
