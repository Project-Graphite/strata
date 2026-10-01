import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, OutageError, apiRequest, onOutage } from '../src/api';

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports an outage when the server cannot be reached at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const listener = vi.fn();
    const unsubscribe = onOutage(listener);

    await expect(apiRequest('/catalog/movie/recent')).rejects.toBeInstanceOf(OutageError);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('treats a gateway error without an API body as an outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })),
    );
    const listener = vi.fn();
    const unsubscribe = onOutage(listener);

    await expect(apiRequest('/me')).rejects.toBeInstanceOf(OutageError);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps an API error with a message as an ordinary error, whatever its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 503, message: 'IGDB is not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const listener = vi.fn();
    const unsubscribe = onOutage(listener);

    const failure = await apiRequest('/catalog/game/search?query=zelda').catch(
      (reason: unknown) => reason,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).not.toBeInstanceOf(OutageError);
    expect(failure).toMatchObject({ status: 503, message: 'IGDB is not configured' });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
