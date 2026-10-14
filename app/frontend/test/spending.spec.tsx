import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { choose, chooseFromMenu } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC', features: ['spending'] };
const home = { id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const expense = (id: string, title: string, amountMinor: number, category: string, spentOn: string) => ({
  id,
  spaceId: 'home',
  title,
  amountMinor,
  currency: 'EUR',
  spentOn,
  category,
  paymentLabel: null,
  note: '',
  direction: 'spent',
  merchant: null,
  source: 'manual',
  accountId: null,
  toAccountId: null,
  split: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});
const october = {
  month: '2026-10',
  currency: 'EUR',
  ratesOn: '2026-10-09',
  missing: [],
  spentMinor: 7500,
  receivedMinor: 0,
  budgetMinor: 30000,
  committedMinor: 3000,
  categories: [
    { category: 'groceries', spentMinor: 5500, budgetMinor: 30000 },
    { category: 'eating out', spentMinor: 2000, budgetMinor: null },
  ],
  budgets: [{ category: 'groceries', amountMinor: 30000, currency: 'EUR' }],
  expenses: [expense('shop', 'Corner shop', 1500, 'groceries', '2026-10-20'), expense('diner', 'Diner', 2000, 'eating out', '2026-10-07'), expense('market', 'Market', 4000, 'groceries', '2026-10-05')],
};

const account = (id: string, name: string, kind: string, balanceMinor: number) => ({
  id,
  spaceId: 'home',
  name,
  kind,
  currency: 'EUR',
  cardDigits: kind === 'credit' ? ['4321'] : [],
  senders: [],
  creditLimitMinor: null,
  balanceMinor,
  missing: [],
});
let accounts: ReturnType<typeof account>[] = [];

describe('Spending', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    accounts = [];
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
      if (path === '/spaces/home/accounts' && !init?.method) return Promise.resolve(json(accounts));
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

  it('shows the month against its budgets and adds an expense', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/spaces/home/expenses' && init?.method === 'POST') return json(expense('bread', 'Bread', 350, 'groceries', '2026-10-11'), 201);
      return undefined;
    });
    await render('/spending?month=2026-10');

    expect([...container.querySelectorAll('dd')].map((value) => value.textContent)).toEqual(['€75.00', '€0.00', '€225.00 left of €300.00', '€30.00']);
    expect([...container.querySelectorAll('[role="progressbar"]')].map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['25', '18']);
    expect(container.textContent).toContain('€55.00 of €300.00');
    expect(container.textContent).toContain('Corner shop');

    await act(async () => button('Add expense').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Bread';
    form.querySelector<HTMLInputElement>('input[name="amount"]')!.value = '3,5';
    form.querySelector<HTMLInputElement>('input[name="paymentLabel"]')!.value = '4242 4242 4242';
    await submit(form);
    expect(container.textContent).toContain('never a card number');
    form.querySelector<HTMLInputElement>('input[name="paymentLabel"]')!.value = 'Visa ending 1234';
    await choose(form, 'Category', 'Groceries');
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/expenses' && init?.method === 'POST')![1]!.body));
    expect(body).toMatchObject({ title: 'Bread', amountMinor: 350, currency: 'EUR', category: 'groceries', paymentLabel: 'Visa ending 1234', note: '' });
  });

  it('sets and removes a category budget', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path.startsWith('/spaces/home/budgets/') && init?.method === 'PUT') return json({ category: 'eating out', amountMinor: 8000, currency: 'EUR' });
      if (path === '/spaces/home/budgets/groceries' && init?.method === 'DELETE') return new Response(null, { status: 204 });
      return undefined;
    });
    await render('/spending?month=2026-10');

    await chooseFromMenu(container, 'Actions for Eating out', 'Set a budget');
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="amount"]')!.value = '80';
    await submit(form);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/budgets/eating%20out', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ amountMinor: 8000, currency: 'EUR' }) }));
    expect(container.textContent).toContain('The eating out budget is €80.00 a month.');

    await chooseFromMenu(container, 'Actions for Groceries', 'Remove the budget');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/budgets/groceries', expect.objectContaining({ method: 'DELETE' }));
  });

  it('lists accounts with balances and records a transfer between them', async () => {
    accounts = [account('bank', 'CIB', 'bank', 120000), account('card', 'Visa', 'credit', -4500)];
    const transfer = { ...expense('move', 'Top up', 5000, 'other', '2026-10-12'), direction: 'transfer', accountId: 'bank', toAccountId: 'card' };
    const salary = { ...expense('pay', 'Salary', 300000, 'other', '2026-10-01'), direction: 'received', accountId: 'bank' };
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json({ ...october, receivedMinor: 300000, expenses: [transfer, salary] });
      if (path === '/spaces/home/expenses' && init?.method === 'POST') return json(transfer, 201);
      if (path === '/accounts/card' && init?.method === 'PATCH') return json(accounts[1]);
      return undefined;
    });
    await render('/spending?month=2026-10');

    expect(container.textContent).toContain('€1,200.00');
    expect(container.textContent).toContain('€45.00 owed');
    expect(container.textContent).toContain('Credit card · •••• 4321');
    expect(container.textContent).toContain('CIB → Visa');
    expect(container.textContent).toContain('+€3,000.00');

    await act(async () => button('Add expense').click());
    let form = container.querySelector('dialog form') as HTMLFormElement;
    await choose(form, 'Type', 'Transfer between accounts');
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Top up';
    form.querySelector<HTMLInputElement>('input[name="amount"]')!.value = '50';
    expect(form.querySelector('input[name="paymentLabel"]')).toBeNull();
    await submit(form);
    expect(container.textContent).toContain('Choose two different accounts.');
    await choose(form, 'From', 'CIB');
    await choose(form, 'To', 'Visa');
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/expenses' && init?.method === 'POST')![1]!.body));
    expect(body).toMatchObject({ title: 'Top up', amountMinor: 5000, direction: 'transfer', accountId: 'bank', toAccountId: 'card' });

    await chooseFromMenu(container, 'Actions for Visa', 'Edit');
    form = container.querySelector('dialog form') as HTMLFormElement;
    expect(form.querySelector<HTMLInputElement>('input[name="balance"]')!.value).toBe('45.00');
    form.querySelector<HTMLInputElement>('input[name="cardDigits"]')!.value = '4321, 99';
    await submit(form);
    expect(container.textContent).toContain('Enter the last 4 digits of each card');
    form.querySelector<HTMLInputElement>('input[name="cardDigits"]')!.value = '4321, 9999';
    form.querySelector<HTMLInputElement>('input[name="balance"]')!.value = '60';
    await submit(form);
    const patch = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/accounts/card' && init?.method === 'PATCH')![1]!.body));
    expect(patch).toMatchObject({ name: 'Visa', kind: 'credit', cardDigits: ['4321', '9999'], balanceMinor: -6000 });
  });
});
