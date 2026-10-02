import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ItemKind, SpaceRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../../src/auth/password.service';
import { ApiExceptionFilter } from '../../src/http/api-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

const settings = {
  AUTH_ACCESS_TOKEN_SECRET: 'integration-access-secret-long-enough',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:4104',
  APP_URL: 'http://localhost:4104',
  DEFAULT_FROM_EMAIL: 'Strata <strata@example.com>',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
};

const run = randomBytes(4).toString('hex');
const password = 'integration password that is long';

interface Reply {
  status: number;
  body: any;
}

interface Member {
  id: string;
  personalSpaceId: string;
  call: (method: string, path: string, body?: unknown) => Promise<Reply>;
}

describe('Spaces, items, tags and links against Postgres', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let passwordHash: string;
  const members: Member[] = [];

  async function member(name: string): Promise<Member> {
    const user = await prisma.user.create({
      data: {
        email: `${name}-${run}@example.com`,
        handle: `${name}${run}`,
        displayName: name,
        passwordHash,
        verifiedAt: new Date(),
      },
    });
    const space = await prisma.space.create({
      data: {
        name: 'Personal',
        personalOwnerId: user.id,
        createdById: user.id,
        members: { create: { userId: user.id, role: SpaceRole.OWNER } },
      },
    });
    const session = await prisma.refreshSession.create({
      data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const token = await new JwtService().signAsync(
      { sub: user.id, sid: session.id },
      { secret: settings.AUTH_ACCESS_TOKEN_SECRET, expiresIn: 3_600 },
    );
    const created: Member = {
      id: user.id,
      personalSpaceId: space.id,
      async call(method, path, body) {
        const response = await fetch(
          `${base}${path}`,
          body === undefined
            ? { method, headers: { Authorization: `Bearer ${token}` } }
            : {
                method,
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              },
        );
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : null };
      },
    };
    members.push(created);
    return created;
  }

  function item(spaceId: string, title: string, kind: ItemKind = ItemKind.NOTE) {
    return prisma.item.create({ data: { spaceId, kind, title } });
  }

  async function join(spaceId: string, user: Member, role: SpaceRole) {
    await prisma.spaceMember.create({ data: { spaceId, userId: user.id, role } });
  }

  beforeAll(async () => {
    Object.assign(process.env, settings);
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
    app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    prisma = app.get(PrismaService);
    passwordHash = await new PasswordService().hash(password);
  });

  afterAll(async () => {
    const ids = members.map((created) => created.id);
    await prisma.space.deleteMany({ where: { members: { some: { userId: { in: ids } } } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it("hides one person's spaces, items and tags from everyone else", async () => {
    const alice = await member('alice');
    const mallory = await member('mallory');
    const note = await item(alice.personalSpaceId, 'Private note');
    const tag = await alice.call('POST', `/spaces/${alice.personalSpaceId}/tags`, { name: 'Health' });
    expect(tag.status).toBe(201);
    expect((await alice.call('PUT', `/items/${note.id}/tags`, { tagIds: [tag.body.id] })).status).toBe(200);
    await prisma.item.update({ where: { id: note.id }, data: { trashedAt: new Date() } });

    expect((await mallory.call('GET', '/spaces')).body.map((space: { id: string }) => space.id)).toEqual([
      mallory.personalSpaceId,
    ]);
    expect((await mallory.call('GET', '/trash')).body.totalResults).toBe(0);

    const space = `/spaces/${alice.personalSpaceId}`;
    const refused = [
      ['GET', space],
      ['PATCH', space, { name: 'Mine now' }],
      ['DELETE', space],
      ['GET', `${space}/members`],
      ['DELETE', `${space}/members/${alice.id}`],
      ['GET', `${space}/items`],
      ['GET', `${space}/tags`],
      ['POST', `${space}/tags`, { name: 'Sneaky' }],
      ['PATCH', `/tags/${tag.body.id}`, { name: 'Renamed' }],
      ['DELETE', `/tags/${tag.body.id}`],
      ['GET', `/items/${note.id}`],
      ['PATCH', `/items/${note.id}`, { title: 'Changed' }],
      ['PUT', `/items/${note.id}/tags`, { tagIds: [] }],
      ['POST', `/items/${note.id}/trash`],
      ['POST', `/items/${note.id}/restore`],
      ['DELETE', `/items/${note.id}`],
      ['GET', `/items/${note.id}/links`],
    ] as const;
    for (const [method, path, body] of refused) {
      expect({ method, path, status: (await mallory.call(method, path, body)).status }).toEqual({
        method,
        path,
        status: 404,
      });
    }

    expect((await alice.call('GET', `/items/${note.id}`)).body).toMatchObject({
      title: 'Private note',
      tags: [{ name: 'Health' }],
    });
    expect((await alice.call('GET', '/trash')).body.results.map((trashed: { id: string }) => trashed.id)).toEqual([
      note.id,
    ]);
  });

  it('lets viewers read a shared space and only editors change it', async () => {
    const owner = await member('owner');
    const viewer = await member('viewer');
    const outsider = await member('outsider');
    const shared = await owner.call('POST', '/spaces', { name: 'Family', color: 'teal' });
    expect(shared.body).toMatchObject({ name: 'Family', color: 'teal', kind: 'shared', role: 'owner' });
    const spaceId = shared.body.id;
    await join(spaceId, viewer, SpaceRole.VIEWER);
    const task = await item(spaceId, 'Groceries', ItemKind.TASK);
    await item(spaceId, 'Holiday', ItemKind.EVENT);

    expect((await viewer.call('GET', '/spaces')).body.map((space: { name: string }) => space.name)).toEqual([
      'Personal',
      'Family',
    ]);
    const tasks = await viewer.call('GET', `/spaces/${spaceId}/items?kind=task`);
    expect(tasks.body.results.map((listed: { id: string }) => listed.id)).toEqual([task.id]);
    expect((await viewer.call('GET', `/spaces/${spaceId}/members`)).body).toHaveLength(2);
    expect((await viewer.call('POST', `/spaces/${spaceId}/tags`, { name: 'Food' })).status).toBe(403);
    expect((await viewer.call('PATCH', `/items/${task.id}`, { title: 'Mine' })).status).toBe(403);
    expect((await viewer.call('POST', `/items/${task.id}/trash`)).status).toBe(403);
    expect((await viewer.call('PATCH', `/spaces/${spaceId}`, { name: 'Ours' })).status).toBe(403);
    expect((await viewer.call('PATCH', `/spaces/${spaceId}/members/${viewer.id}`, { role: 'owner' })).status).toBe(403);
    expect((await outsider.call('GET', `/spaces/${spaceId}/items`)).status).toBe(404);

    await owner.call('POST', `/items/${task.id}/trash`);
    expect((await viewer.call('GET', '/trash')).body.totalResults).toBe(0);
    expect((await owner.call('PATCH', `/spaces/${spaceId}/members/${viewer.id}`, { role: 'editor' })).body).toMatchObject({
      userId: viewer.id,
      role: 'editor',
    });
    expect((await viewer.call('GET', '/trash')).body.results.map((trashed: { id: string }) => trashed.id)).toEqual([
      task.id,
    ]);
    expect((await viewer.call('PATCH', `/items/${task.id}`, { title: 'Mine' })).status).toBe(400);
    expect((await viewer.call('POST', `/items/${task.id}/restore`)).status).toBe(204);
    expect((await viewer.call('DELETE', `/items/${task.id}`)).status).toBe(400);
    expect((await viewer.call('PATCH', `/items/${task.id}`, { title: 'Weekly shop', archived: true })).body).toMatchObject({
      title: 'Weekly shop',
      archivedAt: expect.any(String),
    });
    expect((await viewer.call('GET', `/spaces/${spaceId}/items?archived=true`)).body.totalResults).toBe(1);
    await viewer.call('POST', `/items/${task.id}/trash`);
    expect((await viewer.call('DELETE', `/items/${task.id}`)).status).toBe(204);
    expect(await prisma.item.count({ where: { id: task.id } })).toBe(0);
  });

  it('keeps tag names unique per space and tags inside their own space', async () => {
    const owner = await member('tagger');
    const shared = await owner.call('POST', '/spaces', { name: 'Work' });
    const note = await item(shared.body.id, 'Plan');
    const personalTag = await owner.call('POST', `/spaces/${owner.personalSpaceId}/tags`, { name: 'Ideas' });

    expect((await owner.call('POST', `/spaces/${owner.personalSpaceId}/tags`, { name: ' IDEAS ' })).status).toBe(409);
    expect((await owner.call('POST', `/spaces/${shared.body.id}/tags`, { name: 'Ideas' })).status).toBe(201);
    expect((await owner.call('PUT', `/items/${note.id}/tags`, { tagIds: [personalTag.body.id] })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${owner.personalSpaceId}/tags`, { name: 'Odd', color: 'beige' })).status).toBe(400);
  });

  it('shows links and backlinks only for items the viewer can open', async () => {
    const owner = await member('linker');
    const editor = await member('reader');
    const shared = await owner.call('POST', '/spaces', { name: 'Project' });
    await join(shared.body.id, editor, SpaceRole.EDITOR);
    const sharedNote = await item(shared.body.id, 'Shared plan');
    const privateNote = await item(owner.personalSpaceId, 'Private research');
    const editorNote = await item(editor.personalSpaceId, 'Editor scratch');

    const link = await owner.call('POST', `/items/${sharedNote.id}/links`, { targetId: privateNote.id, kind: 'reference' });
    expect(link.body).toMatchObject({ kind: 'reference', item: { id: privateNote.id, title: 'Private research' } });
    expect((await owner.call('POST', `/items/${sharedNote.id}/links`, { targetId: privateNote.id, kind: 'reference' })).status).toBe(409);
    expect((await owner.call('POST', `/items/${sharedNote.id}/links`, { targetId: sharedNote.id, kind: 'mention' })).status).toBe(400);
    expect((await editor.call('POST', `/items/${editorNote.id}/links`, { targetId: sharedNote.id, kind: 'mention' })).status).toBe(201);
    expect((await editor.call('POST', `/items/${sharedNote.id}/links`, { targetId: privateNote.id, kind: 'mention' })).status).toBe(404);

    const ownerView = (await owner.call('GET', `/items/${sharedNote.id}/links`)).body;
    expect(ownerView.outgoing.map((shown: { item: { id: string } }) => shown.item.id)).toEqual([privateNote.id]);
    expect(ownerView.backlinks).toEqual([]);

    const editorView = (await editor.call('GET', `/items/${sharedNote.id}/links`)).body;
    expect(editorView.outgoing).toEqual([]);
    expect(editorView.backlinks.map((shown: { item: { id: string } }) => shown.item.id)).toEqual([editorNote.id]);

    expect((await owner.call('GET', `/items/${privateNote.id}/links`)).body.backlinks).toHaveLength(1);
    await prisma.item.update({ where: { id: sharedNote.id }, data: { trashedAt: new Date() } });
    expect((await owner.call('GET', `/items/${privateNote.id}/links`)).body.backlinks).toEqual([]);

    expect((await editor.call('DELETE', `/items/${sharedNote.id}/links/${link.body.id}`)).status).toBe(204);
    expect((await editor.call('DELETE', `/items/${sharedNote.id}/links/${link.body.id}`)).status).toBe(404);
  });

  it('always leaves a space with an owner and never deletes a personal space', async () => {
    const owner = await member('founder');
    const editor = await member('helper');
    const shared = await owner.call('POST', '/spaces', { name: 'Club' });
    const spaceId = shared.body.id;
    await join(spaceId, editor, SpaceRole.EDITOR);

    expect((await owner.call('PATCH', `/spaces/${spaceId}/members/${owner.id}`, { role: 'editor' })).status).toBe(409);
    expect((await owner.call('DELETE', `/spaces/${spaceId}/members/${owner.id}`)).status).toBe(409);
    expect((await owner.call('DELETE', `/spaces/${owner.personalSpaceId}`)).status).toBe(400);
    expect((await owner.call('DELETE', `/spaces/${owner.personalSpaceId}/members/${owner.id}`)).status).toBe(409);

    await owner.call('PATCH', `/spaces/${spaceId}/members/${editor.id}`, { role: 'owner' });
    expect((await owner.call('DELETE', `/spaces/${spaceId}/members/${owner.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/spaces/${spaceId}`)).status).toBe(404);
    expect((await editor.call('DELETE', `/spaces/${spaceId}`)).status).toBe(204);
  });

  it('refuses to delete an account that would leave a shared space without an owner', async () => {
    const owner = await member('leaver');
    const editor = await member('stayer');
    const kept = await owner.call('POST', '/spaces', { name: 'Neighbours' });
    const solo = await owner.call('POST', '/spaces', { name: 'Solo' });
    await join(kept.body.id, editor, SpaceRole.EDITOR);

    const refused = await owner.call('DELETE', '/me', { password });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('"Neighbours"');

    await owner.call('PATCH', `/spaces/${kept.body.id}/members/${editor.id}`, { role: 'owner' });
    expect((await owner.call('DELETE', '/me', { password })).status).toBe(204);
    expect(await prisma.space.count({ where: { id: { in: [solo.body.id, owner.personalSpaceId] } } })).toBe(0);
    expect((await editor.call('GET', `/spaces/${kept.body.id}/members`)).body.map((shown: { userId: string }) => shown.userId)).toEqual([
      editor.id,
    ]);
  });
});
