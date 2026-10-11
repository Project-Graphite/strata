import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { automaticDashboard } from '../src/dashboard/Dashboard';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const widgets = [
  { id: 'clock', type: 'clock', size: 'small', settings: {} },
  { id: 'links', type: 'shortcuts', size: 'wide', settings: { links: [{ label: 'Mail', url: 'https://mail.example.com' }] } },
  { id: 'inbox', type: 'inbox', size: 'medium', settings: {} },
];
const home = { id: 'home', name: 'Home', position: 0, layout: { widgets }, showFrom: null, showUntil: null, showOn: 'any' };

describe('Home dashboard', () => {
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

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label || candidate.getAttribute('aria-label') === label)!;
  const titles = () => [...container.querySelectorAll('article h2')].map((title) => title.textContent);

  it('shows each widget on its own, and saves a rearranged layout only when done', async () => {
    let saved: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards') return Promise.resolve(json([home]));
        if (path === '/me/inbox?page=1') return Promise.resolve(json({ message: 'The inbox is unavailable' }, 400));
        if (path === '/me/dashboards/home' && init?.method === 'PATCH') {
          saved = JSON.parse(String(init.body));
          return Promise.resolve(json({ ...home, name: 'Mornings', layout: (saved as { layout: unknown }).layout }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    expect(titles()).toEqual(['Clock', 'Shortcuts', 'Inbox']);
    expect(container.querySelector('a[href="https://mail.example.com"]')?.textContent).toContain('Mail');
    expect(container.textContent).toContain('The inbox is unavailable');
    expect(container.querySelector('button[aria-label="Move Clock later"]')).toBeNull();

    await act(async () => button('Edit').click());
    await act(async () => button('Move Clock later').click());
    expect(titles()).toEqual(['Shortcuts', 'Clock', 'Inbox']);
    await act(async () => button('Undo').click());
    expect(titles()).toEqual(['Clock', 'Shortcuts', 'Inbox']);
    const removeInbox = [...container.querySelectorAll('article')].find((article) => article.getAttribute('aria-label') === 'Inbox')!;
    await act(async () => [...removeInbox.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Remove')!.click());
    expect(saved).toBeUndefined();

    await act(async () => button('Done').click());
    expect(saved).toEqual({ layout: { widgets: widgets.slice(0, 2) }, name: 'Home' });
    expect(titles()).toEqual(['Clock', 'Shortcuts']);
  });
  it('opens the dashboard as a wall display that keeps the screen on, and leaves it with Escape', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards') return Promise.resolve(json([home]));
        if (path === '/me/inbox?page=1') return Promise.resolve(json({ page: 1, totalPages: 1, totalResults: 0, results: [] }));
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    const wall = [...container.querySelectorAll('a')].find((link) => link.getAttribute('aria-label') === 'Wall display')!;
    expect(wall.getAttribute('href')).toBe('/?d=home&display=wall');
    await act(async () => wall.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

    expect(titles()).toEqual(['Clock', 'Shortcuts', 'Inbox']);
    expect(container.querySelector('.fixed.inset-0')).not.toBeNull();
    expect(button('Edit')).toBeUndefined();
    expect(request).toHaveBeenCalledWith('screen');

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    expect(button('Edit')).toBeDefined();
    expect(release).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
  it('counts down to a date, runs a focus timer and sums up what Tidy found', async () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000);
    const date = `${inThreeDays.getFullYear()}-${String(inThreeDays.getMonth() + 1).padStart(2, '0')}-${String(inThreeDays.getDate()).padStart(2, '0')}`;
    const extras = {
      ...home,
      layout: {
        widgets: [
          { id: 'trip', type: 'countdown', size: 'small', settings: { label: 'Trip', date } },
          { id: 'focus', type: 'focus', size: 'small', settings: { minutes: 50, breakMinutes: 10 } },
          { id: 'tidy', type: 'tidy', size: 'small', settings: {} },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards') return Promise.resolve(json([extras]));
        if (path === '/tidy/scan') {
          return Promise.resolve(
            json({
              files: { duplicates: [{ savingBytes: 2 * 1024 * 1024, items: [{}, {}, {}] }], large: [], old: [{}] },
              subscriptions: { unused: [{ id: 's' }], duplicates: [{ items: [{ id: 's' }, { id: 't' }] }], overlapping: [] },
            }),
          );
        }
        if (path === '/tidy/history') return Promise.resolve(json([]));
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    expect(titles()).toEqual(['Countdown', 'Focus timer', 'Tidy status']);
    expect(container.textContent).toContain('3 days');
    expect(container.textContent).toContain('until Trip');
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('50:00');
    await act(async () => button('Start').click());
    expect(button('Pause')).toBeDefined();
    await act(async () => button('Reset').click());
    expect(button('Start')).toBeDefined();
    expect(container.textContent).toContain('2 extra copies (2.0 MB)');
    expect(container.textContent).toContain('1 old upload');
    expect(container.textContent).toContain('2 subscriptions to check');
    expect(container.textContent).toContain('Not tidied yet');
  });

  it('adds a dashboard from the plus button through a modal with a template', async () => {
    let posted: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards' && init?.method === 'POST') {
          posted = JSON.parse(String(init.body));
          return Promise.resolve(json({ id: 'trip', name: 'Lisbon', position: 1, layout: { widgets: [] } }, 201));
        }
        if (path === '/me/dashboards') return Promise.resolve(json([home]));
        return Promise.resolve(json({ message: 'Not here' }, 404));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    expect(container.querySelector('select[aria-label="New dashboard"]')).toBeNull();
    await act(async () => button('New dashboard').click());
    const form = container.querySelector('dialog form')!;
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    expect(name.value).toBe('Morning briefing');
    const travel = form.querySelector<HTMLInputElement>('input[value="travel"]')!;
    await act(async () => travel.click());
    expect(name.value).toBe('Travel');
    name.value = 'Lisbon';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(posted).toEqual({ name: 'Lisbon', template: 'travel' });
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Lisbon');
  });

  it('shows the weather for the chosen place and merges stories from several feeds', async () => {
    const outside = {
      ...home,
      layout: {
        widgets: [
          { id: 'sky', type: 'weather', size: 'small', settings: { place: { name: 'Lisbon, Portugal', latitude: 38.72, longitude: -9.13 }, unit: 'celsius' } },
          { id: 'paper', type: 'news', size: 'medium', settings: { feeds: ['https://one.example/feed', 'https://two.example/feed', 'https://down.example/feed'], count: 3 } },
        ],
      },
    };
    const fetchMock = vi.fn((input: string) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/dashboards') return Promise.resolve(json([outside]));
      if (path.startsWith('/widgets/weather?')) {
        return Promise.resolve(json({ unit: 'celsius', current: { temperature: 18, code: 61, wind: 12 }, daily: [{ date: '2026-10-05', code: 61, high: 19, low: 11 }] }));
      }
      if (path === `/widgets/feed?url=${encodeURIComponent('https://one.example/feed')}`) {
        return Promise.resolve(json({ title: 'One', items: [{ title: 'Older story', link: 'https://one.example/a', published: '2026-10-01T10:00:00.000Z' }] }));
      }
      if (path === `/widgets/feed?url=${encodeURIComponent('https://two.example/feed')}`) {
        return Promise.resolve(json({ title: 'Two', items: [{ title: 'Newest story', link: 'https://two.example/b', published: '2026-10-04T10:00:00.000Z' }] }));
      }
      return Promise.resolve(json({ message: 'Could not read that feed' }, 502));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/widgets/weather?latitude=38.72&longitude=-9.13&unit=celsius', expect.anything());
    const weather = container.querySelector('article[aria-label="Weather"]')!;
    expect(weather.textContent).toContain('18°C');
    expect(weather.textContent).toContain('Rain · Lisbon · wind 12 km/h');
    const news = container.querySelector('article[aria-label="News"]')!;
    expect([...news.querySelectorAll('a')].map((link) => link.textContent)).toEqual(['Newest story', 'Older story']);
    expect(news.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(news.textContent).toContain('1 of 3 feeds didn’t load.');
  });

  it('says which of your apps answer, with the Project Graphite apps as the starting list', async () => {
    const status = {
      ...home,
      layout: { widgets: [{ id: 'up', type: 'status', size: 'medium', settings: { sites: ['https://strata.project-graphite.com/health', 'https://shop.example/', 'https://blog.example/'] } }] },
    };
    const fetchMock = vi.fn((input: string) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/dashboards') return Promise.resolve(json([status]));
      if (path === `/widgets/status?url=${encodeURIComponent('https://strata.project-graphite.com/health')}`) return Promise.resolve(json({ up: true, status: 200, ms: 84, error: null }));
      if (path === `/widgets/status?url=${encodeURIComponent('https://shop.example/')}`) return Promise.resolve(json({ up: false, status: 503, ms: 120, error: null }));
      return Promise.resolve(json({ message: 'Too many requests' }, 429));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});

    const widget = container.querySelector('article[aria-label="Are my apps up?"]')!;
    expect(widget.textContent).toContain('2 of 3 not answering.');
    expect([...widget.querySelectorAll('li')].map((row) => row.textContent)).toEqual(['strataup · 84 ms', 'shop.exampledown · 503', 'blog.exampleToo many requests']);
    expect([...widget.querySelectorAll('.tag-dot')].map((dot) => dot.classList.contains('tag-green'))).toEqual([true, false, false]);
    const { widgetKinds } = await import('../src/dashboard/widgets');
    expect(widgetKinds.status.settings.sites).toContain('https://strata.project-graphite.com/health');
  });

  it('lists pinned pages first, then recently edited ones, with their space', async () => {
    const reading = { ...home, layout: { widgets: [{ id: 'pages', type: 'pages', size: 'medium', settings: {} }] } };
    const page = (id: string, title: string, pinnedAt: string | null) => ({
      id,
      spaceId: 'mine',
      title,
      parentId: null,
      position: 1,
      icon: null,
      pinnedAt,
      template: false,
      database: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([{ id: 'mine', name: 'Mine', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' }]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards') return Promise.resolve(json([reading]));
        if (path === '/me/pages') return Promise.resolve(json({ pinned: [page('trip', 'Trip plan', '2026-10-06T10:00:00Z')], recent: [page('memo', '', null)] }));
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});

    const widget = container.querySelector('article[aria-label="Pinned and recent pages"]')!;
    expect([...widget.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(['Pinned', 'Recently edited']);
    expect([...widget.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Trip plan', '/notes/trip'],
      ['Untitled', '/notes/memo'],
    ]);
    expect(widget.textContent).toContain('Mine ·');
  });

  it('saves a quick note as a page or as a task in the chosen space', async () => {
    const quick = { ...home, layout: { widgets: [{ id: 'jot', type: 'capture', size: 'medium', settings: {} }] } };
    const spaces = [
      { id: 'mine', name: 'Mine', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' },
      { id: 'flat', name: 'Flat', color: 'blue', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' },
      { id: 'club', name: 'Club', color: 'red', kind: 'shared', role: 'viewer', createdAt: '2026-10-01T00:00:00Z' },
    ];
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json(spaces));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/dashboards') return Promise.resolve(json([quick]));
      if (init?.method === 'POST') return Promise.resolve(json({ id: 'new' }, 201));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});

    const widget = container.querySelector('article[aria-label="Quick note"]')!;
    const note = widget.querySelector<HTMLTextAreaElement>('textarea')!;
    const space = widget.querySelector<HTMLSelectElement>('select')!;
    expect([...space.options].map((option) => option.textContent)).toEqual(['Mine', 'Flat']);
    const type = async (text: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(note, text);
        note.dispatchEvent(new Event('input', { bubbles: true }));
      });

    await type('Call the landlord\nabout the boiler');
    await act(async () => button('Save as page').click());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/spaces/mine/notes',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Call the landlord\nabout the boiler' }) }),
    );
    expect(note.value).toBe('');

    await act(async () => {
      space.value = 'flat';
      space.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type('Buy bin bags\nthe big ones');
    await act(async () => button('Save as task').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/flat/tasks', expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Buy bin bags' }) }));
  });

  it('opens the dashboard that fits the time and device unless one was chosen in this visit', async () => {
    const plain = { id: 'plain', showFrom: null, showUntil: null, showOn: 'any' as const };
    const night = { id: 'night', showFrom: 22 * 60, showUntil: 6 * 60, showOn: 'any' as const };
    const commute = { id: 'commute', showFrom: 7 * 60, showUntil: 9 * 60, showOn: 'phone' as const };
    const all = [plain, night, commute];
    expect(automaticDashboard(all, new Date(2026, 9, 5, 23, 30), false)?.id).toBe('night');
    expect(automaticDashboard(all, new Date(2026, 9, 5, 5, 59), true)?.id).toBe('night');
    expect(automaticDashboard(all, new Date(2026, 9, 5, 8, 0), true)?.id).toBe('commute');
    expect(automaticDashboard(all, new Date(2026, 9, 5, 8, 0), false)?.id).toBe('plain');
    expect(automaticDashboard([commute], new Date(2026, 9, 5, 12, 0), false)?.id).toBe('commute');

    vi.useFakeTimers({ now: new Date(2026, 9, 5, 23, 0), toFake: ['Date'] });
    sessionStorage.clear();
    let saved: unknown;
    const late = { ...home, id: 'late', name: 'Late', position: 1, showFrom: 22 * 60, showUntil: 6 * 60 };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards') return Promise.resolve(json([{ ...home, layout: { widgets: [] } }, { ...late, layout: { widgets: [] } }]));
        if (path === '/me/dashboards/late' && init?.method === 'PATCH') {
          saved = JSON.parse(String(init.body));
          return Promise.resolve(json({ ...late, layout: { widgets: [] }, showFrom: 21 * 60, showOn: 'desktop' }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    try {
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={['/']}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </MemoryRouter>,
        ),
      );
      expect(container.querySelector('h1')?.textContent).toBe('Late');

      await act(async () => button('Edit').click());
      const time = (label: string) => [...container.querySelectorAll('label')].find((candidate) => candidate.textContent?.startsWith(label))!.querySelector('input')!;
      expect(time('From').value).toBe('22:00');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(time('From'), '21:00');
        time('From').dispatchEvent(new Event('input', { bubbles: true }));
        const device = [...container.querySelectorAll('label')].find((candidate) => candidate.textContent?.startsWith('On'))!.querySelector('select')!;
        device.value = 'desktop';
        device.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => button('Done').click());
      expect(saved).toEqual({ layout: { widgets: [] }, name: 'Late', showFrom: 1260, showUntil: 360, showOn: 'desktop' });

      act(() => root.unmount());
      root = createRoot(container);
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={['/?d=home']}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </MemoryRouter>,
        ),
      );
      act(() => root.unmount());
      root = createRoot(container);
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={['/']}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </MemoryRouter>,
        ),
      );
      expect(container.querySelector('h1')?.textContent).toBe('Home');
    } finally {
      vi.useRealTimers();
      sessionStorage.clear();
    }
  });
});
