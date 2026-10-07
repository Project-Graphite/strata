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
const mine = { id: 'mine', name: 'Personal', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };

describe('Calendars', () => {
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
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  }

  it('follows a calendar in an editable space, shows when it was checked and stops following it', async () => {
    const followed = { id: 'fixtures', spaceId: 'mine', name: 'Club fixtures', host: 'fixtures.example', lastFetchedAt: new Date().toISOString(), lastError: null, events: 12 };
    const sent: unknown[] = [];
    serve((path, init) => {
      if (path === '/me/calendar-feed') return json({ enabled: false });
      if (path === '/me/calendars') return json([]);
      if (path === '/spaces/mine/calendars' && init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)));
        return json(followed, 201);
      }
      if (path === '/calendars/fixtures' && init?.method === 'DELETE') return new Response(null, { status: 204 });
      return undefined;
    });
    await render('/agenda/calendars');

    const form = [...container.querySelectorAll('form')].find((candidate) => candidate.textContent?.includes('Follow a calendar'))!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Enter the calendar’s address.');
    form.querySelector<HTMLInputElement>('input[name="url"]')!.value = 'webcal://fixtures.example/cal.ics';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(sent).toEqual([{ url: 'webcal://fixtures.example/cal.ics' }]);
    expect(container.textContent).toContain('Personal · fixtures.example · 12 events · checked');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Stop following')!.click());
    expect(container.textContent).not.toContain('fixtures.example ·');
  });

  it('creates a private calendar link, shows it once, and can turn it off', async () => {
    let enabled = false;
    serve((path, init) => {
      if (path === '/me/calendar-feed' && init?.method === 'POST') {
        enabled = true;
        return json({ enabled, url: 'https://strata.example/api/v1/calendar/secret.ics' });
      }
      if (path === '/me/calendar-feed' && init?.method === 'DELETE') {
        enabled = false;
        return json({ enabled });
      }
      if (path === '/me/calendar-feed') return json({ enabled });
      if (path === '/me/calendars') return json([]);
      return undefined;
    });
    await render('/agenda/calendars');

    const button = (label: string) => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label)!;
    await act(async () => button('Create a calendar link').click());
    expect(container.textContent).toContain('https://strata.example/api/v1/calendar/secret.ics');
    expect(container.textContent).toContain('It is shown only once.');

    act(() => root.unmount());
    root = createRoot(container);
    await render('/agenda/calendars');
    expect(container.textContent).not.toContain('secret.ics');
    await act(async () => button('Turn the link off').click());
    expect(button('Create a calendar link')).toBeDefined();
  });
});
