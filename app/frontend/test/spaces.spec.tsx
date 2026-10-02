import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const personal = { id: 'personal', name: 'Personal', color: 'gray', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const family = { id: 'family', name: 'Family', color: 'teal', kind: 'shared', role: 'viewer', createdAt: '2026-10-01T00:00:00Z' };
const emptyPage = { page: 1, totalPages: 1, totalResults: 0, results: [] };

type Route = (path: string, init?: RequestInit) => Response | undefined;

describe('Spaces', () => {
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

  function serve(route: Route) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
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

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label);

  it('lists spaces in the sidebar and opens a new shared space once it is created', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ name: 'Book club', color: 'purple' });
        return json({ ...family, id: 'club', name: 'Book club', color: 'purple', role: 'owner' }, 201);
      }
      if (path === '/spaces') return json([personal, family]);
      if (path.startsWith('/spaces/club/items')) return json(emptyPage);
      return undefined;
    });
    await render('/spaces');

    const sidebar = container.querySelector('nav[aria-label="Areas"]')!;
    expect(sidebar.textContent).toContain('Personal');
    expect(sidebar.textContent).toContain('Family');

    const form = [...container.querySelectorAll('form')].at(-1)!;
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = ' Book club ';
    form.querySelector<HTMLSelectElement>('select[name="color"]')!.value = 'purple';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('h1')?.textContent).toBe('Book club');
    expect(container.textContent).toContain('Nothing here yet');
    expect(sidebar.textContent).toContain('Book club');
  });

  it('shows viewers the members without letting them change roles', async () => {
    serve((path) => {
      if (path === '/spaces') return json([personal, family]);
      if (path === '/spaces/family/members') {
        return json([
          { userId: 'owner', handle: 'sara', displayName: 'Sara', role: 'owner', joinedAt: '2026-10-01T00:00:00Z' },
          { userId: 'me', handle: 'amr', displayName: 'Amr', role: 'viewer', joinedAt: '2026-10-02T00:00:00Z' },
        ]);
      }
      return undefined;
    });
    await render('/spaces/family/members');

    expect(container.textContent).toContain('Sara');
    expect(container.querySelector('select')).toBeNull();
    expect(button('Remove')).toBeUndefined();
    expect(button('Leave')).toBeDefined();
  });

  it('restores an item from the trash', async () => {
    const note = {
      id: 'note',
      spaceId: 'family',
      kind: 'note',
      title: 'Shopping list',
      tags: [],
      archivedAt: null,
      trashedAt: '2026-10-02T00:00:00Z',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
    };
    let restored = false;
    const fetchMock = serve((path, init) => {
      if (path === '/spaces') return json([personal, family]);
      if (path === '/items/note/restore' && init?.method === 'POST') {
        restored = true;
        return new Response(null, { status: 204 });
      }
      if (path === '/trash?page=1') return json(restored ? emptyPage : { ...emptyPage, totalResults: 1, results: [note] });
      return undefined;
    });
    await render('/trash');

    expect(container.textContent).toContain('Shopping list');
    expect(container.textContent).toContain('Family · trashed');
    await act(async () => button('Restore')!.click());

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/note/restore', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Shopping list is back in Family.');
    expect(container.textContent).toContain('The trash is empty');
  });
});
