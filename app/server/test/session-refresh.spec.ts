import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('browser session refresh', () => {
  it('shares an in-flight refresh within one tab', async () => {
    vi.stubGlobal('navigator', {});
    const { refreshSession } = await import('../../frontend/src/session-refresh');
    let complete!: (value: string) => void;
    const refresh = vi.fn(() => new Promise<string>((resolve) => { complete = resolve; }));
    const first = refreshSession(refresh);
    const second = refreshSession(refresh);

    expect(first).toBe(second);
    expect(refresh).toHaveBeenCalledTimes(1);
    complete('session');
    await expect(first).resolves.toBe('session');
    await expect(refreshSession(async () => 'next')).resolves.toBe('next');
  });

  it('serializes refreshes from separate tabs before reading the shared cookie', async () => {
    let queue = Promise.resolve<unknown>(undefined);
    const locks = {
      request: vi.fn((_name: string, refresh: () => Promise<unknown>) => {
        const next = queue.then(refresh);
        queue = next.catch(() => undefined);
        return next;
      }),
    };
    vi.stubGlobal('navigator', { locks });
    const firstTab = await import('../../frontend/src/session-refresh');
    vi.resetModules();
    const secondTab = await import('../../frontend/src/session-refresh');
    let cookie = 0;
    const seen: number[] = [];
    const rotate = async () => {
      const token = cookie;
      seen.push(token);
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (token !== cookie) throw new Error('Refresh token was already rotated');
      cookie++;
      return cookie;
    };

    await expect(Promise.all([firstTab.refreshSession(rotate), secondTab.refreshSession(rotate)])).resolves.toEqual([1, 2]);
    expect(seen).toEqual([0, 1]);
    expect(locks.request.mock.calls.map(([name]) => name)).toEqual(['strata-session-refresh', 'strata-session-refresh']);
  });

  it('releases failed refreshes for retry and supports browsers without locks', async () => {
    vi.stubGlobal('navigator', {});
    const { refreshSession } = await import('../../frontend/src/session-refresh');

    await expect(refreshSession(async () => { throw new Error('Offline'); })).rejects.toThrow('Offline');
    await expect(refreshSession(async () => 'restored')).resolves.toBe('restored');
  });
});
