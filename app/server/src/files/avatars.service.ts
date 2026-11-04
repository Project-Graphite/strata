import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

@Injectable()
export class AvatarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async set(userId: string, name: string, data: Buffer) {
    const { id } = await this.files.upload(userId, null, name, data);
    const { file } = await this.prisma.item.findUniqueOrThrow({ where: { id }, select: { file: { select: { mimeType: true } } } });
    if (!file?.mimeType.startsWith('image/')) {
      await this.prisma.item.delete({ where: { id } });
      throw new BadRequestException('Choose an image for your profile picture.');
    }
    const { avatarId } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarId: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarId: id } });
    if (avatarId) await this.prisma.item.deleteMany({ where: { id: avatarId, ownerId: userId } });
    return { avatarId: id };
  }

  async remove(userId: string) {
    const { avatarId } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarId: true } });
    if (!avatarId) return;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarId: null } });
    await this.prisma.item.deleteMany({ where: { id: avatarId, ownerId: userId } });
  }

  async read(viewerId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarId: true } });
    const allowed = viewerId === userId || (await this.prisma.spaceMember.count({ where: { userId: viewerId, space: { members: { some: { userId } } } } })) > 0;
    if (!user?.avatarId || !allowed) throw new NotFoundException('No profile picture');
    return this.files.read(user.avatarId);
  }
}
