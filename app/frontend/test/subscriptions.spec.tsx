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
const home = { id: 'home', name: 'Home', color: 'green', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const euros = (minor: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(minor / 100);
const music = {
  id: 'music',
  spaceId: 'home',
  name: 'Music',
  amountMinor: 999,
  currency: 'EUR',
  repeatRule: 'FREQ=MONTHLY',
  startDate: '2026-10-02',
  nextRenewal: '2026-11-02',
  timeZone: 'Etc/UTC',
  trialEndsOn: null,
  noticeDays: null,
  category: 'music',
  paymentLabel: 'Visa ending 1234',
  cancelUrl: null,
  supportUrl: null,
  usedBy: null,
  reminderDays: 3,
  lastUsedOn: null,
  cancelledOn: null,
};

describe('Recurring', () => {
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
  }

  const fill = (form: HTMLFormElement, name: string, value: string) => {
    form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!.value = value;
  };

  async function submit(form: HTMLFormElement) {
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('adds a subscription with its price in minor units and refuses a card number', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/subscriptions' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          name: 'Music',
          amountMinor: 999,
          currency: 'EUR',
          repeatRule: 'FREQ=MONTHLY',
          category: 'music',
          paymentLabel: 'Visa ending 1234',
          reminderDays: 3,
        });
        return json(music, 201);
      }
      if (path === '/spaces/home/subscriptions') return json([]);
      return undefined;
    });
    await render('/spaces/home/recurring');

    const add = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Add subscription')!;
    await act(async () => add.click());
    const form = document.querySelector('dialog form') as HTMLFormElement;
    fill(form, 'name', 'Music');
    fill(form, 'amount', '9.99');
    fill(form, 'category', 'music');
    fill(form, 'reminderDays', '3');
    fill(form, 'paymentLabel', '4242 4242 4242 4242');
    await submit(form);
    expect(document.body.textContent).toContain('never a card number');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/spaces/home/subscriptions', expect.objectContaining({ method: 'POST' }));

    fill(form, 'paymentLabel', 'Visa ending 1234');
    await submit(form);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/subscriptions', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain(`Music ${euros(999)}`);
    expect(container.textContent).toContain('monthly · music');
  });

  it('shows totals, trials and the still-worth-it list across spaces', async () => {
    serve((path) =>
      path === '/subscriptions/summary'
        ? json({
            totals: [{ currency: 'EUR', yearlyMinor: 11_988, monthlyMinor: 999 }],
            categories: [{ category: 'music', currency: 'EUR', yearlyMinor: 11_988, monthlyMinor: 999 }],
            upcoming: [music],
            trials: [{ ...music, id: 'video', name: 'Video', trialEndsOn: '2026-10-07' }],
            stillWorthIt: [{ ...music, id: 'old', name: 'Old app' }],
          })
        : undefined,
    );
    await render('/recurring');

    expect(container.textContent).toContain(`${euros(999)} a month`);
    expect(container.textContent).toContain(`${euros(11_988)} over the next year`);
    expect(container.textContent).toContain('Trials ending soon');
    expect(container.textContent).toContain('Video');
    expect(container.textContent).toContain('Still worth it?');
    expect(container.textContent).toContain('Old app');
  });

  it('fills the category and cancel link for a known service', async () => {
    serve((path) => (path === '/spaces/home/subscriptions' ? json([]) : undefined));
    await render('/spaces/home/recurring');

    const add = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Add subscription')!;
    await act(async () => add.click());
    const form = document.querySelector('dialog form') as HTMLFormElement;
    expect([...form.querySelectorAll('datalist option')].map((option) => option.getAttribute('value'))).toContain('Netflix');
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    name.value = 'netflix';
    await act(async () => {
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(form.querySelector<HTMLSelectElement>('select[name="category"]')!.value).toBe('streaming');
    expect(form.querySelector<HTMLInputElement>('input[name="cancelUrl"]')!.value).toBe('https://www.netflix.com/cancelplan');
  });

  it('adds up every currency in the home currency at ECB rates', async () => {
    serve((path) =>
      path === '/subscriptions/summary'
        ? json({
            home: { currency: 'EUR', yearlyMinor: 24_000, monthlyMinor: 2000, ratesOn: '2026-10-05', missing: ['XAU'] },
            totals: [
              { currency: 'EUR', yearlyMinor: 11_988, monthlyMinor: 999 },
              { currency: 'USD', yearlyMinor: 12_000, monthlyMinor: 1000 },
            ],
            categories: [],
            upcoming: [],
            trials: [],
            stillWorthIt: [],
          })
        : undefined,
    );
    await render('/recurring');

    expect(container.textContent).toContain('All together, in EUR');
    expect(container.textContent).toContain(`≈ ${euros(2000)} a month`);
    expect(container.textContent).toContain('ECB rates of');
    expect(container.textContent).toContain('Not included, with no rate available: XAU.');
  });
});
