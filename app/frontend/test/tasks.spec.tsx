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
const home = { id: 'home', name: 'Home', color: 'green', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' };
const task = (overrides: object) => ({
  id: 'bins',
  spaceId: 'home',
  title: 'Bins out',
  listId: null,
  parentId: null,
  dueDate: '2026-10-05',
  dueTime: '19:00',
  timeZone: 'Etc/UTC',
  repeatRule: 'FREQ=WEEKLY',
  reminderMinutes: null,
  priority: 0,
  position: 0,
  assignee: null,
  completedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});
const page = <T,>(results: T[]) => ({ page: 1, totalPages: 1, totalResults: results.length, results });

describe('Tasks', () => {
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
      if (path === '/spaces/home/lists') return Promise.resolve(json([]));
      if (path === '/spaces/home/members') return Promise.resolve(json([]));
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

  it('adds a task and moves a repeating one to its next date when ticked', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/tasks?page=1') return json(page([task({})]));
      if (path === '/spaces/home/tasks' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ title: 'Water plants', dueDate: '2026-10-06' });
        return json(task({ id: 'plants', title: 'Water plants', dueDate: '2026-10-06', dueTime: null, repeatRule: null }), 201);
      }
      if (path === '/tasks/bins/complete') return json(task({ dueDate: '2026-10-12' }));
      return undefined;
    });
    await render('/spaces/home/tasks');

    expect(container.textContent).toContain('Bins out');
    expect(container.textContent).toContain('every week');
    const form = container.querySelector('form')!;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Water plants';
    form.querySelector<HTMLInputElement>('input[name="dueDate"]')!.value = '2026-10-06';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Water plants');

    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Mark Bins out as done"]')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tasks/bins/complete', expect.objectContaining({ method: 'POST' }));
    const row = [...container.querySelectorAll('li')].find((item) => item.textContent?.includes('Bins out'))!;
    expect(row.textContent).toContain(
      new Date('2026-10-12T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    );
  });

  it('reads a plain-language task, shows what it understood and sends the parts', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/tasks?page=1') return json(page([]));
      if (path === '/spaces/home/tags') return json([{ id: 'tag-home', spaceId: 'home', name: 'home', color: 'green' }]);
      if (path === '/spaces/home/tasks' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ title: 'pay rent', dueDate: '2030-01-04', dueTime: '09:00', priority: 2 });
        return json(task({ id: 'rent', title: 'pay rent', dueDate: '2030-01-04', dueTime: '09:00', repeatRule: null, priority: 2 }), 201);
      }
      if (path === '/items/rent/tags' && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({ tagIds: ['tag-home'] });
        return json({ id: 'rent' });
      }
      return undefined;
    });
    await render('/spaces/home/tasks');

    const form = container.querySelector('form')!;
    const input = form.querySelector<HTMLInputElement>('input[name="title"]')!;
    input.value = 'pay rent 2030-01-04 9am #home !2';
    await act(async () => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(form.querySelector('[role="status"]')?.textContent).toBe(
      `due ${new Date('2030-01-04T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} 09:00 · tag home · medium priority`,
    );

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/rent/tags', expect.objectContaining({ method: 'PUT' }));
    expect(form.querySelector('[role="status"]')).toBeNull();
  });

  it('lists what is due today across spaces and clears a finished task', async () => {
    serve((path) => {
      if (path === '/tasks/today') return json([task({ repeatRule: null, dueTime: null })]);
      if (path === '/tasks/bins/complete') return json(task({ repeatRule: null, completedAt: '2026-10-05T10:00:00Z' }));
      return undefined;
    });
    await render('/today');

    expect(container.textContent).toContain('Bins out');
    expect(container.textContent).toContain('Home ·');
    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Mark Bins out as done"]')!.click());
    expect(container.textContent).toContain('Done: Bins out.');
    expect(container.querySelector('input[aria-label="Mark Bins out as done"]')).toBeNull();
  });
});
