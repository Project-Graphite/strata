import { afterEach, describe, expect, it, vi } from 'vitest';
import { wipeLocalData } from '../src/local-data';

describe('wipeLocalData', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deletes every cache and every IndexedDB database', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['strata-abc', 'strata-def']), delete: deleteCache });
    const deleteDatabase = vi.fn(() => {
      const request: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'drafts' }, { name: undefined }]),
      deleteDatabase,
    });

    await wipeLocalData();

    expect(deleteCache.mock.calls).toEqual([['strata-abc'], ['strata-def']]);
    expect(deleteDatabase.mock.calls).toEqual([['drafts']]);
  });
});
