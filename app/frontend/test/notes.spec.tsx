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
  template: false,
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
});
const pages = [note('trips', 'Trips'), note('lisbon', 'Lisbon', 'trips'), note('food', 'Food', 'lisbon'), note('recipes', '', null, 2)];

describe('Notes', () => {
  let container: HTMLDivElement;
  let root: Root;
  let listed = pages;

  beforeEach(() => {
    listed = pages;
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
      if (path === '/spaces/home/notes' && !init?.method) return Promise.resolve(json(listed));
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

  it('previews an earlier version and restores it, but only for editors', async () => {
    const versions = [
      { id: 'v2', createdAt: '2026-10-05T11:00:00Z', createdBy: 'Sam' },
      { id: 'v1', createdAt: '2026-10-05T09:00:00Z', createdBy: 'Amr' },
    ];
    let editable = true;
    const fetchMock = serve((path, init) => {
      if (path === '/notes/trips') return json({ ...note('trips', 'Trips'), editable, path: [] });
      if (path === '/notes/trips/versions') return json(versions);
      if (path === '/notes/trips/versions/v1') return json({ id: 'v1', createdAt: versions[1]!.createdAt, text: 'Lisbon\nPorto' });
      if (path === '/notes/trips/versions/v1/restore' && init?.method === 'POST') return new Response(null, { status: 204 });
      return undefined;
    });
    await render('/notes/trips');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'History')!.click());
    const dialog = container.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Sam');
    const restore = [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Restore this version')!;
    expect(restore.disabled).toBe(true);
    await act(async () => [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('Amr'))!.click());
    expect(dialog.textContent).toContain('Lisbon\nPorto');
    await act(async () => restore.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notes/trips/versions/v1/restore', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector('.snackbar')?.textContent).toContain('Restored.');

    editable = false;
    act(() => root.unmount());
    root = createRoot(container);
    await render('/notes/trips');
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'History')!.click());
    expect([...container.querySelectorAll('dialog button')].some((button) => button.textContent === 'Restore this version')).toBe(false);
  });

  it('lists the pages that mention this one', async () => {
    serve((path) => {
      if (path === '/notes/lisbon') return json({ ...note('lisbon', 'Lisbon', 'trips'), editable: true, path: [{ id: 'trips', title: 'Trips' }] });
      if (path === '/items/lisbon/links') {
        return json({
          outgoing: [],
          backlinks: [
            { id: 'l1', kind: 'mention', item: { id: 'plan', spaceId: 'home', kind: 'note', title: 'Holiday plan' } },
            { id: 'l2', kind: 'reference', item: { id: 'other', spaceId: 'home', kind: 'note', title: 'Not a mention' } },
            { id: 'l3', kind: 'mention', item: { id: 'book', spaceId: 'home', kind: 'task', title: 'Book flights' } },
          ],
        });
      }
      return undefined;
    });
    await render('/notes/lisbon');

    const section = [...container.querySelectorAll('section')].find((candidate) => candidate.textContent?.startsWith('Linked from'))!;
    expect([...section.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Holiday plan', '/notes/plan'],
      ['Book flights', '/spaces/home/tasks'],
    ]);
  });

  it('starts pages from built-in and space templates and marks a page as a template', async () => {
    const withTemplate = [...pages, { ...note('standup', 'Standup'), template: true }];
    const created: unknown[] = [];
    serve((path, init) => {
      if (path === '/spaces/home/notes' && init?.method === 'POST') {
        created.push(JSON.parse(String(init.body)));
        return json(note('fresh', 'Fresh'), 201);
      }
      if (path === '/notes/fresh') return json({ ...note('fresh', 'Fresh'), editable: true, path: [] });
      if (path === '/notes/standup' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ template: false });
        return json({ ...note('standup', 'Standup'), template: false });
      }
      if (path === '/notes/standup') return json({ ...note('standup', 'Standup'), template: true, editable: true, path: [] });
      return undefined;
    });
    listed = withTemplate;
    await render('/spaces/home/notes');

    expect(container.textContent).toContain('Templates in this space');
    expect([...container.querySelectorAll('main ul')][0]!.textContent).not.toContain('Standup');
    const menu = container.querySelector<HTMLButtonElement>('button[aria-label="Start a page from a template"]')!;
    await act(async () => menu.click());
    await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Meeting notes')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(created[0]).toEqual({ template: 'meeting', title: 'Meeting notes' });

    act(() => root.unmount());
    root = createRoot(container);
    await render('/spaces/home/notes');
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Start a page from a template"]')!.click());
    await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Standup')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(created[1]).toEqual({ fromNoteId: 'standup', title: 'Standup' });

    act(() => root.unmount());
    root = createRoot(container);
    await render('/notes/standup');
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Stop using as a template')!.click());
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Use as a template')).toBe(true);
  });
});
