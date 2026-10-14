import { afterEach, describe, expect, it } from 'vitest';
import { applyTimeFormat, clockTime, timeOptions } from '../src/time';

describe('Time format', () => {
  afterEach(() => applyTimeFormat(undefined));

  it('shows times with AM and PM, on a 24-hour clock, or as the device does', () => {
    applyTimeFormat('12h');
    expect(clockTime('13:05')).toMatch(/^1:05\sPM$/);
    expect(new Date(2026, 0, 1, 9, 30).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', ...timeOptions() })).toMatch(/^9:30\sam$/i);

    applyTimeFormat('24h');
    expect(clockTime('13:05')).toBe('13:05');
    expect(new Date(2026, 0, 1, 9, 30).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...timeOptions() })).toBe('09:30');

    applyTimeFormat('auto');
    expect(timeOptions()).toEqual({});
  });
});
