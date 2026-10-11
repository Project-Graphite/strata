export interface RecipeDraft {
  title: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: string[];
  steps: string[];
}

type Node = Record<string, unknown>;

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function clean(value: unknown) {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(#?\w+);/g, (match, name: string) => entities[name] ?? (name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : match))
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

export function minutes(duration: unknown) {
  const match = typeof duration === 'string' ? /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i.exec(duration.trim()) : null;
  if (!match) return null;
  const total = Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return total > 0 ? total : null;
}

function servings(value: unknown): number | null {
  if (Array.isArray(value)) return servings(value[0]);
  const found = /\d+/.exec(typeof value === 'number' ? String(value) : clean(value));
  return found ? Number(found[0]) : null;
}

function steps(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\n+/).map(clean).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.flatMap((step: unknown) => {
    if (typeof step === 'string') return [clean(step)].filter(Boolean);
    const node = step as Node;
    if (Array.isArray(node.itemListElement)) return steps(node.itemListElement);
    return [clean(node.text ?? node.name)].filter(Boolean);
  });
}

function isRecipe(node: Node) {
  const type = node['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

function findRecipe(value: unknown): Node | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecipe(entry);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const node = value as Node;
  if (isRecipe(node)) return node;
  return findRecipe(node['@graph']);
}

export function readRecipe(html: string): RecipeDraft | null {
  for (const [, body] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body!);
    } catch {
      continue;
    }
    const recipe = findRecipe(parsed);
    if (!recipe) continue;
    const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []).map(clean).filter(Boolean).slice(0, 200);
    return {
      title: clean(recipe.name).slice(0, 200),
      servings: servings(recipe.recipeYield),
      prepMinutes: minutes(recipe.prepTime),
      cookMinutes: minutes(recipe.cookTime),
      ingredients,
      steps: steps(recipe.recipeInstructions).slice(0, 200),
    };
  }
  return null;
}
