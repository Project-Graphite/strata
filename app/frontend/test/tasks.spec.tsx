import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { chooseFromMenu } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const home = { id: 'home', name: 'Home', color: 'green', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' };
const personal = { id: 'mine', name: 'Personal', color: 'gray', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
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
    vi.useRealTimers();
  });

  function serve(route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      const routed = route(path, init);
      if (routed) return Promise.resolve(routed);
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([home]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/spaces/home/lists') return Promise.resolve(json([]));
      if (path === '/spaces/home/members') return Promise.resolve(json([]));
      return Promise.resolve(new Response(null, { status: 404 }));
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

  it('moves a task to the trash from its editor, and renames or trashes a list', async () => {
    let lists = [{ id: 'chores', spaceId: 'home', title: 'Chores', openTasks: 1, position: 1 }];
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/lists') return json(lists);
      if (path.startsWith('/spaces/home/tasks?page=1')) return json(page([task({ listId: 'chores' })]));
      if (path === '/items/bins/trash' && init?.method === 'POST') return new Response(null, { status: 204 });
      if (path === '/items/chores' && init?.method === 'PATCH') {
        lists = [{ ...lists[0]!, title: JSON.parse(String(init.body)).title }];
        return json({});
      }
      if (path === '/items/chores/trash' && init?.method === 'POST') return new Response(null, { status: 204 });
      return undefined;
    });
    await render('/spaces/home/tasks?list=chores');
    const button = (label: string) => [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label)!;

    await act(async () => [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.startsWith('Bins out'))!.click());
    await act(async () => button('Move to trash').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/bins/trash', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Nothing to do');

    await chooseFromMenu(container, 'Actions for Chores', 'Rename list');
    const name = document.querySelector<HTMLInputElement>('dialog input[name="title"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'House');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => name.form!.requestSubmit());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/chores', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'House' }) }));
    expect(container.querySelector('nav[aria-label="Lists"]')?.textContent).toContain('House');

    await chooseFromMenu(container, 'Actions for House', 'Move list to trash');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/chores/trash', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('nav[aria-label="Lists"]')?.textContent).not.toContain('House');
  });

  it('adds a task and moves a repeating one to its next date when ticked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T10:00:00'));
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
    await act(async () => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === 'New task')!.click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    const title = form.querySelector<HTMLInputElement>('input[name="title"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Water plants');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
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

    await act(async () => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === 'New task')!.click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>('input[name="title"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'pay rent 2030-01-04 9am #home !2');
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
    expect(container.querySelector('dialog [role="status"]')).toBeNull();
  });

  async function typeTodo(text: string) {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Add a to-do"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input.form!;
  }

  function serveTodos(route: (path: string, init?: RequestInit) => Response | undefined) {
    const added: { path: string; body: { title: string; listId?: string; priority?: number } }[] = [];
    let open = [task({ id: 'milk', title: 'Milk', listId: 'groceries', dueDate: null, dueTime: null, repeatRule: null })];
    serve((path, init) => {
      if (path === '/spaces') return json([personal, home]);
      if (/^\/spaces\/(mine|home)\/tasks$/.test(path) && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        added.push({ path, body });
        const created = task({ id: `added-${added.length}`, spaceId: path.split('/')[2], title: body.title, listId: body.listId ?? null, dueDate: null, dueTime: null, repeatRule: null });
        open = [...open, created];
        return json(created, 201);
      }
      if (path === '/tasks/milk/complete') {
        open = open.filter((shown) => shown.id !== 'milk');
        return json(task({ id: 'milk', title: 'Milk', repeatRule: null, completedAt: '2026-10-12T09:00:00Z' }));
      }
      return route(path, init) ?? (path.startsWith('/me/tasks?page=1') || path === '/spaces/mine/tasks?page=1' ? json(page(open)) : undefined);
    });
    return added;
  }

  it('gathers one to-do list across spaces, adds to the chosen list and ticks things off', async () => {
    const added = serveTodos((path) => (path === '/me/lists' ? json([{ id: 'groceries', spaceId: 'home', title: 'Groceries', openTasks: 1 }]) : undefined));
    await render('/todo');

    expect(container.querySelector('h1')?.textContent).toBe('To-do');
    expect(container.textContent).toContain('Home · Groceries');
    const form = await typeTodo('Call the bank !3');
    expect(form.querySelector('[role="status"]')?.textContent).toBe('Understood: high priority');
    await act(async () => form.requestSubmit());
    expect(added[0]).toEqual({ path: '/spaces/mine/tasks', body: { title: 'Call the bank', priority: 3 } });
    expect(container.textContent).toContain('Call the bank');

    await act(async () => [...container.querySelectorAll('a')].find((anchor) => anchor.textContent?.startsWith('Groceries'))!.click());
    await act(async () => (await typeTodo('Eggs')).requestSubmit());
    expect(added[1]).toEqual({ path: '/spaces/home/tasks', body: { title: 'Eggs', listId: 'groceries' } });

    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Mark Milk as done"]')!.click());
    expect(container.textContent).toContain('Done: Milk.');
    expect(container.querySelector('input[aria-label="Mark Milk as done"]')).toBeNull();
  });

  it('adds to the to-do list widget on Home, which starts with the personal space', async () => {
    const todo = { id: 'todo', type: 'tasks', size: 'medium', settings: {} };
    const added = serveTodos((path) =>
      path === '/me/dashboards' ? json([{ id: 'main', name: 'Home', position: 0, layout: { widgets: [todo] }, showFrom: null, showUntil: null, showOn: 'any' }]) : undefined,
    );
    await render('/');

    const widget = await vi.waitFor(() => container.querySelector('article[aria-label="To-do list"]')!);
    await vi.waitFor(() => expect(widget.textContent).toContain('Milk'));
    await act(async () => (await typeTodo('Book the dentist')).requestSubmit());
    expect(added).toEqual([{ path: '/spaces/mine/tasks', body: { title: 'Book the dentist' } }]);
    await vi.waitFor(() => expect(widget.textContent).toContain('Book the dentist'));
  });

  it('shows today’s schedule from the agenda and followed calendars, and clears a finished task', async () => {
    serve((path) => {
      if (path === '/tasks/today') return json([task({ repeatRule: null, dueTime: null })]);
      if (path === '/tasks/bins/complete') return json(task({ repeatRule: null, completedAt: '2026-10-05T10:00:00Z' }));
      if (path === '/me/calendars/refresh') return json({ refreshed: 0 });
      if (path === '/me/calendars') return json([{ id: 'work' }]);
      if (path.startsWith('/agenda?')) {
        return json([
          { kind: 'external', itemId: 's', spaceId: 'home', title: 'Standup', allDay: false, start: '2026-10-05T09:00:00Z', end: '2026-10-05T09:30:00Z', location: null, calendar: 'Work', calendarId: 'work', uid: 'standup' },
          { kind: 'event', itemId: 'dentist', spaceId: 'home', title: 'Dentist', allDay: false, start: '2026-10-05T15:00:00Z', end: '2026-10-05T16:00:00Z', location: '12 High St' },
          { kind: 'task', itemId: 'bins', spaceId: 'home', title: 'Bins out', allDay: true, start: '2026-10-05', end: null, location: null },
        ]);
      }
      return undefined;
    });
    await render('/today');

    const sections = [...container.querySelectorAll('section h2')].map((heading) => heading.textContent);
    expect(sections).toEqual(['Schedule', 'Due']);
    expect([...container.querySelectorAll('.agenda-card')].map((card) => card.getAttribute('title'))).toEqual(['Standup', 'Dentist']);
    expect(container.textContent).toContain('Work');
    expect(container.textContent).toContain('12 High St');
    expect(container.textContent).toContain('Bins out');
    expect(container.textContent).toContain('Home ·');
    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Mark Bins out as done"]')!.click());
    expect(container.textContent).toContain('Done: Bins out.');
    expect(container.querySelector('input[aria-label="Mark Bins out as done"]')).toBeNull();
  });

  it('keeps the current list on screen while the next one loads', async () => {
    let finish: (response: Response) => void = () => {};
    serve((path) => {
      if (path === '/spaces/home/tasks?page=1') return json(page([task({})]));
      return undefined;
    });
    const fetchMock = vi.mocked(fetch);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) =>
      String(input).endsWith('/spaces/home/tasks?page=1&completed=true')
        ? new Promise<Response>((resolve) => (finish = resolve))
        : base(input, init),
    );
    await render('/spaces/home/tasks');

    const finished = [...container.querySelectorAll('a')].find((link) => link.textContent === 'Show finished')!;
    await act(async () => finished.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain('Bins out');
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();

    await act(async () => finish(json(page([task({ id: 'done', title: 'Paid the rent', completedAt: '2026-10-03T10:00:00Z' })]))));
    expect(container.textContent).toContain('Paid the rent');
    expect(container.textContent).not.toContain('Bins out');
  });
});
