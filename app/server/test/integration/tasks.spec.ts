import { SpaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ChangesService } from '../../src/changes/changes.service';
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
    const otherList = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/lists`, { title: 'Mine' })).body;

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
      await owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, {
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
    expect((await owner.call('GET', `/spaces/${owner.soloSpaceId}/tasks?completed=true`)).body.totalResults).toBe(1);
    const reopened = (await owner.call('POST', `/tasks/${task.id}/reopen`)).body;
    expect(reopened.completedAt).toBeNull();

    const verbs = (await owner.call('GET', `/spaces/${owner.soloSpaceId}/activity`)).body.results.map(
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

    const overdue = await make(owner.soloSpaceId, 'Overdue', { dueDate: utcDate(-2) });
    const due = await make(shared.id, 'Today', { dueDate: utcDate(0), dueTime: '08:00', assigneeId: null });
    await make(shared.id, 'Tomorrow', { dueDate: utcDate(1) });
    await make(shared.id, 'Theirs', { dueDate: utcDate(0), assigneeId: other.id });
    const finished = await make(owner.soloSpaceId, 'Done', { dueDate: utcDate(0) });
    await owner.call('POST', `/tasks/${finished.id}/complete`);

    expect((await owner.call('GET', '/tasks/today')).body.map((task: { id: string }) => task.id)).toEqual([overdue.id, due.id]);
    expect((await other.call('GET', '/tasks/today')).body.map((task: { title: string }) => task.title)).toEqual(['Theirs', 'Today']);
  });

  it('gathers one to-do list across spaces, with every list and its whole shared contents', async () => {
    const owner = await member('organiser');
    const partner = await member('partner');
    const outsider = await member('nosy');
    const home = (await owner.call('POST', '/spaces', { name: 'Home' })).body;
    await strata.join(home.id, partner, SpaceRole.EDITOR);
    const groceries = (await owner.call('POST', `/spaces/${home.id}/lists`, { title: 'Groceries' })).body;
    const errands = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/lists`, { title: 'Errands' })).body;
    const make = (spaceId: string, title: string, extra: object = {}) =>
      owner.call('POST', `/spaces/${spaceId}/tasks`, { title, ...extra }).then((reply) => reply.body);
    await make(owner.soloSpaceId, 'Call the bank', { dueDate: utcDate(1) });
    await make(owner.soloSpaceId, 'Post the parcel', { listId: errands.id });
    await make(home.id, 'Milk', { listId: groceries.id, assigneeId: null });
    await make(home.id, 'Fix the shelf', { assigneeId: partner.id });
    const done = await make(home.id, 'Bread', { listId: groceries.id });
    await owner.call('POST', `/tasks/${done.id}/complete`);
    await make(outsider.soloSpaceId, 'Not yours');

    const titles = (reply: { body: { results: { title: string }[] } }) => reply.body.results.map((task) => task.title);
    expect(titles(await owner.call('GET', '/me/tasks'))).toEqual(['Call the bank', 'Post the parcel', 'Milk']);
    expect(titles(await partner.call('GET', '/me/tasks'))).toEqual(['Milk', 'Fix the shelf']);
    expect(titles(await partner.call('GET', `/me/tasks?listId=${groceries.id}`))).toEqual(['Milk']);
    expect(titles(await owner.call('GET', `/me/tasks?listId=${groceries.id}&completed=true`))).toEqual(['Bread']);
    expect(titles(await outsider.call('GET', `/me/tasks?listId=${groceries.id}`))).toEqual([]);
    expect((await owner.call('GET', '/me/lists')).body).toEqual([
      expect.objectContaining({ id: groceries.id, spaceId: home.id, title: 'Groceries', openTasks: 1 }),
      expect.objectContaining({ id: errands.id, spaceId: owner.soloSpaceId, title: 'Errands', openTasks: 1 }),
    ]);
    expect((await partner.call('GET', '/me/lists')).body.map((list: { title: string }) => list.title)).toEqual(['Groceries']);
  });

  it('keeps task types, folds custom type spellings together and filters by assignee and type', async () => {
    const owner = await member('triager');
    const partner = await member('builder');
    const team = (await owner.call('POST', '/spaces', { name: 'Team' })).body;
    await strata.join(team.id, partner, SpaceRole.EDITOR);
    const make = (title: string, extra: object = {}) => owner.call('POST', `/spaces/${team.id}/tasks`, { title, ...extra }).then((reply) => reply.body);
    expect(await make('Plain')).toMatchObject({ type: 'task' });
    expect(await make('Dark mode', { type: 'IDEA', assigneeId: null })).toMatchObject({ type: 'idea' });
    expect(await make('Crash on save', { type: 'Bug', assigneeId: partner.id })).toMatchObject({ type: 'Bug' });
    expect(await make('Login loop', { type: ' bug ' })).toMatchObject({ type: 'Bug' });
    expect((await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Long', type: 'x'.repeat(31) })).status).toBe(400);

    const titles = (reply: { body: { results: { title: string }[] } }) => reply.body.results.map((task) => task.title).sort();
    expect(titles(await owner.call('GET', `/spaces/${team.id}/tasks?type=bug`))).toEqual(['Crash on save', 'Login loop']);
    expect(titles(await owner.call('GET', `/spaces/${team.id}/tasks?type=idea`))).toEqual(['Dark mode']);
    expect(titles(await owner.call('GET', `/spaces/${team.id}/tasks?assignee=none`))).toEqual(['Dark mode']);
    expect(titles(await owner.call('GET', `/spaces/${team.id}/tasks?assignee=${partner.id}&type=Bug`))).toEqual(['Crash on save']);
    expect(titles(await owner.call('GET', '/me/tasks?assignee=me'))).toEqual(['Login loop', 'Plain']);
    expect(titles(await owner.call('GET', '/me/tasks?assignee=any'))).toEqual(['Crash on save', 'Dark mode', 'Login loop', 'Plain']);
    expect((await owner.call('GET', '/me/tasks?assignee=someone')).status).toBe(400);
    expect((await owner.call('GET', `/me/task-filters?spaceId=${team.id}`)).body).toEqual({
      types: ['Bug'],
      assignees: expect.arrayContaining([{ id: owner.id, displayName: expect.any(String) }, { id: partner.id, displayName: expect.any(String) }]),
    });
  });

  it('relates tasks to tasks only, once per pair, and lets either task drop the relation', async () => {
    const owner = await member('linker');
    const make = (title: string) => owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, { title }).then((reply) => reply.body);
    const api = await make('API change');
    const app = await make('App update');
    const list = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/lists`, { title: 'Not a task' })).body;

    const blocks = await owner.call('POST', `/items/${api.id}/links`, { targetId: app.id, kind: 'blocks' });
    expect(blocks.status).toBe(201);
    expect(blocks.body).toMatchObject({ kind: 'blocks', item: { id: app.id, kind: 'task' } });
    expect((await owner.call('POST', `/items/${app.id}/links`, { targetId: api.id, kind: 'relates' })).status).toBe(409);
    expect((await owner.call('POST', `/items/${api.id}/links`, { targetId: list.id, kind: 'relates' })).status).toBe(400);
    expect((await owner.call('GET', `/items/${app.id}/links`)).body.backlinks).toEqual([expect.objectContaining({ kind: 'blocks', item: expect.objectContaining({ id: api.id }) })]);

    expect((await owner.call('DELETE', `/items/${app.id}/links/${blocks.body.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/items/${api.id}/links`)).body.outgoing).toEqual([]);
  });

  it('adds board columns to a space, keeps their tasks in progress and drops them back when a column goes', async () => {
    const owner = await member('qa-lead');
    const viewer = await member('qa-watcher');
    const outsider = await member('qa-stranger');
    const team = (await owner.call('POST', '/spaces', { name: 'Release' })).body;
    await strata.join(team.id, viewer, SpaceRole.VIEWER);
    const qa = await owner.call('POST', `/spaces/${team.id}/task-columns`, { name: 'QA' });
    expect(qa.status).toBe(201);
    expect((await owner.call('POST', `/spaces/${team.id}/task-columns`, { name: 'QA' })).status).toBe(409);
    expect((await viewer.call('POST', `/spaces/${team.id}/task-columns`, { name: 'Review' })).status).toBe(403);
    const elsewhere = (await outsider.call('POST', `/spaces/${outsider.soloSpaceId}/task-columns`, { name: 'Theirs' })).body;

    const task = (await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Check the build', columnId: qa.body.id })).body;
    expect(task).toMatchObject({ status: 'in_progress', columnId: qa.body.id });
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { columnId: elsewhere.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { status: 'open' })).body).toMatchObject({ status: 'open', columnId: null });
    await owner.call('PATCH', `/tasks/${task.id}`, { columnId: qa.body.id });
    expect((await owner.call('POST', `/tasks/${task.id}/complete`)).body).toMatchObject({ columnId: null });
    expect((await owner.call('POST', `/tasks/${task.id}/reopen`)).body).toMatchObject({ status: 'in_progress', columnId: qa.body.id });
    await owner.call('PATCH', `/tasks/${task.id}`, { status: 'done' });
    expect((await owner.call('POST', `/tasks/${task.id}/reopen`)).body).toMatchObject({ status: 'in_progress', columnId: qa.body.id });

    expect((await owner.call('PATCH', `/task-columns/${qa.body.id}`, { name: 'Testing' })).body).toMatchObject({ name: 'Testing' });
    expect((await viewer.call('GET', `/spaces/${team.id}/task-columns`)).body).toEqual([expect.objectContaining({ id: qa.body.id, name: 'Testing' })]);
    expect((await owner.call('GET', '/me/task-columns')).body.map((column: { name: string }) => column.name)).toEqual(['Testing']);
    expect((await owner.call('DELETE', `/task-columns/${qa.body.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/tasks/${task.id}`)).body).toMatchObject({ status: 'in_progress', columnId: null });
  });

  it('keeps a formatted copy of a comment beside its plain text', async () => {
    const owner = await member('formatter');
    const task = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, { title: 'Write notes' })).body;
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Looks good', marks: [{ type: 'bold' }] }] }] };
    const added = await owner.call('POST', `/tasks/${task.id}/comments`, { body: 'Looks good', document });
    expect(added.body).toMatchObject({ body: 'Looks good', document });
    expect((await owner.call('POST', `/tasks/${task.id}/comments`, { body: 'Bad', document: { type: 'script' } })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${task.id}/comments/${added.body.id}`, { body: 'Plain now' })).body).toMatchObject({ body: 'Plain now', document: null });
  });

  it('makes people who touch a task watchers and tells the others about each change', async () => {
    const owner = await member('watch-owner');
    const partner = await member('watch-partner');
    const outsider = await member('watch-outsider');
    const team = (await owner.call('POST', '/spaces', { name: 'Watched' })).body;
    await strata.join(team.id, partner, SpaceRole.EDITOR);
    const task = (await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Ship it', assigneeId: partner.id })).body;
    const watching = async (person: typeof owner) => (await person.call('GET', '/me/inbox')).body.results.filter((notice: { kind: string }) => notice.kind === 'watching').map((notice: { title: string }) => notice.title);

    expect((await owner.call('GET', `/items/${task.id}/watchers`)).body).toEqual({
      watching: true,
      watchers: expect.arrayContaining([expect.objectContaining({ id: owner.id }), expect.objectContaining({ id: partner.id })]),
    });
    await partner.call('POST', `/tasks/${task.id}/comments`, { body: 'On it' });
    await partner.call('PATCH', `/tasks/${task.id}`, { status: 'in_progress' });
    await owner.call('PATCH', `/tasks/${task.id}`, { priority: 2 });
    expect(await watching(owner)).toEqual(expect.arrayContaining([expect.stringContaining('commented on “Ship it”'), expect.stringContaining('moved “Ship it” to In progress')]));
    expect(await watching(partner)).toEqual([expect.stringContaining('changed the priority of “Ship it”')]);

    expect((await owner.call('DELETE', `/items/${task.id}/watch`)).body.watching).toBe(false);
    await partner.call('POST', `/tasks/${task.id}/complete`);
    expect(await watching(owner)).not.toEqual(expect.arrayContaining([expect.stringContaining('finished')]));
    expect((await outsider.call('PUT', `/items/${task.id}/watch`)).status).toBe(404);
  });

  it('lets editors add and remove other watchers who can see the task', async () => {
    const owner = await member('watch-lead');
    const editor = await member('watch-editor');
    const viewer = await member('watch-viewer');
    const outsider = await member('watch-stranger');
    const team = (await owner.call('POST', '/spaces', { name: 'Watchlist' })).body;
    await strata.join(team.id, editor, SpaceRole.EDITOR);
    await strata.join(team.id, viewer, SpaceRole.VIEWER);
    const task = (await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Review copy' })).body;
    const ids = (reply: { body: { watchers: { id: string }[] } }) => reply.body.watchers.map((watcher) => watcher.id).sort();

    expect(ids(await editor.call('PUT', `/items/${task.id}/watchers/${viewer.id}`))).toEqual([owner.id, viewer.id].sort());
    expect((await editor.call('PUT', `/items/${task.id}/watchers/${outsider.id}`)).status).toBe(400);
    expect((await viewer.call('PUT', `/items/${task.id}/watchers/${editor.id}`)).status).toBe(403);
    expect(ids(await editor.call('DELETE', `/items/${task.id}/watchers/${viewer.id}`))).toEqual([owner.id]);
  });

  it('shares a task with people in its space, who start watching it, and with anyone by a view-only link', async () => {
    const owner = await member('share-lead');
    const teammate = await member('share-mate');
    const outsider = await member('share-stranger');
    const team = (await owner.call('POST', '/spaces', { name: 'Sharing' })).body;
    await strata.join(team.id, teammate, SpaceRole.VIEWER);
    const task = (await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Plan launch', priority: 3 })).body;

    expect((await owner.call('POST', `/tasks/${task.id}/share`, { userIds: [outsider.id] })).status).toBe(400);
    expect((await outsider.call('POST', `/tasks/${task.id}/share`, { userIds: [teammate.id] })).status).toBe(404);
    expect((await owner.call('POST', `/tasks/${task.id}/share`, { userIds: [teammate.id], message: 'Have a look' })).status).toBe(204);
    expect((await teammate.call('GET', '/me/inbox')).body.results).toEqual([
      expect.objectContaining({ kind: 'watching', title: 'share-lead shared “Plan launch” with you', body: 'Have a look', link: `/tasks?task=${task.id}` }),
    ]);
    expect((await teammate.call('GET', `/items/${task.id}/watchers`)).body.watching).toBe(true);

    expect((await teammate.call('POST', `/items/${task.id}/share-links`, { access: 'view' })).status).toBe(403);
    expect((await owner.call('POST', `/items/${task.id}/share-links`, { access: 'edit' })).status).toBe(400);
    const code = (await owner.call('POST', `/items/${task.id}/share-links`, { access: 'view' })).body.link.split('/share/')[1];
    expect((await strata.anonymous('GET', `/share/${code}`)).body).toMatchObject({
      access: 'view',
      item: { kind: 'task', title: 'Plan launch' },
      content: { kind: 'task', id: task.id, status: 'open', type: 'task', priority: 3, assignee: 'share-lead', attachments: [] },
    });
  });

  it('tells people mentioned by handle in a comment, once, and only if they are in the space', async () => {
    const owner = await member('mention-lead');
    const teammate = await member('mention-mate');
    const outsider = await member('mention-stranger');
    const team = (await owner.call('POST', '/spaces', { name: 'Mentions' })).body;
    await strata.join(team.id, teammate, SpaceRole.EDITOR);
    const task = (await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Fix login', assigneeId: null })).body;
    const notices = async (person: typeof owner) => (await person.call('GET', '/me/inbox')).body.results.map((notice: { kind: string; title: string }) => `${notice.kind}: ${notice.title}`);

    const comment = (await owner.call('POST', `/tasks/${task.id}/comments`, { body: `Can you check, @${teammate.handle}? cc @${outsider.handle}` })).body;
    expect(await notices(teammate)).toEqual(['comment: mention-lead mentioned you on “Fix login”']);
    expect(await notices(outsider)).toEqual([]);
    expect((await teammate.call('GET', `/items/${task.id}/watchers`)).body.watching).toBe(true);

    await owner.call('PATCH', `/tasks/${task.id}/comments/${comment.id}`, { body: `Still waiting, @${teammate.handle}` });
    expect(await notices(teammate)).toHaveLength(1);
  });

  it('threads one level of replies and toggles a fixed set of reactions on task comments', async () => {
    const owner = await member('react-lead');
    const viewer = await member('react-viewer');
    const team = (await owner.call('POST', '/spaces', { name: 'Reactions' })).body;
    await strata.join(team.id, viewer, SpaceRole.VIEWER);
    const task = (await owner.call('POST', `/spaces/${team.id}/tasks`, { title: 'Ship the beta' })).body;
    const comments = `/tasks/${task.id}/comments`;
    const comment = (await owner.call('POST', comments, { body: 'Ready?' })).body;
    const reply = (await owner.call('POST', comments, { body: 'Yes', parentId: comment.id })).body;
    expect(reply).toMatchObject({ parentId: comment.id, reactions: [] });
    expect((await owner.call('POST', comments, { body: 'Deeper', parentId: reply.id })).status).toBe(400);

    const thumbs = `${comments}/${comment.id}/reactions/${encodeURIComponent('👍')}`;
    expect((await viewer.call('PUT', thumbs)).body.reactions).toEqual([{ emoji: '👍', count: 1, mine: true }]);
    await owner.call('PUT', thumbs);
    expect((await owner.call('GET', comments)).body[0].reactions).toEqual([{ emoji: '👍', count: 2, mine: true }]);
    expect((await owner.call('PUT', `${comments}/${comment.id}/reactions/${encodeURIComponent('🐍')}`)).status).toBe(400);
    expect((await owner.call('DELETE', thumbs)).body.reactions).toEqual([{ emoji: '👍', count: 1, mine: false }]);

    expect((await owner.call('DELETE', `${comments}/${comment.id}`)).status).toBe(204);
    expect((await owner.call('GET', comments)).body).toEqual([]);
  });

  it('reminds the right person a day and an hour before a task is due, and moves the reminders with the task', async () => {
    const owner = await member('forgetful');
    const jobs = strata.service(JobsService);
    const reminders = async () =>
      (
        await strata.prisma.scheduledJob.findMany({
          where: { kind: 'task.reminder', doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: task.id } },
          orderBy: { runAt: 'asc' },
        })
      ).map((job) => job.runAt.toISOString());
    const task = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, { title: 'Call the bank', dueDate: utcDate(2), dueTime: '10:00' })).body;
    expect(await reminders()).toEqual([`${utcDate(1)}T10:00:00.000Z`, `${utcDate(2)}T09:00:00.000Z`]);

    await owner.call('PATCH', `/tasks/${task.id}`, { dueTime: '11:00' });
    expect(await reminders()).toEqual([`${utcDate(1)}T11:00:00.000Z`, `${utcDate(2)}T10:00:00.000Z`]);

    await jobs.runDue(new Date(`${utcDate(1)}T11:00:01.000Z`));
    expect((await owner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({ kind: 'task_due', title: '“Call the bank” is due tomorrow at 11:00' });

    await owner.call('POST', `/tasks/${task.id}/complete`);
    expect(await reminders()).toEqual([]);
  });

  it('stops reminding someone who has left the space', async () => {
    const owner = await member('hall-booker');
    const helper = await member('stall-helper');
    const space = (await owner.call('POST', '/spaces', { name: 'Fair' })).body;
    await strata.join(space.id, helper, SpaceRole.EDITOR);
    const task = (
      await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Book the hall', dueDate: utcDate(2), dueTime: '10:00' })
    ).body;
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { assigneeId: helper.id })).status).toBe(200);
    expect((await owner.call('DELETE', `/spaces/${space.id}/members/${helper.id}`)).status).toBe(204);

    const [reminder] = await strata.prisma.scheduledJob.findMany({
      where: { kind: 'task.reminder', doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: task.id } },
    });
    await strata.service(JobsService).runDue(new Date(reminder!.runAt.getTime() + 1_000));
    expect((await helper.call('GET', '/me/inbox')).body.results.map((notice: { kind: string }) => notice.kind)).not.toContain('task_due');
  });

  it('gives a new task to its creator, keeps status and finishing time together and records each step', async () => {
    const owner = await member('ticket-owner');
    const create = (body: object) => owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, body).then((reply) => reply.body);
    const task = await create({ title: 'File taxes' });
    expect(task).toMatchObject({ status: 'open', completedAt: null, assignee: { id: owner.id }, labels: [], subtaskCounts: { total: 0, done: 0 }, description: null, subtasks: [] });
    expect((await create({ title: 'Anyone', assigneeId: null })).assignee).toBeNull();

    expect((await owner.call('PATCH', `/tasks/${task.id}`, { status: 'in_progress' })).body).toMatchObject({ status: 'in_progress', completedAt: null });
    const done = (await owner.call('PATCH', `/tasks/${task.id}`, { status: 'done' })).body;
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    expect((await owner.call('GET', `/spaces/${owner.soloSpaceId}/tasks?completed=true`)).body.results.map((row: { id: string }) => row.id)).toEqual([task.id]);
    expect((await owner.call('POST', `/tasks/${task.id}/reopen`)).body).toMatchObject({ status: 'in_progress', completedAt: null });
    expect((await owner.call('POST', `/tasks/${task.id}/complete`)).body.status).toBe('done');
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { status: 'in_progress' })).body).toMatchObject({ status: 'in_progress', completedAt: null });
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { status: 'finished' })).status).toBe(400);

    const repeating = await create({ title: 'Water the plants', dueDate: '2026-10-05', repeatRule: 'FREQ=WEEKLY', status: 'in_progress' });
    expect((await owner.call('PATCH', `/tasks/${repeating.id}`, { status: 'done' })).body).toMatchObject({ status: 'open', completedAt: null, dueDate: '2026-10-12' });

    const description = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bring the receipts' }] }] };
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { description })).body.description).toEqual(description);
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { description: { type: 'paragraph' } })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${task.id}`, { description: null })).body.description).toBeNull();

    const tag = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/tags`, { name: 'Paperwork' })).body;
    await owner.call('PUT', `/items/${task.id}/tags`, { tagIds: [tag.id] });
    expect((await owner.call('GET', `/tasks/${task.id}`)).body.labels).toEqual([expect.objectContaining({ id: tag.id, name: 'Paperwork' })]);

    const verbs = (await owner.call('GET', `/tasks/${task.id}/activity`)).body.results.map((event: { verb: string }) => event.verb);
    expect(verbs).toEqual(['task.reopened', 'task.completed', 'task.reopened', 'task.completed', 'item.updated', 'item.created']);
    expect((await (await member('activity-outsider')).call('GET', `/tasks/${task.id}/activity`)).status).toBe(404);
  });

  it('keeps sub-tasks one level deep and returns them with their counts', async () => {
    const owner = await member('breakdown');
    const create = (body: object) => owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, body);
    const parent = (await create({ title: 'Move house' })).body;
    const boxes = (await create({ title: 'Pack boxes', parentId: parent.id })).body;
    const van = (await create({ title: 'Book a van', parentId: parent.id })).body;
    await owner.call('POST', `/tasks/${van.id}/complete`);
    const dropped = (await create({ title: 'Old idea', parentId: parent.id })).body;
    await owner.call('POST', `/items/${dropped.id}/trash`);

    const detail = (await owner.call('GET', `/tasks/${parent.id}`)).body;
    expect(detail.subtaskCounts).toEqual({ total: 2, done: 1 });
    expect(detail.subtasks.map((task: { title: string }) => task.title)).toEqual(['Pack boxes', 'Book a van']);
    expect((await owner.call('GET', `/spaces/${owner.soloSpaceId}/tasks`)).body.results.find((task: { id: string }) => task.id === parent.id).subtaskCounts).toEqual({ total: 2, done: 1 });

    const loose = (await create({ title: 'Clean the flat' })).body;
    expect((await create({ title: 'Tape', parentId: boxes.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${loose.id}`, { parentId: boxes.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${parent.id}`, { parentId: loose.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/tasks/${loose.id}`, { parentId: parent.id })).body.parentId).toBe(parent.id);
  });

  it('moves a task between two others and renumbers the space when there is no room left', async () => {
    const owner = await member('arranger');
    const viewer = await member('arrangement-viewer');
    const space = (await owner.call('POST', '/spaces', { name: 'Desk' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const make = (title: string) => owner.call('POST', `/spaces/${space.id}/tasks`, { title }).then((reply) => reply.body);
    const first = await make('First');
    const second = await make('Second');
    const third = await make('Third');
    const order = async () => (await owner.call('GET', `/spaces/${space.id}/tasks`)).body.results.map((task: { title: string }) => task.title);
    const move = (task: { id: string }, body: object, as = owner) => as.call('POST', `/tasks/${task.id}/move`, body);
    expect(await order()).toEqual(['First', 'Second', 'Third']);

    expect((await move(third, { previousId: first.id, nextId: second.id })).status).toBe(200);
    expect(await order()).toEqual(['First', 'Third', 'Second']);
    await move(first, { previousId: second.id });
    expect(await order()).toEqual(['Third', 'Second', 'First']);
    await move(second, { nextId: third.id });
    expect(await order()).toEqual(['Second', 'Third', 'First']);

    for (const task of [first, second, third]) await owner.call('PATCH', `/tasks/${task.id}`, { position: 1 });
    expect(await order()).toEqual(['First', 'Second', 'Third']);
    expect((await move(third, { previousId: first.id, nextId: second.id })).status).toBe(200);
    expect(await order()).toEqual(['First', 'Third', 'Second']);

    const elsewhere = (await owner.call('POST', `/spaces/${owner.soloSpaceId}/tasks`, { title: 'Elsewhere' })).body;
    expect((await move(first, { previousId: elsewhere.id })).status).toBe(400);
    expect((await move(first, { previousId: first.id })).status).toBe(400);
    expect((await move(first, {})).status).toBe(400);
    expect((await move(first, { previousId: second.id }, viewer)).status).toBe(403);
  });

  it('takes comments from people who can change the task and tells the change feed', async () => {
    const owner = await member('chair-buyer');
    const helper = await member('chair-helper');
    const viewer = await member('chair-viewer');
    const outsider = await member('chair-outsider');
    const space = (await owner.call('POST', '/spaces', { name: 'Office' })).body;
    await strata.join(space.id, helper, SpaceRole.EDITOR);
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const task = (await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Order chairs' })).body;
    const other = (await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Order desks' })).body;
    const notify = vi.spyOn(strata.service(ChangesService), 'notify');

    const first = await helper.call('POST', `/tasks/${task.id}/comments`, { body: '  Which colour?  ' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: 'Which colour?', editedAt: null, author: { id: helper.id } });
    expect(notify).toHaveBeenCalledWith('task-details', { spaceId: space.id, itemId: task.id });
    expect((await viewer.call('POST', `/tasks/${task.id}/comments`, { body: 'Me too' })).status).toBe(403);
    expect((await owner.call('POST', `/tasks/${task.id}/comments`, { body: '   ' })).status).toBe(400);
    expect((await viewer.call('GET', `/tasks/${task.id}/comments`)).body.map((comment: { body: string }) => comment.body)).toEqual(['Which colour?']);
    expect((await outsider.call('GET', `/tasks/${task.id}/comments`)).status).toBe(404);

    expect((await owner.call('PATCH', `/tasks/${task.id}/comments/${first.body.id}`, { body: 'Changed' })).status).toBe(403);
    expect((await helper.call('PATCH', `/tasks/${other.id}/comments/${first.body.id}`, { body: 'Moved' })).status).toBe(404);
    const edited = (await helper.call('PATCH', `/tasks/${task.id}/comments/${first.body.id}`, { body: 'Grey or black?' })).body;
    expect(edited.body).toBe('Grey or black?');
    expect(edited.editedAt).not.toBeNull();

    const page = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Office plan' })).body;
    expect((await owner.call('GET', `/tasks/${page.id}/comments`)).status).toBe(404);

    const reply = (await owner.call('POST', `/tasks/${task.id}/comments`, { body: 'Black' })).body;
    expect((await helper.call('DELETE', `/tasks/${task.id}/comments/${reply.id}`)).status).toBe(403);
    expect((await owner.call('DELETE', `/tasks/${task.id}/comments/${first.body.id}`)).status).toBe(204);
    expect((await helper.call('GET', `/tasks/${task.id}/comments`)).body.map((comment: { body: string }) => comment.body)).toEqual(['Black']);
    notify.mockRestore();
  });

  it('attaches files from the same space, uploads straight onto a task and detaches without deleting', async () => {
    const owner = await member('trip-packer');
    const viewer = await member('trip-viewer');
    const space = (await owner.call('POST', '/spaces', { name: 'Trip' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const task = (await owner.call('POST', `/spaces/${space.id}/tasks`, { title: 'Print the tickets' })).body;
    const ticket = await (await strata.upload(owner, space.id, 'ticket.txt', Buffer.from(`ticket ${owner.id}`))).json();
    const personal = await (await strata.upload(owner, owner.soloSpaceId, 'private.txt', Buffer.from(`private ${owner.id}`))).json();

    expect((await owner.call('PUT', `/tasks/${task.id}/attachments/${ticket.id}`)).body).toMatchObject({ id: ticket.id, name: 'ticket.txt' });
    expect((await owner.call('PUT', `/tasks/${task.id}/attachments/${ticket.id}`)).status).toBe(200);
    expect((await owner.call('PUT', `/tasks/${task.id}/attachments/${personal.id}`)).status).toBe(400);
    expect((await viewer.call('PUT', `/tasks/${task.id}/attachments/${ticket.id}`)).status).toBe(403);

    const uploaded = await fetch(`${strata.base}/tasks/${task.id}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('boarding pass.txt') },
      body: new Uint8Array(Buffer.from(`boarding pass ${owner.id}`)),
    });
    expect(uploaded.status).toBe(201);
    const pass = await uploaded.json();
    expect(pass).toMatchObject({ name: 'boarding pass.txt' });
    expect((await strata.prisma.item.findUniqueOrThrow({ where: { id: pass.id } })).spaceId).toBe(space.id);
    expect((await viewer.call('GET', `/tasks/${task.id}/attachments`)).body.map((file: { name: string }) => file.name)).toEqual(['ticket.txt', 'boarding pass.txt']);

    expect((await owner.call('DELETE', `/tasks/${task.id}/attachments/${ticket.id}`)).status).toBe(204);
    expect((await owner.call('DELETE', `/tasks/${task.id}/attachments/${ticket.id}`)).status).toBe(404);
    expect((await owner.call('GET', `/tasks/${task.id}/attachments`)).body.map((file: { id: string }) => file.id)).toEqual([pass.id]);
    expect(await strata.prisma.item.count({ where: { id: ticket.id, trashedAt: null } })).toBe(1);
  });
});
