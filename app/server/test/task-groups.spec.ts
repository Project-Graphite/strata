import { describe, expect, it } from 'vitest';
import { parseQuickTask, quickSuggestions, withSuggestion } from '../../frontend/src/quick-add';
import { groupTasks, reorderTask, taskGroupOf } from '../../frontend/src/task-groups';

const spaceId = 'space-a';
const task = (id: string, dueDate: string | null, position: number, space = spaceId) => ({ id, spaceId: space, dueDate, position });

describe('task groups', () => {
  it('sorts due dates into overdue, today, tomorrow, this week, later and no date with a Sunday week', () => {
    const today = '2026-10-28';
    expect(taskGroupOf('2026-10-27', today, 0)).toBe('overdue');
    expect(taskGroupOf(today, today, 0)).toBe('today');
    expect(taskGroupOf('2026-10-29', today, 0)).toBe('tomorrow');
    expect(taskGroupOf('2026-10-31', today, 0)).toBe('week');
    expect(taskGroupOf('2026-11-01', today, 0)).toBe('later');
    expect(taskGroupOf(null, today, 0)).toBe('none');
  });

  it('follows the profile week start', () => {
    expect(taskGroupOf('2026-11-01', '2026-10-28', 1)).toBe('week');
    expect(taskGroupOf('2026-11-02', '2026-10-28', 1)).toBe('later');
    expect(taskGroupOf('2026-10-31', '2026-10-31', 0)).toBe('today');
    expect(taskGroupOf('2026-11-02', '2026-10-31', 0)).toBe('later');
  });

  it('keeps only non-empty groups in order, sorting each by due date then position', () => {
    const groups = groupTasks([task('c', null, 5), task('b', '2026-10-30', 9), task('a', '2026-10-30', 2), task('d', '2026-10-20', 1)], '2026-10-28', 0);
    expect(groups.map((group) => [group.key, group.tasks.map((shown) => shown.id)])).toEqual([
      ['overdue', ['d']],
      ['week', ['a', 'b']],
      ['none', ['c']],
    ]);
  });
});

describe('task reordering', () => {
  const day = [task('a', '2026-10-28', 1024), task('b', '2026-10-28', 2048), task('c', '2026-10-28', 3072)];

  it('places a task between its new neighbours', () => {
    expect(reorderTask(day, 'a', 1)).toEqual({ previousId: 'b', nextId: 'c', position: 2560 });
    expect(reorderTask(day, 'c', 0)).toEqual({ previousId: null, nextId: 'a', position: 0 });
    expect(reorderTask(day, 'a', 2)).toEqual({ previousId: 'c', nextId: null, position: 4096 });
  });

  it('refuses moves that break the due-date order or leave the list', () => {
    const week = [task('a', '2026-10-29', 1), task('b', '2026-10-30', 2)];
    expect(reorderTask(week, 'a', 1)).toBeNull();
    expect(reorderTask(day, 'a', 3)).toBeNull();
    expect(reorderTask(day, 'missing', 0)).toBeNull();
  });

  it('only uses neighbours from the same space', () => {
    const mixed = [task('a', null, 1), task('x', null, 2, 'space-b'), task('b', null, 3)];
    expect(reorderTask(mixed, 'b', 1)).toEqual({ previousId: 'a', nextId: null, position: 1025 });
  });
});

describe('quick add suggestions', () => {
  const now = new Date(2026, 9, 28, 10);

  it('suggests labels, priorities and dates for the word being typed', () => {
    expect(quickSuggestions('Call Sara #wo', ['work', 'home', 'two words'], now).map((suggestion) => suggestion.insert)).toEqual(['#work']);
    expect(quickSuggestions('Call Sara #', ['work', 'two words'], now).map((suggestion) => suggestion.insert)).toEqual(['#work']);
    expect(quickSuggestions('Call Sara !', [], now).map((suggestion) => suggestion.insert)).toEqual(['!3', '!2', '!1']);
    expect(quickSuggestions('Call Sara tom', [], now).map((suggestion) => suggestion.insert)).toEqual(['tomorrow']);
    expect(quickSuggestions('Call Sara t', [], now)).toEqual([]);
    expect(quickSuggestions('Call Sara tomorrow ', [], now)).toEqual([]);
    expect(quickSuggestions('Call Sara #work', ['work'], now)).toEqual([]);
  });

  it('replaces the typed word with the suggestion so the parser understands it', () => {
    const [suggestion] = quickSuggestions('Call Sara tom', [], now);
    const text = withSuggestion('Call Sara tom', suggestion!);
    expect(text).toBe('Call Sara tomorrow ');
    expect(parseQuickTask(text, [], now)).toMatchObject({ title: 'Call Sara', dueDate: '2026-10-29' });
  });
});
