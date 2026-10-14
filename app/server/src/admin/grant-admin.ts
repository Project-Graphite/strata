import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function grantAdmin(prisma: PrismaService, email: string, revoke: boolean) {
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      throw new Error('No account uses that email address');
    }
    if (!user.verifiedAt || !user.isActive) {
      throw new Error('The account must be verified and active');
    }
    if (user.role === UserRole.SYSTEM_MANAGER) {
      throw new Error(`${user.handle} is the system manager, which already includes admin rights`);
    }
    const role = revoke ? UserRole.MEMBER : UserRole.ADMIN;
    if (user.role === role) {
      return revoke ? `${user.handle} is not an admin` : `${user.handle} is already an admin`;
    }
    await transaction.user.update({ where: { id: user.id }, data: { role } });
    await transaction.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return revoke ? `${user.handle} is no longer an admin` : `${user.handle} is now an admin`;
  });
}
