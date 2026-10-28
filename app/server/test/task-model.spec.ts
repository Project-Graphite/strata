import 'reflect-metadata';
import { TaskStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MoveTaskDto, UpdateTaskDto } from '../src/tasks/dto/tasks.dto';
import { positionBetween, positionGap } from '../src/tasks/task-position';
import { statusFields, statusOf } from '../src/tasks/task-status';
import { UpdateProfileDto } from '../src/users/dto/users.dto';
import { isRichText, maxRichTextBytes } from '../src/validation/rich-text.decorator';

const messages = async (type: new () => object, value: object) =>
  [...new Set((await validate(plainToInstance(type, value))).flatMap((error) => Object.values(error.constraints ?? {})))].sort();

describe('Task status', () => {
  const now = new Date('2026-10-30T09:00:00Z');
  const earlier = new Date('2026-10-01T09:00:00Z');

  it('stamps the finishing time when a task becomes done and keeps an existing one', () => {
    expect(statusFields(TaskStatus.DONE, null, now)).toEqual({ status: TaskStatus.DONE, completedAt: now });
    expect(statusFields(TaskStatus.DONE, earlier, now)).toEqual({ status: TaskStatus.DONE, completedAt: earlier });
  });

  it('clears the finishing time whenever a task is open or in progress', () => {
    expect(statusFields(TaskStatus.OPEN, earlier, now)).toEqual({ status: TaskStatus.OPEN, completedAt: null });
    expect(statusFields(TaskStatus.IN_PROGRESS, earlier, now)).toEqual({ status: TaskStatus.IN_PROGRESS, completedAt: null });
  });

  it('reads the API names of the statuses', () => {
    expect(['open', 'in_progress', 'done'].map((name) => statusOf(name as 'open'))).toEqual([TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.DONE]);
  });
});

describe('Task positions', () => {
  it('places a task halfway between its neighbours, or a gap beyond the only one', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(1024, null)).toBe(1024 + positionGap);
    expect(positionBetween(null, 1024)).toBe(1024 - positionGap);
  });

  it('asks for renumbering when the neighbours leave no room or are out of order', () => {
    expect(positionBetween(0, 0)).toBeNull();
    expect(positionBetween(2048, 1024)).toBeNull();
    expect(positionBetween(1, 1 + Number.EPSILON)).toBeNull();
    expect(positionBetween(null, null)).toBeNull();
  });
});

describe('Task validation', () => {
  it('accepts editor documents as descriptions and refuses anything else', () => {
    expect(isRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bring the receipts' }] }] })).toBe(true);
    expect(isRichText({ type: 'doc' })).toBe(true);
    for (const value of [null, 'text', [], { type: 'paragraph' }, { type: 'doc', content: 'text' }]) expect(isRichText(value)).toBe(false);
    expect(isRichText({ type: 'doc', content: [{ type: 'text', text: 'x'.repeat(maxRichTextBytes) }] })).toBe(false);
  });

  it('explains bad statuses and descriptions, and allows clearing the description', async () => {
    await expect(messages(UpdateTaskDto, { status: 'started', description: { type: 'paragraph' } })).resolves.toEqual([
      'Choose open, in progress or done.',
      'Descriptions are editor documents of at most 200 KB.',
    ]);
    await expect(messages(UpdateTaskDto, { status: null })).resolves.toEqual(['Choose open, in progress or done.']);
    await expect(messages(UpdateTaskDto, { status: 'in_progress', description: null })).resolves.toEqual([]);
  });

  it('needs at least one neighbour to move a task', async () => {
    await expect(messages(MoveTaskDto, {})).resolves.toEqual(['Choose the task to place this one after.']);
    await expect(messages(MoveTaskDto, { previousId: null, nextId: null })).resolves.toEqual(['Choose the task to place this one after.']);
    await expect(messages(MoveTaskDto, { nextId: '1f0f4c38-7f0b-4b1e-9d3c-2b8e8a0c1d2e' })).resolves.toEqual([]);
    await expect(messages(MoveTaskDto, { previousId: 'nope', nextId: '1f0f4c38-7f0b-4b1e-9d3c-2b8e8a0c1d2e' })).resolves.toEqual(['Choose the task to place this one after.']);
  });
});

describe('Week settings validation', () => {
  it('takes a start day and weekend days from Sunday (0) to Saturday (6)', async () => {
    await expect(messages(UpdateProfileDto, { weekStart: 1, weekendDays: [6, 0] })).resolves.toEqual([]);
    await expect(messages(UpdateProfileDto, { weekendDays: [] })).resolves.toEqual([]);
  });

  it('refuses days outside the week, repeated days and a week without working days', async () => {
    await expect(messages(UpdateProfileDto, { weekStart: 7 })).resolves.toEqual(['Choose the day your week starts on.']);
    await expect(messages(UpdateProfileDto, { weekStart: 1.5 })).resolves.toEqual(['Choose the day your week starts on.']);
    await expect(messages(UpdateProfileDto, { weekStart: null })).resolves.toEqual(['Choose the day your week starts on.']);
    await expect(messages(UpdateProfileDto, { weekendDays: [5, 5] })).resolves.toEqual(['Choose each weekend day once.']);
    await expect(messages(UpdateProfileDto, { weekendDays: [0, 1, 2, 3, 4, 5, 6] })).resolves.toEqual(['Leave at least one working day in the week.']);
    await expect(messages(UpdateProfileDto, { weekendDays: [-1] })).resolves.toEqual(['Choose weekend days from the list.']);
  });
});
