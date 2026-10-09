import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Page comments against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('lets members discuss a page, tells the people involved, and keeps changes to the right people', async () => {
    const owner = await member('page-owner');
    const editor = await member('page-editor');
    const viewer = await member('page-viewer');
    const outsider = await member('page-outsider');
    const space = (await owner.call('POST', '/spaces', { name: 'Garden' })).body;
    await strata.join(space.id, editor, SpaceRole.EDITOR);
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Planting plan' })).body;

    expect((await viewer.call('POST', `/notes/${note.id}/comments`, { body: '   ' })).status).toBe(400);
    expect((await outsider.call('POST', `/notes/${note.id}/comments`, { body: 'Hello' })).status).toBe(404);
    const question = await viewer.call('POST', `/notes/${note.id}/comments`, { body: 'Tomatoes in March?' });
    expect(question.status).toBe(201);
    expect(question.body).toMatchObject({ body: 'Tomatoes in March?', parentId: null, resolvedAt: null, author: { id: viewer.id, displayName: 'page-viewer' } });
    const reply = (await editor.call('POST', `/notes/${note.id}/comments`, { body: 'April is safer.', parentId: question.body.id })).body;
    expect((await owner.call('POST', `/notes/${note.id}/comments`, { body: 'Too deep', parentId: reply.id })).status).toBe(400);

    const inbox = async (as: typeof owner) => (await as.call('GET', '/me/inbox?page=1')).body.results.filter((entry: { kind: string }) => entry.kind === 'comment');
    expect(await inbox(owner)).toHaveLength(2);
    expect((await inbox(viewer)).map((entry: { title: string; link: string }) => [entry.title, entry.link])).toEqual([
      ['page-editor commented on Planting plan', `/notes/${note.id}`],
    ]);
    expect(await inbox(editor)).toHaveLength(0);

    expect((await editor.call('PATCH', `/comments/${question.body.id}`, { body: 'Changed' })).status).toBe(403);
    expect((await viewer.call('PATCH', `/comments/${question.body.id}`, { body: 'Tomatoes in early March?' })).body).toMatchObject({
      body: 'Tomatoes in early March?',
      editedAt: expect.any(String),
    });
    expect((await viewer.call('PUT', `/comments/${question.body.id}/resolved`)).status).toBe(403);
    expect((await editor.call('PUT', `/comments/${reply.id}/resolved`)).status).toBe(400);
    expect((await editor.call('PUT', `/comments/${question.body.id}/resolved`)).body.resolvedAt).toEqual(expect.any(String));
    expect((await outsider.call('GET', `/notes/${note.id}/comments`)).status).toBe(404);
    expect((await viewer.call('GET', `/notes/${note.id}/comments`)).body.map((comment: { body: string }) => comment.body)).toEqual([
      'Tomatoes in early March?',
      'April is safer.',
    ]);

    expect((await viewer.call('DELETE', `/comments/${reply.id}`)).status).toBe(403);
    expect((await owner.call('DELETE', `/comments/${question.body.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/notes/${note.id}/comments`)).body).toEqual([]);
  });

  it('ties a comment to a block, keeping replies in the thread', async () => {
    const owner = await member('block-owner');
    const space = (await owner.call('POST', '/spaces', { name: 'Allotment' })).body;
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Beds' })).body;

    const onBlock = (await owner.call('POST', `/notes/${note.id}/comments`, { body: 'Which variety?', blockId: 'block-1' })).body;
    expect(onBlock.blockId).toBe('block-1');
    expect((await owner.call('POST', `/notes/${note.id}/comments`, { body: 'Cherry ones.', parentId: onBlock.id, blockId: 'block-2' })).body.blockId).toBeNull();
    expect((await owner.call('POST', `/notes/${note.id}/comments`, { body: 'Whole page' })).body.blockId).toBeNull();
    expect((await owner.call('POST', `/notes/${note.id}/comments`, { body: 'Bad block', blockId: 'no spaces allowed' })).status).toBe(400);
  });
});
