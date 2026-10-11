import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { allPushKinds } from '../src/push';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';

describe('Notifications on this device', () => {
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

  it('asks for permission, subscribes this device, narrows the kinds and turns it off again', async () => {
    let current: { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null = null;
    const subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: vi.fn(() => {
        current = null;
        return Promise.resolve(true);
      }),
    };
    const pushManager = {
      getSubscription: () => Promise.resolve(current),
      subscribe: vi.fn(() => {
        current = subscription;
        return Promise.resolve(subscription);
      }),
    };
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { requestPermission: vi.fn(() => Promise.resolve('granted')) });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: () => Promise.resolve({ pushManager }) } });
    const saved: unknown[] = [];
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/two-step') return Promise.resolve(json({ enabled: false, recoveryCodesLeft: 0 }));
      if (path === '/me') return Promise.resolve(json({ ...user, tidySummary: false, weeklyReview: false }));
      if (path === '/push/key') return Promise.resolve(json({ publicKey: 'B'.padEnd(87, 'A') }));
      if (path === '/me/push-subscriptions' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        saved.push(body);
        return Promise.resolve(json({ kinds: body.kinds }));
      }
      if (path === '/me/push-subscriptions' && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/settings']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    const toggle = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button[role="switch"]')].find((button) => document.getElementById(button.getAttribute('aria-labelledby')!)?.textContent === label)!;
    await vi.waitFor(() => expect(toggle('Notifications on this device')).toBeDefined());

    await act(async () => toggle('Notifications on this device').click());
    await vi.waitFor(() => expect(toggle('Comments on your pages')).toBeDefined());
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(saved[0]).toEqual({ endpoint, keys: { p256dh: 'p', auth: 'a' }, kinds: allPushKinds });

    await act(async () => toggle('Comments on your pages').click());
    expect((saved[1] as { kinds: string[] }).kinds).toEqual(allPushKinds.filter((kind) => kind !== 'comment'));

    await act(async () => toggle('Notifications on this device').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/push-subscriptions', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ endpoint }) }));
    expect(subscription.unsubscribe).toHaveBeenCalled();
    await vi.waitFor(() => expect(toggle('Comments on your pages')).toBeUndefined());
  });
});
