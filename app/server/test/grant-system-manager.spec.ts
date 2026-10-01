import { UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { grantSystemManager } from '../src/admin/grant-system-manager';

describe('granting the system manager', () => {
  function prismaWith(user: object | null, current: object | null = null) {
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn(),
      },
      refreshSession: { updateMany: vi.fn() },
    };
    return {
      transaction,
      prisma: {
        $transaction: vi.fn((run: (client: typeof transaction) => unknown) => run(transaction)),
      },
    };
  }
  const reader = {
    id: 'user-id',
    handle: 'reader',
    role: UserRole.ADMIN,
    verifiedAt: new Date(),
    isActive: true,
  };

  it('promotes one verified, active account and signs it out everywhere', async () => {
    const { prisma, transaction } = prismaWith(reader);

    await expect(grantSystemManager(prisma as never, ' Reader@Example.com ', false)).resolves.toBe(
      'reader is now the system manager',
    );
    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'reader@example.com' },
    });
    expect(transaction.user.update).toHaveBeenCalledTimes(1);
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { role: UserRole.SYSTEM_MANAGER },
    });
    expect(transaction.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('hands the role over only when asked to, demoting the previous manager', async () => {
    const current = { id: 'manager-id', handle: 'manager' };

    const refused = prismaWith(reader, current);
    await expect(grantSystemManager(refused.prisma as never, 'reader@example.com', false)).rejects.toThrow(
      'add --transfer',
    );
    expect(refused.transaction.user.update).not.toHaveBeenCalled();

    const transferred = prismaWith(reader, current);
    await expect(grantSystemManager(transferred.prisma as never, 'reader@example.com', true)).resolves.toBe(
      'reader is now the system manager; manager is now a member',
    );
    expect(transferred.transaction.user.update.mock.calls).toEqual([
      [{ where: { id: 'manager-id' }, data: { role: UserRole.MEMBER } }],
      [{ where: { id: 'user-id' }, data: { role: UserRole.SYSTEM_MANAGER } }],
    ]);
  });

  it.each([
    ['the account is unverified', prismaWith({ ...reader, verifiedAt: null })],
    ['the account is deactivated', prismaWith({ ...reader, isActive: false })],
    ['the account is already the system manager', prismaWith({ ...reader, role: UserRole.SYSTEM_MANAGER })],
    ['no account matches', prismaWith(null)],
  ])('refuses when %s', async (_label, { prisma, transaction }) => {
    await expect(grantSystemManager(prisma as never, 'reader@example.com', true)).rejects.toThrow();
    expect(transaction.user.update).not.toHaveBeenCalled();
  });
});
