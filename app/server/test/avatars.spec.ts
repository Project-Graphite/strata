import { describe, expect, it } from 'vitest';
import { initialsOf } from '../../frontend/src/components/UserAvatar';

describe('avatar initials', () => {
  it('uses the first and last word of a name', () => {
    expect(initialsOf('ada lovelace')).toBe('AL');
    expect(initialsOf('  Grace  Brewster Hopper ')).toBe('GH');
  });

  it('uses one letter for a single word and a placeholder for an empty name', () => {
    expect(initialsOf('Amr')).toBe('A');
    expect(initialsOf('   ')).toBe('?');
  });

  it('keeps letters made of more than one code unit whole', () => {
    expect(initialsOf('𝒜da Byron')).toBe('𝒜B');
  });
});
