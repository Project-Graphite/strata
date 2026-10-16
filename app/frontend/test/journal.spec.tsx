import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { chooseFromMenu } from './controls';

vi.mock('../src/components/NoteEditor', () => ({
  default: ({ noteId }: { noteId: string }) => <div data-note={noteId} data-testid="editor" />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const mine = { id: 'mine', name: 'Personal', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };

describe('Journal', () => {
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
      if (path === '/spaces') return Promise.resolve(json([mine]));
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
            <Routes>
              <Route path="/notes/:id" element={<p>Note page</p>} />
              <Route path="*" element={<App />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  }

  it('lists journal entries in their own tab and nests pages under their parents', async () => {
    const page = (id: string, title: string, parentId: string | null, position = 0, journal = false) => ({
      id, spaceId: 'mine', title, kind: 'note', parentId, position, icon: null, pinnedAt: null, template: false, database: false, journal,
      createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
    });
    serve((path) =>
      path === '/me/notes?kind=note'
        ? json([
            page('trip', 'Trip', null),
            page('day-two', 'Day two', 'trip', 2),
            page('day-one', 'Day one', 'trip', 1),
            page('packing', 'Packing', 'day-one'),
            page('journal', 'Journal', null),
            page('tuesday', 'Tuesday, 6 October 2026', 'journal', 0, true),
          ])
        : undefined,
    );
    await render('/pages');

    const tabs = [...container.querySelectorAll('nav[aria-label="Pages"] a')];
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('href'), tab.getAttribute('aria-current')])).toEqual([
      ['Pages', '/pages', 'page'],
      ['Quick notes', '/pages/quick-notes', null],
      ['Journal entries', '/pages/journal', null],
    ]);
    const rows = [...container.querySelectorAll<HTMLAnchorElement>('main li a')];
    expect(rows.map((row) => [row.textContent?.split('Personal')[0], row.style.paddingInlineStart])).toEqual([
      ['Trip', '1rem'],
      ['Day one', '2.25rem'],
      ['Packing', '3.5rem'],
      ['Day two', '2.25rem'],
      ['Journal', '1rem'],
    ]);

    await act(async () => tabs[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(container.querySelector('nav[aria-label="Pages"] a[aria-current="page"]')?.textContent).toBe('Journal entries');
    expect([...container.querySelectorAll('main li a')].map((row) => row.textContent?.split('Personal')[0])).toEqual(['Tuesday, 6 October 2026']);
  });

  it('sets today’s mood with one tap and shows the year with moods and pages', async () => {
    const sent: unknown[] = [];
    serve((path, init) => {
      if (path === '/me/journal') {
        return json({ year: 2026, today: '2026-10-07', days: [{ day: '2026-10-06', mood: 4, noteId: 'page' }] });
      }
      if (path === '/me/journal/2026-10-07/mood') {
        sent.push(JSON.parse(String(init?.body)));
        return json({ day: '2026-10-07', mood: 5 });
      }
      return undefined;
    });
    await render('/journal');

    const great = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Great')!;
    await act(async () => great.click());
    expect(sent).toEqual([{ mood: 5 }]);
    expect(great.getAttribute('aria-pressed')).toBe('true');
    await act(async () => great.click());
    expect(sent).toEqual([{ mood: 5 }, { mood: null }]);

    const yesterday = container.querySelector('a[href="/notes/page"]')!;
    expect(yesterday.className).toContain('mood-4');
    expect(yesterday.className).toContain('has-page');
    expect(yesterday.getAttribute('aria-label')).toContain(': Good, with a page');
    const today = container.querySelector('.journal-day[aria-current="date"]')!;
    expect(today.tagName).toBe('BUTTON');
    expect(today.getAttribute('aria-label')).toBe('Wednesday, October 7, write a page');
    expect(container.querySelector('a[href="/notes/page"]')?.nextElementSibling).toBe(today);
    expect(today.nextElementSibling?.matches('.journal-day.is-future:not(a):not(button)')).toBe(true);
    expect(container.querySelectorAll('.journal-day.is-future')).toHaveLength(85);
  });

  it('opens or creates the page for a day and goes to it', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/journal') return json({ year: 2026, today: '2026-10-07', days: [] });
      return path === '/me/journal/2026-10-06/page' && init?.method === 'POST' ? json({ noteId: 'page' }, 201) : undefined;
    });
    await render('/journal');

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Tuesday, October 6, write a page"]')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/journal/2026-10-06/page', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Note page');
  });

  it('writes today’s page from the header, or links to it once it exists', async () => {
    let noteId: string | null = null;
    const fetchMock = serve((path, init) => {
      if (path === '/me/journal') return json({ year: 2026, today: '2026-10-07', days: noteId ? [{ day: '2026-10-07', mood: null, noteId }] : [] });
      if (path === '/me/journal/2026-10-07/page' && init?.method === 'POST') return json({ noteId: 'today' }, 201);
      return undefined;
    });
    await render('/journal');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Write today’s page')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/journal/2026-10-07/page', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Note page');

    noteId = 'today';
    act(() => root.unmount());
    root = createRoot(container);
    await render('/journal');
    expect([...container.querySelectorAll('a')].find((link) => link.textContent === 'Open today’s page')?.getAttribute('href')).toBe('/notes/today');
  });

  it('writes a weekly review page and goes to it', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/journal') return json({ year: 2026, today: '2026-10-07', days: [] });
      return path === '/me/weekly-review' && init?.method === 'POST' ? json({ noteId: 'review' }, 201) : undefined;
    });
    await render('/review');

    await chooseFromMenu(container, 'Actions for Journal', 'Write a weekly review');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/weekly-review', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Note page');
  });

  it('writes one weekly review when the page mounts twice', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/journal') return json({ year: 2026, today: '2026-10-07', days: [] });
      return path === '/me/weekly-review' && init?.method === 'POST' ? json({ noteId: 'review' }, 201) : undefined;
    });
    await act(async () =>
      root.render(
        <StrictMode>
          <MemoryRouter initialEntries={['/review']}>
            <AuthProvider>
              <Routes>
                <Route path="/notes/:id" element={<p>Note page</p>} />
                <Route path="*" element={<App />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </StrictMode>,
      ),
    );
    await act(async () => {});
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/me/weekly-review')).toHaveLength(0);

    await chooseFromMenu(container, 'Actions for Journal', 'Write a weekly review');
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/me/weekly-review')).toHaveLength(1);
    expect(container.textContent).toContain('Note page');
  });
});
