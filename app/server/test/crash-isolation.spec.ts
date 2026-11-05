import { describe, expect, it } from 'vitest';
import { CrashBoundary } from '../../frontend/src/components/CrashBoundary';
import { compareEntries, type BrowserEntry } from '../../frontend/src/components/FileBrowser';
import { formatDate, formatMoment, formatMonth, formatRange, profileClock, profileDay, profileMinutes } from '../../frontend/src/time';

const entry = (name: string, kind: BrowserEntry['kind'], updatedAt: string | null): BrowserEntry => ({ id: name, kind, name, mimeType: null, sizeBytes: null, updatedAt });

describe('crash isolation', () => {
  it('keeps a crash on the route that threw and clears it once another route opens', () => {
    const crashed = { attempt: 0, resetKey: '/files', ...CrashBoundary.getDerivedStateFromError(new RangeError('Invalid time value')) };

    expect(crashed.error?.message).toBe('Invalid time value');
    expect(CrashBoundary.getDerivedStateFromProps({ children: null, resetKey: '/files' }, crashed)).toBeNull();
    expect(CrashBoundary.getDerivedStateFromProps({ children: null, resetKey: '/agenda' }, crashed)).toEqual({ error: undefined, resetKey: '/agenda' });
  });

  it('wraps thrown values that are not errors', () => {
    expect(CrashBoundary.getDerivedStateFromError('broken').error).toEqual(new Error('broken'));
  });
});

describe('date helpers with missing dates', () => {
  it('return a dash instead of throwing for empty or invalid input', () => {
    for (const missing of ['', 'not a date', null, undefined]) {
      expect(formatMoment(missing)).toBe('—');
      expect(formatDate(missing)).toBe('—');
    }
    expect(profileDay('')).toBe('');
    expect(profileClock('')).toBe('—');
    expect(profileMinutes('')).toBe(0);
    expect(formatRange('', '2026-01-02')).toBe('—');
    expect(formatMonth('')).toBe('—');
    expect(formatDate('NaN-NaN-NaN')).toBe('—');
  });

  it('still format real dates', () => {
    expect(profileDay('2026-03-04T10:00:00Z')).toMatch(/^2026-03-0[45]$/);
    expect(formatMoment('2020-03-04T10:00:00Z')).not.toBe('—');
  });
});

describe('sorting files by last modified', () => {
  it('puts entries without a date last in either direction', () => {
    const entries = [entry('Space', 'folder', null), entry('Old', 'folder', '2026-01-01T00:00:00Z'), entry('New', 'folder', '2026-02-01T00:00:00Z')];
    expect([...entries].sort(compareEntries({ key: 'updatedAt', descending: true })).map(({ name }) => name)).toEqual(['New', 'Old', 'Space']);
    expect([...entries].sort(compareEntries({ key: 'updatedAt', descending: false })).map(({ name }) => name)).toEqual(['Old', 'New', 'Space']);
  });
});
