import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { dayKey } from '../src/agenda';
import { choose } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC', features: ['people'] };
const home = { id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const inDays = (days: number) => dayKey(new Date(Date.now() + days * 86_400_000));
const person = (id: string, name: string, extra: object) => ({
  id,
  spaceId: 'home',
  spaceName: 'Home',
  name,
  relationship: null,
  birthdayMonth: null,
  birthdayDay: null,
  birthYear: null,
  nextBirthday: null,
  turning: null,
  email: null,
  phone: null,
  notes: '',
  giftIdeas: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...extra,
});

describe('People', () => {
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

  it('shows birthdays coming up first and adds a person with a birthday', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/people') {
        return json([
          person('ana', 'Ana', { relationship: 'Sister', nextBirthday: inDays(1), turning: 30 }),
          person('bo', 'Bo', { nextBirthday: inDays(200) }),
        ]);
      }
      if (path === '/spaces/home/people' && init?.method === 'POST') return json(person('cy', 'Cy', {}), 201);
      return undefined;
    });
    await render('/people');

    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual(['Birthdays coming up', 'Everyone']);
    const soon = container.querySelectorAll('section ul')[0]!;
    expect([...soon.querySelectorAll('a > span.grid > span')].map((line) => line.textContent)).toEqual(['Ana', 'Tomorrow · turns 30']);
    expect(container.textContent).toContain('Sister · Home');

    await act(async () => button('Add person').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Cy';
    await choose(form, 'Day', '9');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Choose both the day and the month, or neither.');
    await choose(form, 'Month', 'March');
    form.querySelector<HTMLInputElement>('input[name="birthYear"]')!.value = '1990';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/people' && init?.method === 'POST')![1]!.body));
    expect(body).toEqual({ name: 'Cy', relationship: null, birthdayMonth: 3, birthdayDay: 9, birthYear: 1990, email: null, phone: null, notes: '' });
  });

  it('keeps gift ideas and links events shared with a person', async () => {
    let detail = { ...person('ana', 'Ana', { email: 'ana@example.com' }), events: [] as object[] };
    const fetchMock = serve((path, init) => {
      if (path === '/people/ana' && !init?.method) return json(detail);
      if (path === '/people/ana' && init?.method === 'PATCH') {
        detail = { ...detail, ...JSON.parse(String(init.body)) };
        return json(detail);
      }
      if (path === '/spaces/home/items?kind=event') return json({ page: 1, totalPages: 1, totalResults: 1, results: [{ id: 'dinner', spaceId: 'home', kind: 'event', title: 'Dinner' }] });
      if (path === '/items/ana/links' && init?.method === 'POST') {
        detail = { ...detail, events: [{ linkId: 'link', ownLink: true, id: 'dinner', title: 'Dinner', startsOn: inDays(5), startTime: '19:30' }] };
        return json({ id: 'link' }, 201);
      }
      return undefined;
    });
    await render('/people/ana');

    expect(container.querySelector('a[href="mailto:ana@example.com"]')).not.toBeNull();
    await act(async () => button('Add idea').click());
    const idea = container.querySelector('dialog form') as HTMLFormElement;
    idea.querySelector<HTMLInputElement>('input[name="text"]')!.value = 'A good umbrella';
    await act(async () => {
      idea.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    const patch = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/people/ana' && init?.method === 'PATCH')![1]!.body));
    expect(patch.giftIdeas).toEqual([{ id: expect.any(String), text: 'A good umbrella', done: false }]);
    expect(container.textContent).toContain('A good umbrella');

    await act(async () => button('Link an event').click());
    const link = container.querySelector('dialog form') as HTMLFormElement;
    await act(async () => {});
    await choose(link, 'Event', 'Dinner');
    await act(async () => {
      link.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/ana/links', expect.objectContaining({ body: JSON.stringify({ targetId: 'dinner', kind: 'reference' }) }));
    expect(container.querySelector('a[href="/events/dinner"]')?.textContent).toContain('19:30');
  });
});
