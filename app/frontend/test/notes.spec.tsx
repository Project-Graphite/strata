import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { flattenTree, type Note } from '../src/notes';

vi.mock('../src/components/NoteEditor', () => ({
  default: ({ editable, noteId }: { editable: boolean; noteId: string }) => <div data-editable={editable} data-note={noteId} data-testid="editor" />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const home = { id: 'home', name: 'Home', color: 'green', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' };
const note = (id: string, title: string, parentId: string | null = null, position = 1): Note => ({
  id,
  spaceId: 'home',
  title,
  parentId,
  position,
  icon: null,
  pinnedAt: null,
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
});
const pages = [note('trips', 'Trips'), note('lisbon', 'Lisbon', 'trips'), note('food', 'Food', 'lisbon'), note('recipes', '', null, 2)];

describe('Notes', () => {
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
  });

  function serve(route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([home]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/spaces/home/notes' && !init?.method) return Promise.resolve(json(pages));
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
  }

  it('orders pages as a tree, keeping orphans at the top level', () => {
    expect(flattenTree([...pages, note('orphan', 'Orphan', 'gone')]).map(({ note: page, depth }) => `${depth}:${page.title}`)).toEqual([
      '0:Trips',
      '1:Lisbon',
      '2:Food',
      '0:',
      '0:Orphan',
    ]);
  });

  it('lists the pages of a space and opens a new one', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/notes' && init?.method === 'POST') return json(note('new', ''), 201);
      if (path === '/notes/new') return json({ ...note('new', ''), editable: true, path: [] });
      return undefined;
    });
    await render('/spaces/home/notes');

    const links = [...container.querySelectorAll('main a[href^="/notes/"]')];
    expect(links.map((link) => link.textContent)).toEqual(['·Trips', '·Lisbon', '·Food', '·Untitled']);
    expect((links[2] as HTMLElement).style.paddingLeft).toBe('3.5rem');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'New page')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/notes', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('[data-testid="editor"]')?.getAttribute('data-note')).toBe('new');
  });

  it('shows the path, renames on blur and adds a page inside', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/notes/food' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ title: 'Food and drink' });
        return json(note('food', 'Food and drink', 'lisbon'));
      }
      if (path === '/notes/food') {
        return json({ ...note('food', 'Food', 'lisbon'), editable: true, path: [{ id: 'trips', title: 'Trips' }, { id: 'lisbon', title: 'Lisbon' }] });
      }
      if (path === '/spaces/home/notes' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ parentId: 'food' });
        return json(note('pastel', '', 'food'), 201);
      }
      if (path === '/notes/pastel') return json({ ...note('pastel', '', 'food'), editable: true, path: [] });
      return undefined;
    });
    await render('/notes/food');

    expect([...container.querySelectorAll('nav[aria-label="Breadcrumb"] a')].map((link) => link.textContent)).toEqual(['Home', 'Trips', 'Lisbon']);
    const title = container.querySelector<HTMLInputElement>('input[aria-label="Page title"]')!;
    expect(title.value).toBe('Food');
    title.value = 'Food and drink';
    await act(async () => {
      title.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notes/food', expect.objectContaining({ method: 'PATCH' }));

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Add a page inside'))!.click());
    expect(container.querySelector('[data-testid="editor"]')?.getAttribute('data-note')).toBe('pastel');
  });

  it('opens a viewer’s page read-only and explains a missing page', async () => {
    serve((path) => {
      if (path === '/notes/trips') return json({ ...note('trips', 'Trips'), editable: false, path: [] });
      if (path === '/notes/gone') return json({ message: 'Item not found' }, 404);
      return undefined;
    });
    await render('/notes/trips');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Page title"]')!.readOnly).toBe(true);
    expect(container.querySelector('[data-testid="editor"]')?.getAttribute('data-editable')).toBe('false');
    expect(container.textContent).not.toContain('Add a page inside');

    act(() => root.unmount());
    root = createRoot(container);
    await render('/notes/gone');
    expect(container.textContent).toContain('Page not found');
  });
});
