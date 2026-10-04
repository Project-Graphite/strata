import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayKey } from '../src/agenda';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const club = { id: 'club', name: 'Club', color: 'teal', kind: 'shared', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const today = dayKey(new Date());
const party = {
  title: 'Party',
  startsOn: '2026-10-12',
  startTime: '20:00',
  endsOn: '2026-10-12',
  endTime: null,
  timeZone: 'Europe/London',
  repeatRule: null,
  location: 'The hall',
  meetingUrl: null,
  description: 'Bring snacks',
};
const code = 'r'.repeat(43);

describe('Agenda and RSVP', () => {
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

  function serve(signedIn: boolean, route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(signedIn ? json({ accessToken: 'token', user }) : new Response(null, { status: 401 }));
      if (path === '/spaces') return Promise.resolve(json([club]));
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

  it('lists events, due tasks and renewals by day, and creates an event', async () => {
    const fetchMock = serve(true, (path, init) => {
      if (path.startsWith('/agenda?')) {
        return json([
          { kind: 'task', itemId: 't', spaceId: 'club', title: 'Book the hall', allDay: true, start: today, end: null, location: null },
          { kind: 'renewal', itemId: 's', spaceId: 'club', title: 'Hall hire', allDay: true, start: today, end: null, location: null },
        ]);
      }
      if (path === '/spaces/club/events' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({ title: 'Party', startsOn: today, startTime: '20:00', endsOn: today, repeatRule: null });
        return json({ ...party, id: 'party', spaceId: 'club', reminderMinutes: null, guests: [], headcount: { yes: 0, no: 0, maybe: 0, pending: 0 } }, 201);
      }
      if (path === '/events/party') {
        return json({ ...party, id: 'party', spaceId: 'club', reminderMinutes: null, guests: [], headcount: { yes: 0, no: 0, maybe: 0, pending: 0 } });
      }
      return undefined;
    });
    await render('/agenda');

    expect(container.textContent).toContain('all day · due · Book the hall');
    expect(container.textContent).toContain('all day · renews · Hall hire');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'New event')!.click());
    const form = document.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Party';
    form.querySelector<HTMLInputElement>('input[name="startTime"]')!.value = '20:00';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/club/events', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('h1')?.textContent).toBe('Party');
    expect(container.textContent).toContain('0 coming');
  });

  it('lets a guest answer from their personal link without an account', async () => {
    const fetchMock = serve(false, (path, init) => {
      if (path === `/rsvp/${code}` && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ response: 'yes', note: 'Bringing cake' });
        return json({ event: party, guest: { name: 'Sam', response: 'yes', note: 'Bringing cake' } });
      }
      if (path === `/rsvp/${code}`) return json({ event: party, guest: { name: 'Sam', response: 'pending', note: null } });
      return undefined;
    });
    await render(`/rsvp/${code}`);

    expect(container.querySelector('h1')?.textContent).toBe('Party');
    expect(container.textContent).toContain('Hi Sam.');
    const form = container.querySelector('form')!;
    form.querySelector<HTMLInputElement>('input[value="yes"]')!.checked = true;
    form.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value = 'Bringing cake';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/rsvp/${code}`, expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('your answer is saved');
  });
});
