import { act } from 'react';
import * as Y from 'yjs';
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
    expect(container.textContent).not.toContain('Date to be decided');
    const form = container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(form.querySelector('[role="alert"]')?.textContent).toBe('Choose yes, maybe or no.');
    expect(fetchMock.mock.calls.some(([path, init]) => path === `/api/v1/rsvp/${code}` && init?.method === 'POST')).toBe(false);

    await act(async () => form.querySelector<HTMLInputElement>('input[value="yes"]')!.click());
    expect(form.querySelector('[role="alert"]')).toBeNull();
    form.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value = 'Bringing cake';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/rsvp/${code}`, expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('your answer is saved');
  });

  it('lets a guest say which of the offered dates work', async () => {
    const option = { id: 'fri', startsOn: '2026-11-06', startTime: '20:00', yes: 1, maybe: 0, no: 0, mine: null };
    const sent: unknown[] = [];
    serve(false, (path, init) => {
      if (path === `/rsvp/${code}/poll` && init?.method === 'PUT') {
        sent.push(JSON.parse(String(init.body)));
        return json({ options: [{ ...option, yes: 2, mine: 'yes' }] });
      }
      if (path === `/rsvp/${code}/poll`) return json({ options: [option] });
      if (path === `/rsvp/${code}`) return json({ event: party, guest: { name: 'Sam', response: 'pending', note: null } });
      return undefined;
    });
    await render(`/rsvp/${code}`);

    expect(container.textContent).toContain('Date to be decided');
    expect(container.textContent).toContain('Which of these work for you?');
    expect(container.textContent).toContain('1 yes · 0 maybe · 0 no');
    const yes = container.querySelector<HTMLButtonElement>('[role="group"] button')!;
    await act(async () => yes.click());
    expect(sent).toEqual([{ votes: { fri: 'yes' } }]);
    expect(yes.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('2 yes · 0 maybe · 0 no');
    expect(container.textContent).not.toContain('Pick this date');
  });

  it('shows a shared page to a guest', async () => {
    const document = new Y.Doc();
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Two eggs and a pinch of salt')]);
    document.getXmlFragment('default').push([paragraph]);
    const state = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(document)));
    serve(false, (path) => {
      if (path === `/share/${code}`) return json({ access: 'view', item: { kind: 'note', title: 'Pancakes' }, event: null, datePoll: false, content: { kind: 'note', state } });
      return undefined;
    });
    await render(`/share/${code}`);
    for (let attempt = 0; attempt < 40 && !container.querySelector('[aria-label="Shared page"]'); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    expect(container.querySelector('h1')?.textContent).toBe('Pancakes');
    expect(container.textContent).toContain('Shared page');
    expect(container.querySelector('[aria-label="Shared page"]')?.textContent).toContain('Two eggs and a pinch of salt');
  });

  it('shows a shared board to a guest', async () => {
    serve(false, (path) =>
      path === `/share/${code}` ? json({ access: 'view', item: { kind: 'board', title: 'Seating' }, event: null, datePoll: false, content: { kind: 'board', elements: [] } }) : undefined,
    );
    await render(`/share/${code}`);
    expect(container.textContent).toContain('Shared board');
    expect(container.querySelector('[aria-label="Drawing of Seating"]')?.textContent).toBe('Nothing drawn yet');
  });

  it('tells a guest on an open invitation link that the date is still being decided', async () => {
    serve(false, (path) => (path === `/share/${code}` ? json({ access: 'view', item: { kind: 'event', title: 'Party' }, event: party, datePoll: true }) : undefined));
    await render(`/share/${code}`);

    expect(container.querySelector('h1')?.textContent).toBe('Party');
    expect(container.textContent).toContain('Date to be decided');
    expect(container.textContent).toContain('The date isn’t fixed yet.');
  });

  it('adds a board to an event and shows the boards it has', async () => {
    const details = { ...party, id: 'party', spaceId: 'club', reminderMinutes: null, guests: [], headcount: { yes: 0, no: 0, maybe: 0, pending: 0 } };
    const boardLink = { id: 'link', kind: 'reference', item: { id: 'plan', spaceId: 'club', kind: 'board', title: 'Seating' } };
    let outgoing: (typeof boardLink)[] = [];
    const sent: { path: string; body: unknown }[] = [];
    serve(true, (path, init) => {
      if (init?.method === 'POST' && (path === '/spaces/club/notes' || path === '/items/party/links')) {
        sent.push({ path, body: JSON.parse(String(init.body)) });
        if (path === '/items/party/links') outgoing = [boardLink];
        return json(path === '/spaces/club/notes' ? { id: 'plan' } : boardLink, 201);
      }
      if (path === '/items/party/links') return json({ outgoing, backlinks: [] });
      if (path === '/notes/plan/board') return json({ elements: [] });
      if (path === '/events/party/poll') return json({ options: [] });
      if (path === '/events/party') return json(details);
      return undefined;
    });
    await render('/events/party');

    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Add a board'))!;
    await act(async () => add.click());
    await act(async () => {});
    expect(sent).toEqual([
      { path: '/spaces/club/notes', body: { board: true, title: 'Party board' } },
      { path: '/items/party/links', body: { targetId: 'plan', kind: 'reference' } },
    ]);
    expect(container.querySelector('a[href="/notes/plan"]')?.textContent).toBe('Open Seating');
    expect(container.textContent).toContain('Nothing drawn yet');
  });

  it('lets an organiser offer dates, see who answered and pick one', async () => {
    const details = { ...party, id: 'party', spaceId: 'club', reminderMinutes: null, guests: [], headcount: { yes: 0, no: 0, maybe: 0, pending: 0 } };
    const option = (id: string, startsOn: string) => ({ id, startsOn, startTime: null, yes: 0, maybe: 0, no: 0, mine: null, voters: [] });
    const sent: { path: string; body: unknown }[] = [];
    serve(true, (path, init) => {
      if (init?.method === 'PUT' && path === '/events/party/poll') {
        sent.push({ path, body: JSON.parse(String(init.body)) });
        return json({ options: [option('a', '2026-11-06'), { ...option('b', '2026-11-07'), yes: 1, voters: [{ name: 'Sam', answer: 'yes' }] }] });
      }
      if (init?.method === 'POST' && path === '/events/party/poll/pick') {
        sent.push({ path, body: JSON.parse(String(init.body)) });
        return json({ ...details, startsOn: '2026-11-07', endsOn: '2026-11-07' });
      }
      if (path === '/events/party/poll') return json({ options: [] });
      if (path === '/events/party') return json(details);
      return undefined;
    });
    await render('/events/party');

    const button = (label: string) => [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === label)!;
    await act(async () => button('Offer dates').click());
    const set = (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => {
      set('Date 1', '2026-11-06');
      set('Date 2', '2026-11-07');
    });
    await act(async () => button('Save dates').click());
    expect(sent[0]).toEqual({
      path: '/events/party/poll',
      body: {
        options: [
          { startsOn: '2026-11-06', startTime: null },
          { startsOn: '2026-11-07', startTime: null },
        ],
      },
    });
    expect(container.textContent).toContain('Sam (yes)');

    await act(async () => [...container.querySelectorAll('button')].filter((candidate) => candidate.textContent === 'Pick this date')[1]!.click());
    await act(async () => [...document.querySelectorAll('dialog button')].find((candidate) => candidate.textContent === 'Use this date')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(sent[1]).toEqual({ path: '/events/party/poll/pick', body: { optionId: 'b' } });
    expect(container.textContent).not.toContain('Pick this date');
  });
});
