import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { PaymentsWidget, SpendingWidget } from '../src/dashboard/money-widgets';
import { SpacesContext } from '../src/spaces';
import { choose, chooseFromMenu, pickChip, pickFromGrid } from './controls';

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
  from: '2026-10-01',
  until: '2026-10-31',
  carriedMinor: 0,
  safeDailyMinor: null,
  plan: { budgetMinor: null, currency: null, startDay: 1, rollover: false },
  currency: 'EUR',
  ratesOn: '2026-10-09',
  missing: [],
  spentMinor: 7500,
  receivedMinor: 0,
  budgetMinor: 30000,
  committedMinor: 3000,
  categories: [
    { category: 'groceries', spentMinor: 5500, budgetMinor: 30000, carriedMinor: 0 },
    { category: 'eating out', spentMinor: 2000, budgetMinor: null, carriedMinor: 0 },
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
let captures: object[] = [];
let rules: object[] = [];
let installments: object[] = [];
const categories = ['groceries', 'eating out', 'transport', 'other'].map((name) => ({ name, colour: name === 'other' ? 'gray' : 'green' }));

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
    captures = [];
    rules = [];
    installments = [];
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
      if (path === '/spaces/home/captures' && !init?.method) return Promise.resolve(json(captures));
      if (path === '/spaces/home/spending-categories' && !init?.method) return Promise.resolve(json(categories));
      if (path === '/spaces/home/merchant-rules' && !init?.method) return Promise.resolve(json(rules));
      if (path === '/spaces/home/installments' && !init?.method) return Promise.resolve(json(installments));
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
  const openTab = (label: string) =>
    act(async () =>
      void [...container.querySelectorAll('nav[aria-label="Spending"] a')]
        .find((link) => link.textContent === label)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    );
  const submit = (form: HTMLFormElement) => act(async () => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

  it('shows the month against its budgets and adds an expense', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/spaces/home/expenses' && init?.method === 'POST') return json(expense('bread', 'Bread', 350, 'groceries', '2026-10-11'), 201);
      return undefined;
    });
    await render('/spending?month=2026-10');

    expect([...container.querySelectorAll('dd')].map((value) => value.textContent)).toEqual(['€75.00', '€225.00', '—', '€0.00']);
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
    await pickChip(form, 'Groceries');
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
    await render('/spending?month=2026-10&tab=budgets');

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
    await render('/spending?month=2026-10&tab=accounts');

    expect(container.textContent).toContain('€1,200.00');
    expect(container.textContent).toContain('€45.00 owed');
    expect(container.textContent).toContain('Credit card · •••• 4321');
    expect(container.textContent).not.toContain('CIB → Visa');
    await openTab('Transactions');
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

    await openTab('Accounts');
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

  it('adds a bank message from the review list and ignores another', async () => {
    accounts = [account('bank', 'NBE', 'bank', 120000)];
    const text = 'تم خصم 250.00جم من بطاقة الخصم المباشر رقم ****1234 لدى CARREFOUR MAADI';
    captures = [
      { id: 'c1', sender: 'BanK-AlAhly', text, receivedAt: '2026-10-14T10:00:00Z', suggestion: { direction: 'spent', amountMinor: 25000, currency: 'EGP', merchant: 'CARREFOUR MAADI', accountId: 'bank' } },
      { id: 'c2', sender: 'Promo', text: 'Something odd for EGP 10', receivedAt: '2026-10-14T11:00:00Z', suggestion: { direction: null, amountMinor: 1000, currency: 'EGP', merchant: null, accountId: null } },
    ];
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/captures/c1/record' && init?.method === 'POST') return json(expense('carrefour', 'CARREFOUR MAADI', 25000, 'groceries', '2026-10-14'));
      if (path === '/captures/c2/ignore' && init?.method === 'POST') return new Response(null, { status: 204 });
      if (path === '/spaces/home/merchant-rules' && init?.method === 'POST') return json({ id: 'r1', match: 'carrefour maadi', rename: 'CARREFOUR MAADI', category: 'groceries', ignore: false });
      return undefined;
    });
    await render('/spending?month=2026-10');

    expect(container.textContent).toContain('To review (2)');
    expect(container.textContent).toContain('EGP\u00a0250.00');
    const review = [...container.querySelectorAll('li')].find((row) => row.textContent?.includes('CARREFOUR MAADI'))!;
    await act(async () => [...review.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Add')!.click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    expect(form.textContent).toContain(text);
    expect(form.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('CARREFOUR MAADI');
    expect(form.querySelector<HTMLInputElement>('input[name="amount"]')!.value).toBe('250.00');
    await pickChip(form, 'Groceries');
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path]) => path === '/api/v1/captures/c1/record')![1]!.body));
    expect(body).toMatchObject({ title: 'CARREFOUR MAADI', amountMinor: 25000, currency: 'EGP', spentOn: '2026-10-14', category: 'groceries', direction: 'spent', accountId: 'bank', merchant: 'CARREFOUR MAADI' });
    const rule = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/merchant-rules' && init?.method === 'POST')![1]!.body));
    expect(rule).toEqual({ match: 'carrefour maadi', rename: 'CARREFOUR MAADI', category: 'groceries' });

    const odd = [...container.querySelectorAll('li')].find((row) => row.textContent?.includes('Something odd'))!;
    await act(async () => [...odd.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Ignore')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/captures/c2/ignore', expect.objectContaining({ method: 'POST' }));
  });

  it('creates a send-only phone token and shows the forwarder settings', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/me/two-step') return json({ enabled: false, recoveryCodesLeft: 0 });
      if (path === '/me/tokens' && init?.method === 'POST') return json({ id: 't1', name: 'Phone texts for Home', scopes: ['spending:capture'], token: 'strata_pat_phone' }, 201);
      return undefined;
    });
    await render('/spending?month=2026-10');

    await chooseFromMenu(container, 'Actions for spending', 'Connect your phone');
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'secret words';
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path]) => path === '/api/v1/me/tokens')![1]!.body));
    expect(body).toEqual({ name: 'Phone texts for Home', scopes: ['spending:capture'], expiresInDays: 365, password: 'secret words' });
    expect(container.textContent).toContain(`${window.location.origin}/api/v1/spaces/home/captures`);
    expect(container.textContent).toContain('{"Authorization":"Bearer strata_pat_phone"}');
  });

  it('renames a category, keeps Other, and lists merchant rules', async () => {
    rules = [{ id: 'r1', match: 'uber', rename: 'Uber ride', category: 'transport', ignore: false }];
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/spaces/home/spending-categories' && init?.method === 'PUT') return json(categories);
      if (path === '/merchant-rules/r1' && init?.method === 'DELETE') return new Response(null, { status: 204 });
      return undefined;
    });
    await render('/spending?month=2026-10&tab=budgets');

    expect(container.textContent).toContain('Uber ride · Transport');
    await act(async () => button('Edit categories').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    const names = [...form.querySelectorAll<HTMLInputElement>('input[aria-label^="Name of category"]')];
    expect(names.map((input) => input.value)).toEqual(['groceries', 'eating out', 'transport', 'Other']);
    expect(names[3]!.disabled).toBe(true);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(names[0], 'food');
      names[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => form.querySelector<HTMLButtonElement>('button[aria-label="Remove eating out"]')!.click());
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/spending-categories' && init?.method === 'PUT')![1]!.body));
    expect(body.categories).toEqual([
      { name: 'food', colour: 'green', previous: 'groceries' },
      { name: 'transport', colour: 'green', previous: 'transport' },
      { name: 'other', colour: 'gray', previous: 'other' },
    ]);

    const row = [...container.querySelectorAll('li')].find((item) => item.textContent?.includes('Uber ride'))!;
    await act(async () => [...row.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Remove')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/merchant-rules/r1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('starts the month on payday, shows a daily allowance and saves budget settings', async () => {
    const payday = { ...october, month: '2026-09', from: '2026-09-25', until: '2026-10-24', safeDailyMinor: 2250, carriedMinor: 1000, plan: { budgetMinor: 30000, currency: 'EUR', startDay: 25, rollover: true } };
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending') return json(payday);
      if (path === '/spaces/home/spending-plan' && init?.method === 'PUT') return json(payday.plan);
      return undefined;
    });
    await render('/spending');

    expect(container.querySelector('h2')!.textContent).toBe('Sep 25 – Oct 24, 2026');
    expect(container.textContent).toContain('Safe to spend a day€22.50');
    await openTab('Budgets');
    await act(async () => button('Budget settings').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    expect(form.querySelector<HTMLInputElement>('input[name="budget"]')!.value).toBe('300.00');
    form.querySelector<HTMLInputElement>('input[name="budget"]')!.value = '';
    await pickFromGrid(form, 'Months start on', 'The 1st (calendar month)');
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/spending-plan' && init?.method === 'PUT')![1]!.body));
    expect(body).toEqual({ budgetMinor: null, currency: null, startDay: 1, rollover: true });
  });

  it('shows installment plans, marks a payment and adds a plan', async () => {
    const plan = {
      id: 'p1',
      spaceId: 'home',
      accountId: null,
      name: 'valU phone',
      currency: 'EUR',
      monthlyMinor: 10000,
      count: 6,
      firstDueOn: '2026-09-30',
      paidCount: 1,
      reminderDays: 3,
      totalMinor: 60000,
      remainingMinor: 50000,
      nextDueOn: '2026-10-31',
      status: 'due',
    };
    installments = [plan];
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/installments/p1/paid' && init?.method === 'POST') return json({ ...plan, paidCount: 2, remainingMinor: 40000, nextDueOn: '2026-11-30' });
      if (path === '/spaces/home/installments' && init?.method === 'POST') return json({ ...plan, id: 'p2', name: 'Laptop' }, 201);
      return undefined;
    });
    await render('/spending?month=2026-10&tab=accounts');

    expect(container.textContent).toContain('Next: €100.00 on Oct 31 · €500.00 left');
    expect(container.textContent).toContain('1 of 6');
    await chooseFromMenu(container, 'Actions for valU phone', 'Mark next payment paid');
    expect(container.textContent).toContain('2 of 6');

    await act(async () => button('Add plan').click());
    const form = container.querySelector('dialog form') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Laptop';
    form.querySelector<HTMLInputElement>('input[name="monthly"]')!.value = '250';
    form.querySelector<HTMLInputElement>('input[name="count"]')!.value = '0';
    await submit(form);
    expect(container.textContent).toContain('Enter 1 to 120 months.');
    form.querySelector<HTMLInputElement>('input[name="count"]')!.value = '10';
    await submit(form);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/installments' && init?.method === 'POST')![1]!.body));
    expect(body).toMatchObject({ name: 'Laptop', currency: 'EUR', monthlyMinor: 25000, count: 10, accountId: null });
  });

  it('shows months, category changes, merchants and days on the insights page', async () => {
    const period = (month: string, spentMinor: number, categories: object[]) => ({ month, from: `${month}-01`, until: `${month}-28`, spentMinor, receivedMinor: 0, categories });
    serve((path) => {
      if (path === '/spaces/home/spending/insights?months=6')
        return json({
          currency: 'EUR',
          missing: [],
          periods: [
            period('2026-05', 0, []),
            period('2026-06', 0, []),
            period('2026-07', 0, []),
            period('2026-08', 0, []),
            period('2026-09', 10000, [{ category: 'groceries', spentMinor: 10000 }]),
            period('2026-10', 15000, [
              { category: 'groceries', spentMinor: 4000 },
              { category: 'eating out', spentMinor: 11000 },
            ]),
          ],
          merchants: [{ merchant: 'Talabat', count: 3, totalMinor: 11000, averageMinor: 3667, lastOn: '2026-10-12' }],
          days: [
            { day: '2026-10-01', spentMinor: 0 },
            { day: '2026-10-02', spentMinor: 15000 },
          ],
        });
      return undefined;
    });
    await render('/spending/insights');

    const rows = [...container.querySelectorAll('table')[1]!.querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Eating out', '€110.00', '€0.00', '+€110.00'],
      ['Groceries', '€40.00', '€100.00', '−€60.00'],
    ]);
    expect(container.textContent).toContain('3 times · €36.67 on average');
    const days = [...container.querySelectorAll<HTMLElement>('.spend-day')];
    expect(days.map((day) => day.getAttribute('aria-label'))).toEqual(['Thu, Oct 1: €0.00', 'Fri, Oct 2: €150.00']);
    expect(days[0]!.getAttribute('style')).toBeNull();
    expect(days[1]!.getAttribute('style')).toContain('--color-paper');
  });

  it('exports the transactions as a CSV file', async () => {
    const created = vi.fn(() => 'blob:transactions');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const fetchMock = serve((path) => {
      if (path === '/spaces/home/spending?month=2026-10') return json(october);
      if (path === '/spaces/home/expenses/export') return new Response('date,title\r\n', { headers: { 'Content-Type': 'text/csv' } });
      return undefined;
    });
    await render('/spending?month=2026-10');
    await chooseFromMenu(container, 'Actions for spending', 'Export CSV');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/expenses/export', expect.anything());
    expect(created).toHaveBeenCalled();
  });

  it('shows the month and the next payments on Home widgets', async () => {
    accounts = [{ ...account('card', 'Visa', 'credit', -4500), dueDay: 20 } as ReturnType<typeof account>];
    installments = [{ id: 'p1', name: 'valU phone', currency: 'EUR', monthlyMinor: 10000, nextDueOn: '2026-10-31', status: 'missed' }];
    serve((path) => {
      if (path === '/spaces/home/spending') return json({ ...october, safeDailyMinor: 1500 });
      return undefined;
    });
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AuthProvider>
            <SpacesContext.Provider value={{ data: [home], error: undefined, reload: () => {}, mutate: () => {} } as never}>
              <SpendingWidget />
              <PaymentsWidget />
            </SpacesContext.Provider>
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    expect(container.textContent).toContain('€75.00 of €300.00');
    expect(container.textContent).toContain('€15.00 a day to stay on budget');
    expect(container.textContent).toContain('Corner shop');
    expect(container.textContent).toContain('valU phone€100.00 · missed Oct 31');
    expect(container.textContent).toContain('Visa€45.00');
  });

  it('adds up net worth, adds a certificate and saves towards a goal', async () => {
    const goal = { id: 'g1', spaceId: 'home', accountId: null, name: 'Car', currency: 'EUR', targetMinor: 1_000_000, savedMinor: 250_000, dueOn: '2027-06-01' };
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/home/net-worth')
        return json({ currency: 'EUR', missing: [], accountsMinor: 500_000, assetsMinor: 1_200_000, installmentsMinor: 100_000, totalMinor: 1_600_000, assets: [] });
      if (path === '/spaces/home/savings-goals' && !init?.method) return json([goal]);
      if (path === '/spaces/home/assets' && init?.method === 'POST') return json({}, 201);
      if (path === '/savings-goals/g1/add' && init?.method === 'POST') return json({ ...goal, savedMinor: 300_000 });
      return undefined;
    });
    await render('/spending/net-worth');

    expect([...container.querySelectorAll('dd')].map((value) => value.textContent)).toEqual(['€16,000.00', '€5,000.00', '€12,000.00', '€1,000.00']);
    expect(container.textContent).toContain('€2,500.00 of €10,000.00 · by Jun 1, 2027');

    await act(async () => button('Add an asset').click());
    let form = container.querySelector('dialog form') as HTMLFormElement;
    await choose(form, 'Kind', 'Certificate or deposit');
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Bank certificate';
    form.querySelector<HTMLInputElement>('input[name="value"]')!.value = '1000';
    form.querySelector<HTMLInputElement>('input[name="rate"]')!.value = '27';
    await submit(form);
    const asset = JSON.parse(String(fetchMock.mock.calls.find(([path, init]) => path === '/api/v1/spaces/home/assets' && init?.method === 'POST')![1]!.body));
    expect(asset).toEqual({ name: 'Bank certificate', kind: 'certificate', currency: 'EUR', valueMinor: 100_000, ratePercent: 27, maturesOn: null });

    await chooseFromMenu(container, 'Actions for Car', 'Add or take out');
    form = container.querySelector('dialog form') as HTMLFormElement;
    await choose(form, 'Action', 'Take out');
    form.querySelector<HTMLInputElement>('input[name="amount"]')!.value = '50';
    await submit(form);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/savings-goals/g1/add', expect.objectContaining({ body: JSON.stringify({ amountMinor: -5000 }) }));
  });

});
