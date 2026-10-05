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
const flat = { id: 'flat', name: 'Flat', color: 'teal', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' };
const plants = {
  id: 'plants',
  spaceId: 'flat',
  spaceName: 'Flat',
  name: 'Water the plants',
  perWeek: 7,
  position: 0,
  today: '2026-10-05',
  checkedToday: false,
  thisWeek: 0,
  streak: 2,
  recent: ['2026-10-03', '2026-10-04'],
};
const gym = { ...plants, id: 'gym', name: 'Gym', perWeek: 3, thisWeek: 1, streak: 0, recent: ['2026-10-05'], checkedToday: true };

describe('Habits', () => {
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
      if (path === '/spaces') return Promise.resolve(json([flat]));
      if (path === '/spaces/flat') return Promise.resolve(json(flat));
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
  }

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label || candidate.getAttribute('aria-label') === label)!;

  it('checks in for today and yesterday and adds a habit with a weekly goal', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/flat/habits' && init?.method === 'POST') return json({ ...gym, id: 'read', name: 'Read', checkedToday: false, recent: [], thisWeek: 0 }, 201);
      if (path === '/spaces/flat/habits') return json([plants, gym]);
      if (path === '/habits/plants/check-ins/2026-10-05') return json({ ...plants, checkedToday: true, streak: 3, recent: [...plants.recent, '2026-10-05'] });
      if (path === '/habits/gym/check-ins/2026-10-04') return json({ ...gym, thisWeek: 1, recent: ['2026-10-04', '2026-10-05'] });
      return undefined;
    });
    await render('/spaces/flat/habits');

    expect(container.textContent).toContain('2-day streak');
    expect(container.textContent).toContain('1 of 3 this week · no streak yet');
    await act(async () => button('Water the plants today').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/habits/plants/check-ins/2026-10-05', expect.objectContaining({ method: 'PUT' }));
    expect(button('Water the plants today').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('3-day streak');

    await act(async () => button('Gym yesterday').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/habits/gym/check-ins/2026-10-04', expect.objectContaining({ method: 'PUT' }));
    expect(button('Gym yesterday').getAttribute('aria-pressed')).toBe('true');

    const form = [...container.querySelectorAll('form')].find((candidate) => candidate.textContent?.includes('New habit'))!;
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Read';
    form.querySelector<HTMLSelectElement>('select[name="perWeek"]')!.value = '3';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/flat/habits', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Read', perWeek: 3 }) }));
    expect([...container.querySelectorAll('li p:first-child')].map((line) => line.textContent)).toEqual(['Water the plants', 'Gym', 'Read']);
  });

  it('undoes a check-in from the Home widget', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/dashboards') {
        return json([{ id: 'home', name: 'Home', position: 0, showFrom: null, showUntil: null, showOn: 'any', layout: { widgets: [{ id: 'h', type: 'habits', size: 'medium', settings: {} }] } }]);
      }
      if (path === '/me/habits') return json([gym]);
      if (path === '/habits/gym/check-ins/2026-10-05' && init?.method === 'DELETE') return json({ ...gym, checkedToday: false, thisWeek: 0, recent: [] });
      return undefined;
    });
    await render('/');

    const widget = container.querySelector('article[aria-label="Habits"]')!;
    expect(widget.textContent).toContain('Flat · 1 of 3 this week');
    await act(async () => button('Gym today').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/habits/gym/check-ins/2026-10-05', expect.objectContaining({ method: 'DELETE' }));
    expect(button('Gym today').getAttribute('aria-pressed')).toBe('false');
  });
});
