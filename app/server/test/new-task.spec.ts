import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { descriptionText, hasInput, newTaskDraft, plainDescription, withQuickTitle } from '../../frontend/src/task-draft';
import { shownTaskView, taskFilterState, taskLink, type TaskList } from '../../frontend/src/tasks';
import { ListViewDto } from '../src/tasks/dto/tasks.dto';
import { UpdateProfileDto } from '../src/users/dto/users.dto';

const epic = (view: TaskList['view']): TaskList => ({ id: 'epic', spaceId: 'space', title: 'Launch', view, openTasks: 0 });

describe('new task drafts', () => {
  it('start from the space’s new-task defaults and the epic being shown', () => {
    const defaults = { type: 'bug', priority: 2, assignee: 'none' as const, status: 'in_progress' as const, listId: 'default-epic', view: 'board' as const };
    expect(newTaskDraft({ defaults, userId: 'me' })).toMatchObject({ type: 'bug', priority: 2, assigneeId: null, status: 'in_progress', listId: 'default-epic' });
    expect(newTaskDraft({ defaults, listId: 'shown', status: 'done', userId: 'me' })).toMatchObject({ listId: 'shown', status: 'done' });
    expect(newTaskDraft({ userId: 'me' })).toMatchObject({ type: 'task', priority: 0, assigneeId: 'me', status: 'open', listId: null });
  });

  it('keeps a plain description when moving between the quick dialog and the full editor', () => {
    const description = plainDescription('First line\nSecond line');
    expect(descriptionText(description)).toBe('First line\nSecond line');
    expect(plainDescription('   ')).toBeNull();
    expect(descriptionText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold ' }, { type: 'text', text: 'and plain' }] }] })).toBe('Bold and plain');
  });

  it('notices typed input so closing asks first', () => {
    expect(hasInput(newTaskDraft({}))).toBe(false);
    expect(hasInput({ ...newTaskDraft({}), title: 'Call Sam' })).toBe(true);
    expect(hasInput({ ...newTaskDraft({}), description: plainDescription('Notes') })).toBe(true);
  });

  it('reads dates, priority and known tags out of a quick title', () => {
    const home = { id: 'home', name: 'home', color: 'blue' as const, spaceId: null };
    const parsed = withQuickTitle({ ...newTaskDraft({}), title: 'Call Sam #home !3' }, [home as never]);
    expect(parsed.title).toBe('Call Sam');
    expect(parsed.priority).toBe(3);
    expect(parsed.labels).toEqual([home]);
  });
});

describe('task views', () => {
  it('shows each epic the way it was saved, and lets a link override it for now', () => {
    const state = taskFilterState(new URLSearchParams('list=epic'));
    expect(shownTaskView(state, epic('list'))).toBe('list');
    expect(shownTaskView(state, epic(null), 'list')).toBe('list');
    expect(shownTaskView(state, undefined)).toBe('board');
    expect(shownTaskView(taskFilterState(new URLSearchParams('list=epic&view=board')), epic('list'))).toBe('board');
  });

  it('keeps the view out of links unless it was asked for', () => {
    const link = taskLink('/tasks', taskFilterState(new URLSearchParams('list=epic')));
    expect(link({ page: 1 })).toBe('/tasks?list=epic');
    expect(link({ view: 'list', completed: true })).toBe('/tasks?list=epic&view=list&completed=true');
    expect(taskLink('/tasks', taskFilterState(new URLSearchParams('view=list')))({ view: null })).toBe('/tasks');
  });

  it('accepts only list or board for an epic and known modes for new tasks', async () => {
    expect(await validate(plainToInstance(ListViewDto, { view: 'board' }))).toEqual([]);
    expect((await validate(plainToInstance(ListViewDto, { view: 'calendar' }))).map((error) => error.property)).toEqual(['view']);
    expect(await validate(plainToInstance(UpdateProfileDto, { taskComposer: 'panel' }))).toEqual([]);
    expect((await validate(plainToInstance(UpdateProfileDto, { taskComposer: 'popup' }))).map((error) => error.property)).toEqual(['taskComposer']);
  });
});
