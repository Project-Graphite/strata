import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC', features: ['recipes'] };
const home = { id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const soup = {
  id: 'soup',
  spaceId: 'home',
  spaceName: 'Home',
  title: 'Tomato soup',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 25,
  ingredients: ['6 tomatoes', '1 onion'],
  steps: ['Simmer.', 'Blend.'],
  sourceUrl: 'https://food.example/soup',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('Recipes and meals', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function serve(route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([home]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      return Promise.resolve(route(path, init) ?? new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function render(path: string) {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  }

  const button = (label: string) => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label || candidate.getAttribute('aria-label') === label)!;
  const submit = (form: HTMLFormElement) => act(async () => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

  it('reads a recipe from a link, lets you check it, and saves it', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/recipes') return json([]);
      if (path === '/recipes/import') return json({ ...soup, id: undefined, spaceId: undefined });
      if (path === '/spaces/home/recipes' && init?.method === 'POST') return json(soup, 201);
      if (path === '/recipes/soup') return json(soup);
      return undefined;
    });
    await render('/recipes');

    expect(container.textContent).toContain('No recipes yet');
    await act(async () => button('Add from a link').click());
    const link = container.querySelector('dialog form') as HTMLFormElement;
    link.querySelector<HTMLInputElement>('input[name="url"]')!.value = 'https://food.example/soup';
    await submit(link);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/recipes/import', expect.objectContaining({ body: JSON.stringify({ url: 'https://food.example/soup' }) }));

    const editor = container.querySelector('dialog form') as HTMLFormElement;
    expect(editor.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Tomato soup');
    expect(editor.querySelector<HTMLTextAreaElement>('textarea[name="ingredients"]')!.value).toBe('6 tomatoes\n1 onion');
    editor.querySelector<HTMLTextAreaElement>('textarea[name="ingredients"]')!.value = '6 tomatoes\n\n1 onion\n1 clove of garlic';
    await submit(editor);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/recipes' && init?.method === 'POST')![1]!.body));
    expect(body).toEqual({ title: 'Tomato soup', servings: 2, prepMinutes: 10, cookMinutes: 25, ingredients: ['6 tomatoes', '1 onion', '1 clove of garlic'], steps: ['Simmer.', 'Blend.'], sourceUrl: 'https://food.example/soup' });
    expect(container.querySelector('h1')?.textContent).toBe('Tomato soup');
    expect(container.textContent).toContain('Serves 2 · 35 min');
  });

  it('plans the week with recipes and notes and makes a shopping list from it', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T12:00:00Z'), toFake: ['Date'] });
    let plan = [{ id: 'one', day: '2026-10-12', meal: 'dinner', note: '', recipe: { id: 'soup', title: 'Tomato soup' } }];
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/meal-plan?from=2026-10-12') return json(plan);
      if (path === '/me/recipes') return json([soup]);
      if (path === '/spaces/home/meal-plan' && init?.method === 'POST') {
        const added = { id: 'two', recipe: null, ...JSON.parse(String(init.body)) };
        plan = [...plan, added];
        return json(added, 201);
      }
      if (path === '/meal-plan/one' && init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (path === '/spaces/home/meal-plan/shopping-list') return json({ listId: 'shopping', added: 2, already: 0 });
      return undefined;
    });
    await render('/recipes/plan');

    expect(container.querySelector('h2')?.textContent).toContain('12');
    expect(container.querySelector('a[href="/recipes/soup"]')?.textContent).toBe('Tomato soup');

    await act(async () => button('Make a shopping list').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/meal-plan/shopping-list', expect.objectContaining({ body: JSON.stringify({ from: '2026-10-12' }) }));
    expect(container.textContent).toContain('Added 2 ingredients to the Shopping list in Home.');

    const addLunch = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label')?.startsWith('Add lunch on Wed'))!;
    await act(async () => addLunch.click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    await submit(form);
    expect(container.textContent).toContain('Choose a recipe or write what you will eat.');
    form.querySelector<HTMLInputElement>('input[name="note"]')!.value = 'Leftovers';
    await submit(form);
    expect(JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/meal-plan' && init?.method === 'POST')![1]!.body))).toEqual({
      day: '2026-10-14',
      meal: 'lunch',
      note: 'Leftovers',
    });
    expect(container.textContent).toContain('Leftovers');

    const remove = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label')?.startsWith('Remove Tomato soup'))!;
    await act(async () => remove.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meal-plan/one', expect.objectContaining({ method: 'DELETE' }));
    expect(container.querySelector('a[href="/recipes/soup"]')).toBeNull();
  });
});
