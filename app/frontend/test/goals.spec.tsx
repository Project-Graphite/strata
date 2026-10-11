import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { choose, chooseFromMenu } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC', features: ['goals'] };
const home = { id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const goal = {
  id: 'garden',
  spaceId: 'home',
  spaceName: 'Home',
  title: 'Tidy the garden',
  period: 'quarter',
  startsOn: '2026-10-01',
  endsOn: '2026-12-31',
  status: 'active',
  why: 'Somewhere to sit in spring',
  target: null,
  current: null,
  unit: null,
  tasks: { done: 1, total: 2 },
  habitCount: 0,
  progress: 0.5,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const run = { ...goal, id: 'run', title: 'Run 500 km', period: 'year', startsOn: '2026-01-01', endsOn: '2026-12-31', why: '', target: 500, current: 125, unit: 'km', tasks: { done: 0, total: 0 }, progress: 0.25 };
const task = (id: string, title: string, completedAt: string | null) => ({
  id,
  spaceId: 'home',
  title,
  listId: null,
  parentId: null,
  dueDate: null,
  dueTime: null,
  timeZone: 'Etc/UTC',
  repeatRule: null,
  reminderMinutes: null,
  priority: 0,
  position: 0,
  assignee: null,
  completedAt,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  linkId: `link-${id}`,
});

describe('Goals', () => {
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

  function serve(features: string[], route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user: { ...user, features } }));
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

  const button = (label: string) => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label)!;
  const sidebarLabels = () => [...container.querySelectorAll('nav[aria-label="Areas"] a')].map((link) => link.textContent);

  it('keeps Goals out of the sidebar until it is turned on in Settings', async () => {
    const fetchMock = serve([], (path, init) => (path === '/me' && init?.method === 'PATCH' ? json({ ...user, features: ['goals'] }) : undefined));
    await render('/goals');

    expect(container.querySelector('h1')?.textContent).toBe('Settings');
    expect(container.textContent).toContain('Turn on Goals to open it.');
    expect(sidebarLabels()).not.toContain('Goals');

    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ features: ['goals'] }) }));
    expect(sidebarLabels()).toContain('Goals');
    expect(container.textContent).not.toContain('Turn on Goals to open it.');
  });

  it('lists goals by period with their progress and adds one measured by a number', async () => {
    const fetchMock = serve(['goals'], (path, init) => {
      if (path === '/me/goals') return json([goal, run]);
      if (path === '/spaces/home/goals' && init?.method === 'POST') return json({ ...run, id: 'read', title: 'Read 12 books' }, 201);
      return undefined;
    });
    await render('/goals');

    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual(['Q4 2026', '2026']);
    expect(container.textContent).toContain('Home · 1 of 2 tasks done');
    expect(container.textContent).toContain('Home · 125 of 500 km');
    expect([...container.querySelectorAll('[role="progressbar"]')].map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['50', '25']);

    await act(async () => button('New goal').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Read 12 books';
    await choose(form, 'For', 'A year');
    await choose(form, 'Which', '2027');
    await choose(form, 'Measure progress by', 'A number');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Enter the number to reach.');
    form.querySelector<HTMLInputElement>('input[name="target"]')!.value = '12';
    form.querySelector<HTMLInputElement>('input[name="unit"]')!.value = 'books';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/goals' && init?.method === 'POST')![1]!.body));
    expect(body).toEqual({ title: 'Read 12 books', period: 'year', startsOn: '2027-01-01', why: '', target: 12, current: null, unit: 'books' });
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('links, ticks off and unlinks tasks, and marks the goal done', async () => {
    let detail = { ...goal, taskList: [task('shed', 'Clear the shed', null), task('weeds', 'Pull the weeds', '2026-10-05T10:00:00Z')], habits: [] };
    const fetchMock = serve(['goals'], (path, init) => {
      if (path === '/goals/garden' && !init?.method) return json(detail);
      if (path === '/goals/garden' && init?.method === 'PATCH') {
        detail = { ...detail, ...JSON.parse(String(init.body)) };
        return json(detail);
      }
      if (path === '/spaces/home/lists' || path === '/spaces/home/members' || path === '/spaces/home/tags') return json([]);
      if (path === '/spaces/home/tasks?page=1') return json({ page: 1, totalPages: 1, totalResults: 3, results: [task('shed', 'Clear the shed', null), task('pots', 'Buy pots', null)] });
      if (path === '/items/garden/links' && init?.method === 'POST') {
        detail = { ...detail, taskList: [...detail.taskList, task('pots', 'Buy pots', null)], tasks: { done: 1, total: 3 } };
        return json({ id: 'link-pots' }, 201);
      }
      if (path === '/items/garden/links/link-shed' && init?.method === 'DELETE') {
        detail = { ...detail, taskList: detail.taskList.filter((shown) => shown.id !== 'shed') };
        return new Response(null, { status: 204 });
      }
      if (path === '/tasks/shed/complete') return json(task('shed', 'Clear the shed', '2026-10-06T10:00:00Z'));
      return undefined;
    });
    await render('/goals/garden');

    expect(container.querySelector('h1')?.textContent).toBe('Tidy the garden');
    expect(container.textContent).toContain('Home · Q4 2026');
    expect(container.textContent).toContain('50% · 1 of 2 tasks done');

    await act(async () => button('Link a task').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    await act(async () => {});
    await choose(form, 'Task', 'Buy pots');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/garden/links', expect.objectContaining({ method: 'POST', body: JSON.stringify({ targetId: 'pots', kind: 'reference' }) }));
    expect(container.textContent).toContain('Buy pots');

    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Mark Clear the shed as done"]')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tasks/shed/complete', expect.objectContaining({ method: 'POST' }));

    await chooseFromMenu(container, 'Actions for Clear the shed', 'Unlink from this goal');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/garden/links/link-shed', expect.objectContaining({ method: 'DELETE' }));

    await chooseFromMenu(container, 'More goal actions', 'Mark as done');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/goals/garden', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'done' }) }));
    expect(container.textContent).toContain('Home · Q4 2026 · Done');
  });
});
