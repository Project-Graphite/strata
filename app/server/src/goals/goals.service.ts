import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, LinkKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { HabitsService } from '../habits/habits.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';
import { TasksService } from '../tasks/tasks.service';
import { CreateGoalDto, GoalHabitsDto, goalPeriods, ListGoalsDto, UpdateGoalDto } from './dto/goals.dto';

type Period = (typeof goalPeriods)[number];

const goalFields = {
  id: true,
  spaceId: true,
  title: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
  space: { select: { name: true } },
  goal: { select: { period: true, startsOn: true, endsOn: true, status: true, why: true, target: true, current: true, unit: true } },
  goalHabits: { select: { habitId: true } },
} satisfies Prisma.ItemSelect;

type GoalRow = Prisma.ItemGetPayload<{ select: typeof goalFields }>;

export function periodRange(period: Period, day: string) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const first = period === 'year' ? 1 : period === 'quarter' ? Math.floor((month - 1) / 3) * 3 + 1 : month;
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  return {
    startsOn: dateText(new Date(Date.UTC(year, first - 1, 1))),
    endsOn: dateText(new Date(Date.UTC(year, first - 1 + months, 0))),
  };
}

export function goalProgress(goal: { target: number | null; current: number | null }, tasks: { done: number; total: number }) {
  if (goal.target) return Math.min(1, Math.max(0, (goal.current ?? 0) / goal.target));
  return tasks.total ? tasks.done / tasks.total : null;
}

function present(row: GoalRow, tasks: { done: number; total: number }) {
  const goal = row.goal!;
  return {
    id: row.id,
    spaceId: row.spaceId,
    spaceName: row.space.name,
    title: row.title,
    period: goal.period,
    startsOn: dateText(goal.startsOn),
    endsOn: dateText(goal.endsOn),
    status: goal.status,
    why: goal.why,
    target: goal.target,
    current: goal.current,
    unit: goal.unit,
    tasks,
    habitCount: row.goalHabits.length,
    progress: goalProgress(goal, tasks),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly tasks: TasksService,
    private readonly habits: HabitsService,
  ) {}

  async list(userId: string, query: ListGoalsDto) {
    const finished = query.status === 'finished';
    const rows = await this.prisma.item.findMany({
      where: {
        ...this.access.itemsOf(userId),
        kind: ItemKind.GOAL,
        trashedAt: null,
        goal: { status: finished ? { in: ['done', 'dropped'] } : 'active' },
      },
      orderBy: [{ goal: { endsOn: finished ? 'desc' : 'asc' } }, { createdAt: 'asc' }],
      take: 500,
      select: goalFields,
    });
    const counts = await this.taskCounts(userId, rows.map((row) => row.id));
    return rows.map((row) => present(row, counts.get(row.id) ?? { done: 0, total: 0 }));
  }

  async create(userId: string, spaceId: string, input: CreateGoalDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const range = periodRange(input.period, input.startsOn);
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          spaceId,
          kind: ItemKind.GOAL,
          title: input.title,
          createdById: userId,
          updatedById: userId,
          goal: {
            create: {
              period: input.period,
              startsOn: dateValue(range.startsOn),
              endsOn: dateValue(range.endsOn),
              why: input.why ?? '',
              target: input.target ?? null,
              current: input.current ?? null,
              unit: input.unit || null,
            },
          },
        },
        select: { id: true },
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: input.title } });
      return item.id;
    });
    return this.get(userId, id);
  }

  async get(userId: string, itemId: string) {
    const row = await this.row(userId, itemId, 'read');
    const links = await this.taskLinks(userId, [itemId]);
    const tasks = await this.tasks.visible(userId, links.map((link) => link.targetItemId));
    const linkOf = new Map(links.map((link) => [link.targetItemId, link.id]));
    const done = tasks.filter((task) => task.completedAt).length;
    return {
      ...present(row, { done, total: tasks.length }),
      taskList: tasks.map((task) => ({ ...task, linkId: linkOf.get(task.id)! })),
      habits: await this.habits.inSpace(userId, row.spaceId, row.goalHabits.map((habit) => habit.habitId)),
    };
  }

  async update(userId: string, itemId: string, input: UpdateGoalDto) {
    const row = await this.editable(userId, itemId);
    const goal = row.goal!;
    const period = input.period ?? (goal.period as Period);
    const range = input.period || input.startsOn ? periodRange(period, input.startsOn ?? dateText(goal.startsOn)) : null;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: {
          title: input.title,
          updatedById: userId,
          goal: {
            update: {
              period: input.period,
              startsOn: range ? dateValue(range.startsOn) : undefined,
              endsOn: range ? dateValue(range.endsOn) : undefined,
              status: input.status,
              why: input.why,
              target: input.target,
              current: input.current,
              unit: input.unit === undefined ? undefined : input.unit || null,
            },
          },
        },
      });
      await this.activity.record(transaction, { spaceId: row.spaceId, actorId: userId, itemId, verb: 'item.updated', data: { title: input.title ?? row.title } });
    });
    return this.get(userId, itemId);
  }

  async setHabits(userId: string, itemId: string, input: GoalHabitsDto) {
    const row = await this.editable(userId, itemId);
    const found = await this.prisma.habit.count({ where: { id: { in: input.habitIds }, spaceId: row.spaceId } });
    if (found !== input.habitIds.length) throw new BadRequestException('Choose habits from the same space as the goal');
    await this.prisma.$transaction([
      this.prisma.goalHabit.deleteMany({ where: { goalId: itemId } }),
      this.prisma.goalHabit.createMany({ data: input.habitIds.map((habitId) => ({ goalId: itemId, habitId })) }),
    ]);
    return this.get(userId, itemId);
  }

  private taskLinks(userId: string, goalIds: string[]) {
    return this.prisma.itemLink.findMany({
      where: {
        sourceItemId: { in: goalIds },
        kind: LinkKind.REFERENCE,
        target: { ...this.access.itemsOf(userId), kind: ItemKind.TASK, trashedAt: null },
      },
      select: { id: true, sourceItemId: true, targetItemId: true, target: { select: { task: { select: { completedAt: true } } } } },
    });
  }

  private async taskCounts(userId: string, goalIds: string[]) {
    const counts = new Map<string, { done: number; total: number }>();
    for (const link of await this.taskLinks(userId, goalIds)) {
      const count = counts.get(link.sourceItemId) ?? { done: 0, total: 0 };
      count.total += 1;
      if (link.target.task?.completedAt) count.done += 1;
      counts.set(link.sourceItemId, count);
    }
    return counts;
  }

  private async row(userId: string, itemId: string, access: 'read' | 'edit') {
    await this.access.assertItem(userId, itemId, access);
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: goalFields });
    if (!row.goal) throw new NotFoundException('That item is not a goal');
    return row;
  }

  private async editable(userId: string, itemId: string) {
    const row = await this.row(userId, itemId, 'edit');
    if (row.trashedAt) throw new BadRequestException('Restore this goal from the trash before changing it');
    return row;
  }
}
