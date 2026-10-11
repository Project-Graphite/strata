import { describe, expect, it } from 'vitest';
import { birthdayIn, birthdaysBetween, nextBirthday, validBirthday } from '../src/people/birthdays';

describe('birthdays', () => {
  it('finds the next birthday, today included, and moves 29 February to the 28th outside leap years', () => {
    expect(nextBirthday(10, 11, '2026-10-11')).toBe('2026-10-11');
    expect(nextBirthday(10, 10, '2026-10-11')).toBe('2027-10-10');
    expect(nextBirthday(2, 29, '2026-10-11')).toBe('2027-02-28');
    expect(nextBirthday(2, 29, '2027-03-01')).toBe('2028-02-29');
    expect(birthdayIn(2100, 2, 29)).toBe('2100-02-28');
  });

  it('lists birthdays inside a window that crosses the new year', () => {
    expect(birthdaysBetween(1, 2, '2026-12-20', '2027-01-19')).toEqual(['2027-01-02']);
    expect(birthdaysBetween(12, 25, '2026-12-20', '2027-01-19')).toEqual(['2026-12-25']);
    expect(birthdaysBetween(6, 1, '2026-12-20', '2027-01-19')).toEqual([]);
  });

  it('accepts only days that exist in the month', () => {
    expect(validBirthday(2, 29)).toBe(true);
    expect(validBirthday(2, 30)).toBe(false);
    expect(validBirthday(4, 31)).toBe(false);
  });
});
