import { describe, expect, it } from 'vitest';
import { describeQuickTask, parseQuickTask } from '../src/quick-add';

const monday = new Date('2026-10-05T10:00:00');
const parse = (text: string) => parseQuickTask(text, ['home', 'Work'], monday);

describe('plain-language quick add', () => {
  it('reads dates, times, tags and priority and keeps the rest as the title', () => {
    expect(parse('pay rent tomorrow 9am #home !2')).toEqual({ title: 'pay rent', dueDate: '2026-10-06', dueTime: '09:00', tagNames: ['home'], priority: 2 });
    expect(parse('call mum on friday at 6:30pm')).toEqual({ title: 'call mum', dueDate: '2026-10-09', dueTime: '18:30', tagNames: [] });
    expect(parse('standup next monday 09:15 #WORK')).toEqual({ title: 'standup', dueDate: '2026-10-12', dueTime: '09:15', tagNames: ['Work'] });
    expect(parse('renew passport in 3 weeks')).toMatchObject({ title: 'renew passport', dueDate: '2026-10-26' });
    expect(parse('book flights 12 oct')).toMatchObject({ title: 'book flights', dueDate: '2026-10-12' });
    expect(parse('dentist sept 3 noon')).toMatchObject({ title: 'dentist', dueDate: '2027-09-03', dueTime: '12:00' });
    expect(parse('film tonight')).toMatchObject({ title: 'film', dueDate: '2026-10-05', dueTime: '20:00' });
    expect(parse('send report 2026-11-30 !3')).toMatchObject({ title: 'send report', dueDate: '2026-11-30', priority: 3 });
  });

  it('puts a time alone on the next time it comes round', () => {
    expect(parse('stretch 4pm')).toMatchObject({ dueDate: '2026-10-05', dueTime: '16:00' });
    expect(parse('alarm 7am')).toMatchObject({ dueDate: '2026-10-06', dueTime: '07:00' });
  });

  it('leaves ordinary words, unknown tags and impossible values in the title', () => {
    expect(parse('buy sun cream at the market')).toEqual({ title: 'buy sun cream at the market', tagNames: [] });
    expect(parse('train for the marathon #garden !7')).toEqual({ title: 'train for the marathon #garden !7', tagNames: [] });
    expect(parse('fix 31 feb 13pm')).toEqual({ title: 'fix 31 feb 13pm', tagNames: [] });
    expect(parse('#home tomorrow')).toEqual({ title: '', dueDate: '2026-10-06', tagNames: ['home'] });
  });

  it('describes what it understood', () => {
    expect(describeQuickTask(parse('pay rent friday 9am #home !2'))).toBe(
      `due ${new Date('2026-10-09T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} 09:00 · tag home · medium priority`,
    );
    expect(describeQuickTask(parse('just a title'))).toBe('');
  });
});
