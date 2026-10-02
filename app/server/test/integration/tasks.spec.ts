import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { JobsService } from '../../src/jobs/jobs.service';
import { integrationApp } from './harness';

const dayMs = 24 * 60 * 60 * 1000;
const utcDate = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);

describe('Tasks against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps tasks inside their space and checks lists, sub-tasks and assignees', async () => {
    const owner = await member('planner');
    const helper = await member('doer');
    const viewer = await member('watcher');
    const outsider = await member('stranger');
    const space = (await owner.call('POST', '/spaces', { name: 'House' })).body;
    await strata.join(space.id, helper, SpaceRole.EDITOR);
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const list = (await owner.call('POST', `/spaces/${space.id}/lists`, { title: 'Chores' })).body;
    const otherList = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/lists`, { title: 'Mine' })).body;

    const parent = await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Clean the kitchen', listId: list.id, priority: 2 });
    expect(parent.status).toBe(201);
    expect(parent.body).toMatchObject({ title: 'Clean the kitchen', listId: list.id, priority: 2, timeZone: 'Etc/UTC', completedAt: null });
    const child = (await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Oven', parentId: parent.body.id })).body;

    expect((await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Too deep', parentId: child.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${parent.body.id}`, { parentId: child.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Wrong list', listId: otherList.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Nobody', assigneeId: outsider.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Bad rule', dueDate: utcDate(1), repeatRule: 'FREQ=HOURLY' })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'No date', repeatRule: 'FREQ=DAILY' })).status).toBe(400);
    expect((await viewer.call('POST', `/spaces/${space.id}/tasks`, { title: 'Mine' })).status).toBe(403);
    expect((await outsider.call('GET', `/spaces/${space.id}/tasks`)).status).toBe(404);
    expect((await outsider.call('GET', `/tasks/${parent.body.id}`)).status).toBe(404);

    expect((await owner.call('PATCH', `/tasks/${parent.body.id}`, { assigneeId: helper.id })).body.assignee).toMatchObject({ id: helper.id });
    expect((await helper.call('GET', '/me/inbox')).body.results[0]).toMatchObject({
      kind: 'task_assigned',
      title: 'You were given “Clean the kitchen”',
    });
    expect((await viewer.call('GET', `/spaces/${space.id}/tasks?listId=${list.id}`)).body.results.map((task: { id: string }) => task.id)).toEqual([
      parent.body.id,
    ]);
    expect((await viewer.call('GET', `/spaces/${space.id}/lists`)).body).toEqual([
      expect.objectContaining({ id: list.id, title: 'Chores', openTasks: 1 }),
    ]);
  });

  it('moves a repeating task to its next date and finishes it when the rule runs out', async () => {
    const owner = await member('repeater');
    const task = (
      await owner.call('POST', `/spaces/${owner.personalSpaceId}/tasks`, {
        title: 'Bins out',
        dueDate: '2026-10-05',
        dueTime: '19:00',
        timeZone: 'Europe/London',
        repeatRule: 'freq=weekly;count=2',
      })
    ).body;
    expect(task.repeatRule).toBe('FREQ=WEEKLY;COUNT=2');

    const moved = (await owner.call('POST', `/tasks/${task.id}/complete`)).body;
    expect(moved).toMatchObject({ dueDate: '2026-10-12', repeatRule: 'FREQ=WEEKLY;COUNT=1', completedAt: null });
    const done = (await owner.call('POST', `/tasks/${task.id}/complete`)).body;
    expect(done.completedAt).not.toBeNull();
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/tasks?completed=true`)).body.totalResults).toBe(1);
    const reopened = (await owner.call('POST', `/tasks/${task.id}/reopen`)).body;
    expect(reopened.completedAt).toBeNull();

    const verbs = (await owner.call('GET', `/spaces/${owner.personalSpaceId}/activity`)).body.results.map(
      (event: { verb: string }) => event.verb,
    );
    expect(verbs).toEqual(['task.reopened', 'task.completed', 'task.completed', 'item.created']);
  });

  it("shows today's and overdue tasks that are mine or nobody's, across spaces", async () => {
    const owner = await member('busy');
    const other = await member('elsewhere');
    const shared = (await owner.call('POST', '/spaces', { name: 'Work' })).body;
    await strata.join(shared.id, other, SpaceRole.EDITOR);
    const make = (spaceId: string, title: string, extra: object) =>
      owner.call('POST', `/spaces/${spaceId}/tasks`, { title, ...extra }).then((reply) => reply.body);

    const overdue = await make(owner.personalSpaceId, 'Overdue', { dueDate: utcDate(-2) });
    const due = await make(shared.id, 'Today', { dueDate: utcDate(0), dueTime: '08:00' });
    await make(shared.id, 'Tomorrow', { dueDate: utcDate(1) });
    await make(shared.id, 'Theirs', { dueDate: utcDate(0), assigneeId: other.id });
    const finished = await make(owner.personalSpaceId, 'Done', { dueDate: utcDate(0) });
    await owner.call('POST', `/tasks/${finished.id}/complete`);

    expect((await owner.call('GET', '/tasks/today')).body.map((task: { id: string }) => task.id)).toEqual([overdue.id, due.id]);
    expect((await other.call('GET', '/tasks/today')).body.map((task: { title: string }) => task.title)).toEqual(['Theirs', 'Today']);
  });

  it('reminds the right person once, and replaces the reminder when the task changes', async () => {
    const owner = await member('forgetful');
    const jobs = strata.service(JobsService);
    const reminders = () =>
      strata.prisma.scheduledJob.findMany({ where: { kind: 'task.reminder', doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: task.id } } });
    const task = (
      await owner.call('POST', `/spaces/${owner.personalSpaceId}/tasks`, {
        title: 'Call the bank',
        dueDate: utcDate(2),
        dueTime: '10:00',
        reminderMinutes: 60,
      })
    ).body;
    const [first] = await reminders();
    expect(first!.runAt.toISOString()).toBe(`${utcDate(2)}T09:00:00.000Z`);

    await owner.call('PATCH', `/tasks/${task.id}`, { reminderMinutes: 30 });
    const [second, extra] = await reminders();
    expect(extra).toBeUndefined();
    expect(second!.runAt.toISOString()).toBe(`${utcDate(2)}T09:30:00.000Z`);

    await jobs.runDue(new Date(second!.runAt.getTime() + 1_000));
    expect((await owner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({
      kind: 'task_due',
      title: '“Call the bank” is due at 10:00',
    });

    await owner.call('PATCH', `/tasks/${task.id}`, { reminderMinutes: 15 });
    await owner.call('POST', `/tasks/${task.id}/complete`);
    expect(await reminders()).toEqual([]);
  });
});
