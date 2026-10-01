import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function grantSystemManager(prisma: PrismaService, email: string, transfer: boolean) {
  return prisma.$transaction(
    async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      if (!user) {
        throw new Error('No account uses that email address');
      }
      if (!user.verifiedAt || !user.isActive) {
        throw new Error('The account must be verified and active');
      }
      if (user.role === UserRole.SYSTEM_MANAGER) {
        throw new Error(`${user.handle} is already the system manager`);
      }
      const current = await transaction.user.findFirst({
        where: { role: UserRole.SYSTEM_MANAGER },
        select: { id: true, handle: true },
      });
      if (current && !transfer) {
        throw new Error(
          `${current.handle} is the system manager; add --transfer to hand the role over`,
        );
      }
      if (current) {
        await transaction.user.update({
          where: { id: current.id },
          data: { role: UserRole.MEMBER },
        });
      }
      await transaction.user.update({
        where: { id: user.id },
        data: { role: UserRole.SYSTEM_MANAGER },
      });
      await transaction.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return current
        ? `${user.handle} is now the system manager; ${current.handle} is now a member`
        : `${user.handle} is now the system manager`;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
