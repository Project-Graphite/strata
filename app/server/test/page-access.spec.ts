import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ItemKind, PageRole, SpaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { pagePermissions } from '../src/access/page-permissions';
import { PageAccessService } from '../src/notes/page-access.service';

function page(spaceRole: SpaceRole | null, pageRole: PageRole | null, kind: ItemKind = ItemKind.NOTE) {
  const item = {
    id: 'page', spaceId: 'private-space', kind, title: 'Shared page', trashedAt: null as Date | null, archivedAt: null as Date | null,
    note: { quick: false }, pageGrants: pageRole ? [{ role: pageRole }] : [], space: { members: spaceRole ? [{ role: spaceRole }] : [] },
  };
  const findUnique = vi.fn(async () => item);
  return { item, findUnique, access: new PageAccessService({ item: { findUnique } } as never, { spacesOf: (userId: string, access: string) => ({ members: { some: { userId, access } } }) } as never) };
}

describe('page-specific permissions', () => {
  it.each([
    [PageRole.VIEW, false, false, false],
    [PageRole.COMMENT, true, false, false],
    [PageRole.EDIT, true, true, false],
    [PageRole.MANAGE, true, true, true],
  ] as const)('grants %s without space organization access', (role, comment, edit, share) => {
    expect(pagePermissions(null, role)).toEqual({ comment, edit, share, organize: false, history: edit, spaceRole: null, pageRole: role.toLowerCase() });
  });

  it('retains space-viewer commenting and stronger inherited space permissions', () => {
    expect(pagePermissions(SpaceRole.VIEWER, PageRole.VIEW)).toMatchObject({ comment: true, edit: false, share: false, organize: false, history: true });
    expect(pagePermissions(SpaceRole.EDITOR, PageRole.VIEW)).toMatchObject({ comment: true, edit: true, share: true, organize: true });
    expect(pagePermissions(SpaceRole.VIEWER, PageRole.EDIT)).toMatchObject({ comment: true, edit: true, share: false, organize: false });
  });

  it.each([ItemKind.TASK, ItemKind.FILE, ItemKind.EVENT])('refuses %s even with a manager grant', async (kind) => {
    await expect(page(SpaceRole.OWNER, PageRole.MANAGE, kind).access.assertPage('member', 'page', 'read')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires explicit access and confines the selected grant to the requesting account', async () => {
    const shared = page(null, PageRole.EDIT);
    expect(await shared.access.assertPage('recipient', 'page', 'edit')).toMatchObject({ role: SpaceRole.EDITOR, permissions: { organize: false, share: false, pageRole: 'edit' } });
    expect(shared.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page' }, select: expect.objectContaining({ pageGrants: { where: { userId: 'recipient' }, select: { role: true } } }) }));
    await expect(page(null, null).access.assertPage('stranger', 'page', 'read')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let edit grants manage sharing or view grants write comments', async () => {
    await expect(page(null, PageRole.EDIT).access.assertPage('member', 'page', 'share')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(page(null, PageRole.VIEW).access.assertPage('member', 'page', 'comment')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(page(null, PageRole.COMMENT).access.assertPage('member', 'page', 'edit')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not promote a page manager to a space owner', async () => {
    expect(await page(null, PageRole.MANAGE).access.assertPage('member', 'page', 'share')).toMatchObject({ role: SpaceRole.EDITOR, permissions: { spaceRole: null, organize: false } });
  });

  it('suspends direct grants while a page is trashed or archived', async () => {
    const shared = page(null, PageRole.MANAGE);
    shared.item.trashedAt = new Date();
    await expect(shared.access.assertPage('member', 'page', 'read')).rejects.toBeInstanceOf(NotFoundException);
    shared.item.trashedAt = null;
    shared.item.archivedAt = new Date();
    await expect(shared.access.assertPage('member', 'page', 'read')).rejects.toBeInstanceOf(NotFoundException);
    expect(await page(SpaceRole.OWNER, null).access.assertPage('member', 'page', 'share')).toMatchObject({ role: SpaceRole.OWNER });
  });

  it('keeps page-kind and grant requirements inside the authorization conjunction', () => {
    const shared = page(null, null);
    expect(shared.access.pagesOf('recipient', 'comment')).toEqual({ AND: [
      { kind: { in: [ItemKind.NOTE, ItemKind.BOARD] } },
      { OR: [
        { space: { members: { some: { userId: 'recipient', access: 'read' } } } },
        { trashedAt: null, archivedAt: null, pageGrants: { some: { userId: 'recipient', role: { in: [PageRole.COMMENT, PageRole.EDIT, PageRole.MANAGE] } } } },
      ] },
    ] });
  });
});
