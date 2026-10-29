import { describe, expect, it } from 'vitest';
import { mentions } from '../src/notes/note-comments.service';

describe('comment mentions', () => {
  it('matches @ and the whole display name, ignoring case', () => {
    expect(mentions('Can @mona Ali check this?', 'Mona Ali')).toBe(true);
    expect(mentions('Thanks @Mona Ali.', 'Mona Ali')).toBe(true);
    expect(mentions('@منى يمكنك المراجعة؟', 'منى')).toBe(true);
  });

  it('does not match a longer name, a bare name or an empty name', () => {
    expect(mentions('Ask @Monaco about it', 'Mona')).toBe(false);
    expect(mentions('Mona Ali should check', 'Mona Ali')).toBe(false);
    expect(mentions('Email me @ home', ' ')).toBe(false);
  });
});
