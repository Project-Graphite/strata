import { NotFoundException } from '@nestjs/common';
import { SpaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { mergedDefaults, spaceDefaults } from '../src/spaces/space-defaults';
import { SpacesService } from '../src/spaces/spaces.service';
import { TasksService } from '../src/tasks/tasks.service';

const stored = { id: 'space', slug: 'abcde12345', name: 'Team', color: 'blue', description: '', defaults: { task: { priority: 2 } } };

function spaces(role: SpaceRole | null) {
  const prisma = {
    spaceMember: { findUnique: vi.fn(async () => (role ? { role } : null)) },
    space: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => (where.slug === stored.slug ? { id: stored.id } : null)),
      findUniqueOrThrow: vi.fn(async () => stored),
      update: vi.fn(async ({ data }: { data: object }) => ({ ...stored, ...data })),
    },
    $transaction: async (work: Promise<unknown>[]) => Promise.all(work),
  };
  const access = { assertSpace: vi.fn(async () => SpaceRole.VIEWER) };
  return { prisma, access, service: new SpacesService(prisma as never, access as never, { record: async () => ({}) } as never, {} as never) };
}

describe('space settings', () => {
  it('fills in every default a space has not chosen', () => {
    expect(spaceDefaults({ task: { priority: 2 } })).toEqual({
      page: { icon: null, narrow: false, template: null },
      board: { icon: null, template: null },
      task: { type: 'task', priority: 2, assignee: 'creator', status: 'open', listId: null, view: 'board' },
      access: { inviteRole: 'editor', inviters: 'owners', sharers: 'editors', linkDays: 30 },
    });
  });

  it('changes only the defaults that are sent', () => {
    expect(mergedDefaults({ page: { narrow: true }, task: { listId: 'epic' } }, { page: { icon: '📌', narrow: undefined }, task: { assignee: 'none', view: 'list', listId: null } })).toEqual({
      page: { icon: '📌', narrow: true, template: null },
      board: { icon: null, template: null },
      task: { type: 'task', priority: 0, assignee: 'none', status: 'open', listId: null, view: 'list' },
      access: { inviteRole: 'editor', inviters: 'owners', sharers: 'editors', linkDays: 30 },
    });
  });

  it('shows the settings to owners and hides them from everyone else', async () => {
    await expect(spaces(SpaceRole.OWNER).service.settings('owner', 'space')).resolves.toMatchObject({ slug: stored.slug, defaults: { task: { priority: 2 } } });
    await expect(spaces(SpaceRole.EDITOR).service.settings('editor', 'space')).rejects.toBeInstanceOf(NotFoundException);
    await expect(spaces(null).service.settings('stranger', 'space')).rejects.toBeInstanceOf(NotFoundException);
    await expect(spaces(SpaceRole.VIEWER).service.updateSettings('viewer', 'space', { description: 'Ours' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('finds a space by its short link as well as its id', async () => {
    const { service, access } = spaces(SpaceRole.VIEWER);
    await expect(service.get('member', stored.slug)).resolves.toMatchObject({ id: 'space', slug: stored.slug });
    expect(access.assertSpace).toHaveBeenCalledWith('member', 'space', 'read');
    await expect(service.get('member', 'zzzzzzzzzz')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('columns per epic', () => {
  it('only accepts an epic from the same home and counts columns per epic', async () => {
    const prisma = {
      item: { count: vi.fn(async () => 0) },
      taskColumn: { count: vi.fn(async () => 0), create: vi.fn() },
    };
    const access = { assertHome: vi.fn(async () => ({ spaceId: null, ownerId: 'me' })) };
    const tasks = new TasksService(prisma as never, access as never, {} as never, {} as never, {} as never, { notify: vi.fn() } as never, {} as never);
    await expect(tasks.createColumn('me', null, { name: 'Review', listId: 'their-epic' })).rejects.toThrow('Choose an epic from this space');
    expect(prisma.item.count).toHaveBeenCalledWith({ where: { id: 'their-epic', ownerId: 'me', kind: 'LIST', trashedAt: null } });

    prisma.item.count.mockResolvedValueOnce(1);
    prisma.taskColumn.count.mockResolvedValueOnce(10);
    await expect(tasks.createColumn('me', null, { name: 'Review', listId: 'epic' })).rejects.toThrow('at most 10');
    expect(prisma.taskColumn.count).toHaveBeenCalledWith({ where: { ownerId: 'me', listId: 'epic' } });
    expect(prisma.taskColumn.create).not.toHaveBeenCalled();
  });
});
