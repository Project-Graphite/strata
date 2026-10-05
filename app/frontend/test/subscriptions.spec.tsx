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

  it('suggests subscriptions from a statement read in the browser and skips ones already tracked', async () => {
    const created: unknown[] = [];
    const fetchMock = serve((path, init) => {
      if (path === '/subscriptions/summary') {
        return json({ home: null, totals: [{ currency: 'EUR', yearlyMinor: 11_988, monthlyMinor: 999 }], categories: [], upcoming: [music], trials: [], stillWorthIt: [] });
      }
      if (path === '/spaces/home/subscriptions' && init?.method === 'POST') {
        created.push(JSON.parse(String(init.body)));
        return json(music, 201);
      }
      if (path === '/spaces/home/subscriptions') return json([music]);
      return undefined;
    });
    await render('/recurring');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Import a statement')!.click());
    const statement = [
      'Booked;Payee;Amount',
      '03/01/2026;NETFLIX.COM 866;-15,49',
      '03/02/2026;NETFLIX.COM 866;-15,49',
      '03/03/2026;NETFLIX.COM 866;-15,49',
      '14/01/2026;Music Ltd;-9,99',
      '14/02/2026;Music Ltd;-9,99',
      '14/03/2026;Music Ltd;-9,99',
    ].join('\n');
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Statement file"]')!;
    Object.defineProperty(input, 'files', { value: [new File([statement], 'statement.csv', { type: 'text/csv' })] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const dialog = document.querySelector('dialog')!;
    expect(dialog.textContent).toContain('6 charges read · 2 look recurring');
    expect(dialog.textContent).toContain('already tracked in this space');
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('statement'))).toBe(false);
    await act(async () => [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Add 1 subscription')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(created).toEqual([
      {
        name: 'Netflix',
        amountMinor: 1549,
        currency: 'EUR',
        repeatRule: 'FREQ=MONTHLY',
        startDate: '2026-03-03',
        category: 'streaming',
        cancelUrl: 'https://www.netflix.com/cancelplan',
      },
    ]);
    expect(container.textContent).toContain('Added 1 subscription.');
  });

  it('splits a shared subscription and settles up what is owed', async () => {
    const flat = { id: 'flat', name: 'Flat', color: 'teal', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' };
    const internet = { ...music, id: 'internet', spaceId: 'flat', name: 'Internet', split: null };
    const owes = { fromUserId: 'sam', fromName: 'Sam', toUserId: 'me', toName: 'Amr', amountMinor: 2000, currency: 'EUR' };
    let settled = false;
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([flat]));
        if (path === '/spaces/flat') return Promise.resolve(json(flat));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/spaces/flat/subscriptions') return Promise.resolve(json([internet]));
        if (path === '/spaces/flat/members') {
          return Promise.resolve(json([{ userId: 'me', displayName: 'Amr', role: 'owner' }, { userId: 'sam', displayName: 'Sam', role: 'editor' }]));
        }
        if (path === '/subscriptions/internet/split') {
          sent.push(JSON.parse(String(init?.body)));
          return Promise.resolve(json({ payerId: 'me', shares: [{ userId: 'me', weight: 1 }, { userId: 'sam', weight: 2 }] }));
        }
        if (path.startsWith('/spaces/flat/balances?month=')) {
          return Promise.resolve(
            json({
              month: path.slice(-7),
              charges: [{ itemId: 'internet', name: 'Internet', payerName: 'Amr', amountMinor: 3000, currency: 'EUR', renewals: [] }],
              debts: settled ? [] : [owes],
              settlements: settled ? [{ ...owes, id: 'paid' }] : [],
            }),
          );
        }
        if (path === '/spaces/flat/settlements') {
          sent.push(JSON.parse(String(init?.body)));
          settled = true;
          return Promise.resolve(json({ id: 'paid' }, 201));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await render('/spaces/flat/recurring');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Split')!.click());
    const dialog = document.querySelector('dialog')!;
    const samShares = dialog.querySelector<HTMLInputElement>('input[aria-label="Shares for Sam"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(samShares, '2');
      samShares.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(dialog.textContent).toContain('67%');
    await submit(dialog.querySelector('form')!);
    expect(sent[0]).toEqual({ payerId: 'me', shares: [{ userId: 'me', weight: 1 }, { userId: 'sam', weight: 2 }] });
    expect(container.textContent).toContain('split · paid by Amr');

    const balances = container.querySelector('section[aria-label="Split costs"]')!;
    expect(balances.textContent).toContain(`Sam owes Amr ${euros(2000)}`);
    await act(async () => [...balances.querySelectorAll('button')].find((button) => button.textContent === 'Settle up')!.click());
    expect(sent[1]).toEqual({ fromUserId: 'sam', toUserId: 'me', amountMinor: 2000, currency: 'EUR', month: new Date().toISOString().slice(0, 7) });
    expect(container.querySelector('section[aria-label="Split costs"]')!.textContent).toContain('Everyone is square.');
  });
});
