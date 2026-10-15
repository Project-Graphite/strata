import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async users() {
    const [users, storage] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, displayName: true, email: true, handle: true, role: true, verifiedAt: true, isActive: true, createdAt: true },
      }),
      this.prisma.file.groupBy({ by: ['uploadedById'], _sum: { sizeBytes: true } }),
    ]);
    const used = new Map(storage.map((row) => [row.uploadedById, row._sum.sizeBytes ?? 0]));
    return users.map(({ role, verifiedAt, ...user }) => ({ ...user, role: role.toLowerCase(), verified: Boolean(verifiedAt), usedBytes: used.get(user.id) ?? 0 }));
  }
}
