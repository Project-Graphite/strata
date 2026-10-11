import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { tripDates } from '../src/trips';
import { chooseFromMenu, pickDay } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC', features: ['trips'] };
const home = { id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const trip = (id: string, title: string, when: string, startsOn: string, endsOn: string) => ({
  id,
  spaceId: 'home',
  spaceName: 'Home',
  title,
  destination: 'Lisbon',
  startsOn,
  endsOn,
  budgetMinor: 120000,
  currency: 'EUR',
  when,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});
const task = (id: string, title: string, completedAt: string | null) => ({
  id,
  spaceId: 'home',
  title,
  listId: 'packing',
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
});

describe('Trips', () => {
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
      if (path === '/me') return Promise.resolve(json({ ...user, homeCurrency: 'EUR' }));
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
  const submit = (form: HTMLFormElement) => act(async () => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

  it('groups trips by when they happen and plans a new one', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/me/trips') return json([trip('old', 'Last spring', 'past', '2026-04-01', '2026-04-03'), trip('lisbon', 'Lisbon', 'upcoming', '2027-05-01', '2027-05-06')]);
      if (path === '/spaces/home/trips' && init?.method === 'POST') return json(trip('porto', 'Porto', 'upcoming', '2027-06-10', '2027-06-12'), 201);
      if (path === '/trips/porto') return json({ ...trip('porto', 'Porto', 'upcoming', '2027-06-10', '2027-06-12'), itinerary: [], packing: null, documents: [], pages: [], expenses: [], spending: { currency: 'EUR', spentMinor: 0, missing: [] } });
      return undefined;
    });
    await render('/trips');

    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual(['Coming up', 'Past trips']);

    await act(async () => button('New trip').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Porto';
    await submit(form);
    expect(container.textContent).toContain('Choose when the trip starts and ends.');
    await pickDay(form, 'From', '2027-06-10');
    await pickDay(form, 'Until', '2027-06-12');
    form.querySelector<HTMLInputElement>('input[name="budget"]')!.value = '400';
    await submit(form);

    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/trips' && init?.method === 'POST')![1]!.body));
    expect(body).toEqual({ title: 'Porto', destination: '', startsOn: '2027-06-10', endsOn: '2027-06-12', budgetMinor: 40000, currency: 'EUR' });
    expect(container.querySelector('h1')?.textContent).toBe('Porto');
  });

  it('shows the itinerary, packing list, spending and documents, and packs an item', async () => {
    let detail = {
      ...trip('lisbon', 'Lisbon', 'upcoming', '2027-05-01', '2027-05-06'),
      itinerary: [{ linkId: 'l1', id: 'flight', title: 'Flight out', startsOn: '2027-05-01', startTime: '08:15', endsOn: '2027-05-01', endTime: null, location: 'Airport' }],
      packing: { id: 'packing', title: 'Packing for Lisbon', tasks: [task('passport', 'Passport', '2026-10-10T10:00:00Z'), task('charger', 'Charger', null)] },
      documents: [{ linkId: 'l2', id: 'pass', title: 'Boarding pass.pdf', mimeType: 'application/pdf', sizeBytes: 2048 }],
      pages: [],
      expenses: [{ linkId: 'l3', id: 'hotel', title: 'Hotel', amountMinor: 60000, currency: 'EUR', spentOn: '2027-05-01', category: 'travel' }],
      spending: { currency: 'EUR', spentMinor: 60000, missing: [] },
    };
    const fetchMock = serve((path, init) => {
      if (path === '/trips/lisbon') return json(detail);
      if (path === '/spaces/home/tasks' && init?.method === 'POST') {
        detail = { ...detail, packing: { ...detail.packing, tasks: [...detail.packing.tasks, task('socks', 'Socks', null)] } };
        return json(task('socks', 'Socks', null), 201);
      }
      if (path === '/items/lisbon/links/l2' && init?.method === 'DELETE') {
        detail = { ...detail, documents: [] };
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    await render('/trips/lisbon');

    expect(container.textContent).toContain(`Lisbon · ${tripDates({ startsOn: '2027-05-01', endsOn: '2027-05-06' })}`);
    expect(container.querySelector('a[href="/events/flight"]')?.textContent).toContain('08:15 · Airport');
    expect(container.textContent).toContain('1 of 2 packed');
    expect(container.textContent).toContain('€600.00 spent of €1,200.00');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');

    await act(async () => button('Add item').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Socks';
    await submit(form);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/tasks', expect.objectContaining({ body: JSON.stringify({ title: 'Socks', listId: 'packing' }) }));
    expect(container.textContent).toContain('1 of 3 packed');

    await chooseFromMenu(container, 'Actions for Boarding pass.pdf', 'Remove from this trip');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/lisbon/links/l2', expect.objectContaining({ method: 'DELETE' }));
    expect(container.textContent).toContain('Keep tickets, bookings and passports here');
  });
});
