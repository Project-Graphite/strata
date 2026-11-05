import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conditionOf, outageCopy, outagePage, retryDelay, serverHealth } from '../../frontend/src/outage';

const pages = Object.fromEntries(Object.entries(outageCopy).map(([condition, copy]) => [condition, `/${copy.page}`]));

function serviceWorker(network: (url: string) => Promise<{ status: number }>) {
  const listeners = new Map<string, (event: unknown) => void>();
  const cached = new Map(Object.values(pages).map((page) => [page, { page }]));
  const source = readFileSync(new URL('../../frontend/service-worker.js', import.meta.url), 'utf8')
    .replace('__VERSION__', 'test')
    .replace('__ASSETS__', '[]')
    .replace('__OUTAGE_PAGES__', JSON.stringify(pages));
  runInNewContext(source, {
    URL,
    Response: { error: () => ({ error: true }), redirect: () => ({}) },
    caches: { match: async (key: string) => cached.get(key), open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], delete: async () => true },
    fetch: (request: { url: string }) => network(request.url),
    self: { location: { origin: 'https://strata.test' }, addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener), clients: {}, registration: {} },
  });
  return async (path: string) => {
    let answer: Promise<unknown> = Promise.resolve(undefined);
    listeners.get('fetch')!({ request: { url: `https://strata.test${path}`, method: 'GET', mode: 'navigate' }, respondWith: (response: Promise<unknown>) => (answer = response), waitUntil: () => {} });
    return answer;
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('outage screens when a page is opened', () => {
  it('shows the offline page when the network is gone', async () => {
    const open = serviceWorker(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(open('/tasks')).resolves.toEqual({ page: pages.offline });
  });

  it('shows the update page for 502 to 504 and the server error page for other 5xx', async () => {
    await expect(serviceWorker(async () => ({ status: 503 }))('/tasks')).resolves.toEqual({ page: pages.updating });
    await expect(serviceWorker(async () => ({ status: 500 }))('/tasks')).resolves.toEqual({ page: pages.failing });
    await expect(serviceWorker(async () => ({ status: 404 }))('/tasks')).resolves.toEqual({ status: 404 });
  });

  it('builds each page from the same copy the app uses, retrying with the same schedule', () => {
    for (const [condition, copy] of Object.entries(outageCopy)) {
      const html = outagePage(condition as keyof typeof outageCopy);
      expect(html).toContain(`<h1 class="outage-title">${copy.title}</h1>`);
      expect(html).toContain(`<p class="outage-eyebrow">${copy.eyebrow}</p>`);
      expect(html).toContain('Try again now');
      expect(html).toContain('data-delays="3000,6000,12000,15000"');
      expect(html).not.toContain('<script>');
    }
    expect([0, 1, 2, 3, 9].map(retryDelay)).toEqual([3000, 6000, 12000, 15000, 15000]);
  });
});

describe('outage screens after the app has loaded', () => {
  it('reports offline when the browser has no connection', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(serverHealth('/api/v1/health')).resolves.toBe('offline');
  });

  it('tells an update apart from a server error', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 502 })));
    await expect(serverHealth('/api/v1/health')).resolves.toBe('updating');
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 500 })));
    await expect(serverHealth('/api/v1/health')).resolves.toBe('failing');
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200 })));
    await expect(serverHealth('/api/v1/health')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(serverHealth('/api/v1/health')).resolves.toBe('updating');
  });

  it('names each condition once for both layers', () => {
    expect([conditionOf(null, false), conditionOf({ status: 503 }), conditionOf({ status: 500 }), conditionOf({ status: 200 })]).toEqual(['offline', 'updating', 'failing', null]);
  });
});
