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

function codePoint(reference: string) {
  const code = /^x[0-9a-f]+$/i.test(reference) ? Number.parseInt(reference.slice(1), 16) : /^\d+$/.test(reference) ? Number(reference) : NaN;
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

function clean(value: unknown) {
  return typeof value === 'string'
    ? value
        .replace(/<[^<>]*>/g, ' ')
        .replace(/&(#?\w+);/g, (match, name: string) => entities[name] ?? (name.startsWith('#') ? codePoint(name.slice(1)) : match))
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

function jsonLdBlocks(html: string) {
  const open = /<script\b([^<>]*)>/gi;
  const close = /<\/script>/gi;
  const found: string[] = [];
  for (let tag = open.exec(html); tag; tag = open.exec(html)) {
    if (!/type=["']application\/ld\+json["']/i.test(tag[1]!)) continue;
    close.lastIndex = open.lastIndex;
    const end = close.exec(html);
    if (!end) break;
    found.push(html.slice(open.lastIndex, end.index));
    open.lastIndex = close.lastIndex;
  }
  return found;
}

export function readRecipe(html: string): RecipeDraft | null {
  for (const body of jsonLdBlocks(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
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
