import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, localDate } from '../recurrence/dates';
import { CreateHabitDto, UpdateHabitDto } from './dto/habits.dto';
import { habitStats, shiftDay } from './streaks';

const maxHabits = 50;
const historyDays = 400;
const habitFields = { id: true, spaceId: true, name: true, perWeek: true, position: true, space: { select: { name: true } } } satisfies Prisma.HabitSelect;

type HabitRow = Prisma.HabitGetPayload<{ select: typeof habitFields }>;

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const habits = await this.prisma.habit.findMany({ where: { spaceId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: habitFields });
    return this.withStats(userId, habits);
  }

  async mine(userId: string) {
    const habits = await this.prisma.habit.findMany({
      where: { space: this.access.spacesOf(userId) },
      orderBy: [{ space: { createdAt: 'asc' } }, { position: 'asc' }, { createdAt: 'asc' }],
      select: habitFields,
    });
    return this.withStats(userId, habits);
  }

  async create(userId: string, spaceId: string, input: CreateHabitDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const count = await this.prisma.habit.count({ where: { spaceId } });
    if (count >= maxHabits) throw new ConflictException(`A space can track ${maxHabits} habits. Delete one you no longer keep.`);
    const habit = await this.prisma.habit.create({ data: { spaceId, name: input.name, perWeek: input.perWeek ?? 7, position: count }, select: habitFields });
    return (await this.withStats(userId, [habit]))[0]!;
  }

  async update(userId: string, habitId: string, input: UpdateHabitDto) {
    await this.habit(userId, habitId, 'edit');
    const habit = await this.prisma.habit.update({ where: { id: habitId }, data: { name: input.name, perWeek: input.perWeek }, select: habitFields });
    return (await this.withStats(userId, [habit]))[0]!;
  }

  async remove(userId: string, habitId: string) {
    await this.habit(userId, habitId, 'edit');
    await this.prisma.habit.deleteMany({ where: { id: habitId } });
  }

  async checkIn(userId: string, habitId: string, day: string, done: boolean) {
    const habit = await this.habit(userId, habitId, 'read');
    const today = await this.today(userId);
    if (day !== today && day !== shiftDay(today, -1)) throw new BadRequestException('Check in for today or yesterday');
    const key = { habitId, userId, day: dateValue(day) };
    if (done) {
      await this.prisma.habitCheckIn.upsert({ where: { habitId_userId_day: key }, create: key, update: {} });
    } else {
      await this.prisma.habitCheckIn.deleteMany({ where: key });
    }
    return (await this.withStats(userId, [habit]))[0]!;
  }

  private async habit(userId: string, habitId: string, access: 'read' | 'edit') {
    const habit = await this.prisma.habit.findFirst({ where: { id: habitId, space: this.access.spacesOf(userId) }, select: habitFields });
    if (!habit) throw new NotFoundException('Habit not found');
    if (access === 'edit') await this.access.assertSpace(userId, habit.spaceId, 'edit');
    return habit;
  }

  private async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    return localDate(user.timeZone);
  }

  private async withStats(userId: string, habits: HabitRow[]) {
    const today = await this.today(userId);
    const checkIns = await this.prisma.habitCheckIn.findMany({
      where: { userId, habitId: { in: habits.map((habit) => habit.id) }, day: { gte: dateValue(shiftDay(today, -historyDays)) } },
      select: { habitId: true, day: true },
    });
    return habits.map(({ space, ...habit }) => ({
      ...habit,
      spaceName: space.name,
      today,
      ...habitStats(
        checkIns.filter((checkIn) => checkIn.habitId === habit.id).map((checkIn) => dateText(checkIn.day)),
        habit.perWeek,
        today,
      ),
    }));
  }
}
