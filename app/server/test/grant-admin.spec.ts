import { UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { grantAdmin } from '../src/admin/grant-admin';

describe('granting admin rights', () => {
  function prismaWith(user: object | null) {
    const transaction = {
      user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn() },
      refreshSession: { updateMany: vi.fn() },
    };
    return { transaction, prisma: { $transaction: vi.fn((run: (client: typeof transaction) => unknown) => run(transaction)) } };
  }
  const member = { id: 'user-id', handle: 'reader', role: UserRole.MEMBER, verifiedAt: new Date(), isActive: true };

  it('makes a verified, active member an admin and signs them out everywhere', async () => {
    const { prisma, transaction } = prismaWith(member);
    await expect(grantAdmin(prisma as never, ' Reader@Example.com ', false)).resolves.toBe('reader is now an admin');
    expect(transaction.user.findUnique).toHaveBeenCalledWith({ where: { email: 'reader@example.com' } });
    expect(transaction.user.update).toHaveBeenCalledWith({ where: { id: 'user-id' }, data: { role: UserRole.ADMIN } });
    expect(transaction.refreshSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-id', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('takes admin rights away again', async () => {
    const { prisma, transaction } = prismaWith({ ...member, role: UserRole.ADMIN });
    await expect(grantAdmin(prisma as never, 'reader@example.com', true)).resolves.toBe('reader is no longer an admin');
    expect(transaction.user.update).toHaveBeenCalledWith({ where: { id: 'user-id' }, data: { role: UserRole.MEMBER } });
  });

  it('leaves the account alone when nothing would change', async () => {
    const { prisma, transaction } = prismaWith({ ...member, role: UserRole.ADMIN });
    await expect(grantAdmin(prisma as never, 'reader@example.com', false)).resolves.toBe('reader is already an admin');
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'No account uses that email address'],
    [{ ...member, verifiedAt: null }, 'The account must be verified and active'],
    [{ ...member, isActive: false }, 'The account must be verified and active'],
    [{ ...member, role: UserRole.SYSTEM_MANAGER }, 'reader is the system manager, which already includes admin rights'],
  ])('refuses %#', async (user, message) => {
    const { prisma } = prismaWith(user);
    await expect(grantAdmin(prisma as never, 'reader@example.com', false)).rejects.toThrow(message);
  });
});
