import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { internalPath, storedFileId } from '../src/components/note-extensions';
import { flattenTree, type Note } from '../src/notes';

vi.mock('../src/components/NoteEditor', () => ({
  default: ({ editable, noteId }: { editable: boolean; noteId: string }) => <div data-editable={editable} data-note={noteId} data-testid="editor" />,
}));

vi.mock('../src/components/BoardCanvas', () => ({
  default: ({ editable, noteId }: { editable: boolean; noteId: string }) => <div data-editable={editable} data-note={noteId} data-testid="board" />,
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
  kind: 'note',
  parentId,
  position,
  icon: null,
  pinnedAt: null,
  template: false,
  database: false,
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

  it('follows mentions only inside Strata and loads images only by file id', () => {
    expect(internalPath('/notes/plan')).toBe('/notes/plan');
    expect(['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', null].map(internalPath)).toEqual([null, null, null, null, null]);
    expect(storedFileId('0b7c2a4e-5f1d-4c3b-9a8e-1d2c3b4a5f6e')).toBe('0b7c2a4e-5f1d-4c3b-9a8e-1d2c3b4a5f6e');
    expect(['../me/tokens', '0b7c2a4e-5f1d-4c3b-9a8e-1d2c3b4a5f6e/../x', 42].map(storedFileId)).toEqual([null, null, null]);
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

  it('creates a board and opens it on a canvas, without the page-only actions', async () => {
    const board = { ...note('seating', 'Seating'), kind: 'board' as const };
    listed = [...pages, board];
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/notes' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ board: true });
        return json(board, 201);
      }
      if (path === '/notes/seating') return json({ ...board, editable: true, path: [] });
      return undefined;
    });
    await render('/spaces/home/notes');

    expect([...container.querySelectorAll('main a[href^="/notes/"]')].at(-1)?.textContent).toBe('·SeatingBoard');
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'New board')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/notes', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('[data-testid="board"]')?.getAttribute('data-note')).toBe('seating');
    expect(container.querySelector('[data-testid="editor"]')).toBeNull();
    const buttons = [...container.querySelectorAll('button')].map((button) => button.textContent);
    expect(buttons).not.toContain('Turn into a database');
    expect(buttons).not.toContain('Use as a template');
    expect(container.textContent).not.toContain('Pages inside');
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

  it('adds comments and replies, resolves a thread and hides it until asked', async () => {
    const comment = (id: string, body: string, parentId: string | null = null, authorId = 'me') => ({
      id,
      parentId,
      body,
      resolvedAt: null,
      editedAt: null,
      createdAt: '2026-10-07T09:00:00Z',
      author: { id: authorId, displayName: authorId === 'me' ? 'Amr' : 'Sam' },
    });
    const sent: { path: string; method?: string; body?: unknown }[] = [];
    serve((path, init) => {
      if (path === '/notes/trips') return json({ ...note('trips', 'Trips'), editable: true, path: [] });
      if (path === '/notes/trips/comments' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        sent.push({ path, method: 'POST', body });
        return json(comment(body.parentId ? 'reply' : 'new', body.body, body.parentId ?? null), 201);
      }
      if (path === '/notes/trips/comments') return json([comment('first', 'Book the ferry?', null, 'sam')]);
      if (path === '/comments/first/resolved') {
        sent.push({ path, method: init?.method });
        return json({ ...comment('first', 'Book the ferry?', null, 'sam'), resolvedAt: '2026-10-07T10:00:00Z' });
      }
      return undefined;
    });
    await render('/notes/trips');
    await act(async () => {});

    const comments = container.querySelector('section[aria-label="Comments"]')!;
    expect(comments.textContent).toContain('Sam ·');
    expect(comments.textContent).toContain('Book the ferry?');
    const buttons = () => [...comments.querySelectorAll('button')];
    expect(buttons().map((button) => button.textContent)).toEqual(['Reply', 'Resolve', 'Comment']);

    await act(async () => buttons().find((button) => button.textContent === 'Reply')!.click());
    const reply = comments.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reply, 'Done, booked for Friday');
      reply.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => reply.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(sent[0]).toEqual({ path: '/notes/trips/comments', method: 'POST', body: { body: 'Done, booked for Friday', parentId: 'first' } });
    expect(comments.textContent).toContain('Done, booked for Friday');
    expect(buttons().filter((button) => button.textContent === 'Edit')).toHaveLength(1);

    await act(async () => buttons().find((button) => button.textContent === 'Resolve')!.click());
    expect(sent[1]).toEqual({ path: '/comments/first/resolved', method: 'PUT' });
    expect(comments.textContent).not.toContain('Book the ferry?');
    await act(async () => buttons().find((button) => button.textContent === 'Show 1 resolved')!.click());
    expect(comments.textContent).toContain('Book the ferry?');
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

  const status = {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', name: 'To do', color: 'gray' },
      { id: 'done', name: 'Done', color: 'green' },
    ],
  };
  const due = { id: 'due', name: 'Due', type: 'date' };
  const cost = { id: 'cost', name: 'Cost', type: 'number' };
  const repairs = (view: string) => ({
    properties: [status, due, cost],
    view,
    groupBy: 'status',
    dateBy: 'due',
    rows: [
      { ...note('boiler', 'Boiler', 'trips'), values: { status: 'todo', due: '2026-10-20', cost: 120 } },
      { ...note('window', 'Window', 'trips'), values: { status: 'done' } },
    ],
  });

  it('turns a page into a database and edits values in its table', async () => {
    const sent: { path: string; method?: string; body: unknown }[] = [];
    let converted = false;
    serve((path, init) => {
      if (init?.method) sent.push({ path, method: init.method, body: JSON.parse(String(init.body)) });
      if (path === '/notes/trips' && !init?.method) return json({ ...note('trips', 'Trips'), database: converted, editable: true, path: [], row: null });
      if (path === '/notes/trips/database' && init?.method === 'PUT') {
        converted = true;
        return json(repairs('table'));
      }
      if (path === '/notes/trips/database') return json(repairs('table'));
      if (path === '/notes/boiler/properties') return json({ values: { status: 'todo', due: '2026-10-20', cost: 95 } });
      return undefined;
    });
    await render('/notes/trips');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Turn into a database')!.click());
    expect(sent[0]).toMatchObject({ path: '/notes/trips/database', method: 'PUT', body: { view: 'table' } });
    expect((sent[0]!.body as { properties: { name: string; type: string }[] }).properties.map(({ name, type }) => `${name}:${type}`)).toEqual(['Status:select', 'Date:date']);

    const table = container.querySelector('table')!;
    expect([...table.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(['Name', 'Status', 'Due', 'Cost']);
    expect([...table.querySelectorAll('tbody th')].map((cell) => cell.textContent)).toEqual(['Boiler', 'Window']);
    const costInput = table.querySelector<HTMLInputElement>('tbody tr input[aria-label="Cost"]')!;
    expect(costInput.value).toBe('120');
    await act(async () => {
      costInput.value = '95';
      costInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(sent[1]).toEqual({ path: '/notes/boiler/properties', method: 'PATCH', body: { values: { cost: 95 } } });
    expect(table.querySelector<HTMLInputElement>('tbody tr input[aria-label="Cost"]')!.value).toBe('95');
  });

  it('groups database pages on a board, lists them and places them on a calendar', async () => {
    const sent: unknown[] = [];
    serve((path, init) => {
      if (path === '/notes/trips' && !init?.method) return json({ ...note('trips', 'Trips'), database: true, editable: true, path: [], row: null });
      if (path === '/notes/trips/database' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        sent.push(body);
        return json(repairs(body.view));
      }
      if (path === '/notes/trips/database') return json(repairs('board'));
      if (path === '/notes/window/properties') {
        sent.push(JSON.parse(String(init!.body)));
        return json({ values: { status: 'todo' } });
      }
      return undefined;
    });
    await render('/notes/trips');

    const columns = () => [...container.querySelectorAll<HTMLElement>('.database-column')];
    expect(columns().map((column) => [column.getAttribute('aria-label'), [...column.querySelectorAll('article')].map((card) => card.querySelector('a')!.textContent)])).toEqual([
      ['To do', ['Boiler']],
      ['Done', ['Window']],
      ['No Status', []],
    ]);
    const transfer = new Map<string, string>();
    const dataTransfer = { setData: (type: string, value: string) => transfer.set(type, value), getData: (type: string) => transfer.get(type) ?? '' };
    await act(async () => {
      const start = new Event('dragstart', { bubbles: true });
      Object.assign(start, { dataTransfer });
      columns()[1]!.querySelector('article')!.dispatchEvent(start);
      const drop = new Event('drop', { bubbles: true });
      Object.assign(drop, { dataTransfer });
      columns()[0]!.dispatchEvent(drop);
    });
    expect(sent[0]).toEqual({ values: { status: 'todo' } });
    expect(columns()[0]!.textContent).toContain('Window');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'List')!.click());
    expect(sent[1]).toMatchObject({ view: 'list', groupBy: 'status', dateBy: 'due' });
    expect([...container.querySelectorAll('section[aria-label="Database"] li')].map((item) => item.textContent)).toEqual([
      expect.stringContaining('Boiler'),
      expect.stringContaining('Window'),
    ]);

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Calendar')!.click());
    const later = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Later →')!;
    const target = new Date(2026, 9, 20).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
    for (let step = 0; step < 24 && !container.querySelector(`[role="group"][aria-label="${target}"] a`); step += 1) {
      await act(async () => later.click());
    }
    expect(container.querySelector(`[role="group"][aria-label="${target}"] a`)?.textContent).toBe('Boiler');
    expect(container.textContent).toContain('No date:');
  });

  it('shows the properties of a database page above its content and saves changes', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/notes/boiler' && !init?.method) {
        return json({ ...note('boiler', 'Boiler', 'trips'), editable: true, path: [{ id: 'trips', title: 'Repairs' }], row: { properties: [status, due], values: { status: 'todo' } } });
      }
      if (path === '/notes/boiler/properties') return json({ values: { status: 'done' } });
      return undefined;
    });
    await render('/notes/boiler');

    const panel = container.querySelector('dl[aria-label="Properties"]')!;
    expect([...panel.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Status', 'Due']);
    const select = panel.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
    await act(async () => {
      select.value = 'done';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notes/boiler/properties', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ values: { status: 'done' } }) }));
    expect(panel.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!.value).toBe('done');
  });
});
