import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      timeZone: user.timeZone,
      timeFormat: user.timeFormat,
      tidySummary: user.tidySummary,
      weeklyReview: user.weeklyReview,
      homeCurrency: user.homeCurrency,
      weekStart: user.weekStart,
      weekendDays: user.weekendDays,
      features: user.features,
      role: user.role.toLowerCase(),
    };
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName,
        timeZone: input.timeZone,
        timeFormat: input.timeFormat,
        tidySummary: input.tidySummary,
        weeklyReview: input.weeklyReview,
        homeCurrency: input.homeCurrency,
        weekStart: input.weekStart,
        weekendDays: input.weekendDays?.toSorted((first, second) => first - second),
        features: input.features,
      },
    });
    return this.me(userId);
  }

  async export(userId: string) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        handle: true,
        displayName: true,
        timeZone: true,
        verifiedAt: true,
        createdAt: true,
      },
    });
    return { exportedAt: new Date(), account };
  }
}
