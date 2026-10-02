import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { occurrences, zonedInstant } from '../recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';
import { CreateListDto, CreateTaskDto, ListTasksDto, TaskFieldsDto, UpdateTaskDto } from './dto/tasks.dto';

const pageSize = 100;
const dayMs = 24 * 60 * 60 * 1000;
const reminderKind = 'task.reminder';

const taskFields = {
  id: true,
  spaceId: true,
  title: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  trashedAt: true,
  task: {
    select: {
      listId: true,
      parentId: true,
      dueDate: true,
      dueTime: true,
      timeZone: true,
      repeatRule: true,
      reminderMinutes: true,
      priority: true,
      position: true,
      completedAt: true,
      assignee: { select: { id: true, handle: true, displayName: true } },
    },
  },
} satisfies Prisma.ItemSelect;

type TaskRow = Prisma.ItemGetPayload<{ select: typeof taskFields }>;

const dateText = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

function present(row: TaskRow) {
  const task = row.task!;
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    listId: task.listId,
    parentId: task.parentId,
    dueDate: dateText(task.dueDate),
    dueTime: task.dueTime,
    timeZone: task.timeZone,
    repeatRule: task.repeatRule,
    reminderMinutes: task.reminderMinutes,
    priority: task.priority,
    position: task.position,
    assignee: task.assignee,
    completedAt: task.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function today(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function dueInstant(task: { dueDate: Date | null; dueTime: string | null; timeZone: string }) {
  if (!task.dueDate) return null;
  const [hour, minute] = (task.dueTime ?? '09:00').split(':').map(Number) as [number, number];
  return zonedInstant(task.dueDate.getTime() / dayMs, hour, minute, task.timeZone);
}

function checkedRule(text: string | null | undefined) {
  if (!text) return text;
  try {
    return formatRule(parseRule(text));
  } catch (error) {
    if (error instanceof RuleError) throw new BadRequestException(error.message);
    throw error;
  }
}

@Injectable()
export class TasksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly inbox: InboxService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind(payload as { itemId: string; due: string }));
  }

  async createList(userId: string, spaceId: string, input: CreateListDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    return this.prisma.$transaction(async (transaction) => {
      const list = await transaction.item.create({
        data: { spaceId, kind: ItemKind.LIST, title: input.title, createdById: userId, updatedById: userId },
        select: { id: true, spaceId: true, title: true, createdAt: true },
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: list.id, verb: 'item.created', data: { title: input.title } });
      return { ...list, openTasks: 0 };
    });
  }

  async lists(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const lists = await this.prisma.item.findMany({
      where: { spaceId, kind: ItemKind.LIST, trashedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        spaceId: true,
        title: true,
        createdAt: true,
        _count: { select: { listTasks: { where: { completedAt: null, item: { trashedAt: null } } } } },
      },
    });
    return lists.map(({ _count, ...list }) => ({ ...list, openTasks: _count.listTasks }));
  }

  async create(userId: string, spaceId: string, input: CreateTaskDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const fields = await this.checkedFields(spaceId, null, { timeZone: user.timeZone, ...input });
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          spaceId,
          kind: ItemKind.TASK,
          title: input.title,
          createdById: userId,
          updatedById: userId,
          task: { create: { ...fields, timeZone: fields.timeZone ?? user.timeZone } },
        },
        select: { id: true },
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: input.title } });
      await this.afterChange(transaction, item.id, userId, null);
      return item.id;
    });
    return this.get(userId, id);
  }

  async list(userId: string, spaceId: string, query: ListTasksDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const where: Prisma.ItemWhereInput = {
      spaceId,
      kind: ItemKind.TASK,
      trashedAt: null,
      task: {
        ...(query.listId ? { listId: query.listId } : {}),
        completedAt: query.completed ? { not: null } : null,
      },
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        orderBy: query.completed
          ? [{ task: { completedAt: 'desc' } }, { id: 'asc' }]
          : [{ task: { dueDate: { sort: 'asc', nulls: 'last' } } }, { task: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        select: taskFields,
      }),
    ]);
    return { page: query.page, totalPages: Math.max(1, Math.ceil(total / pageSize)), totalResults: total, results: rows.map(present) };
  }

  async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const rows = await this.prisma.item.findMany({
      where: {
        ...this.access.itemsOf(userId),
        kind: ItemKind.TASK,
        trashedAt: null,
        task: {
          completedAt: null,
          dueDate: { lte: new Date(`${today(user.timeZone)}T00:00:00Z`) },
          OR: [{ assigneeId: userId }, { assigneeId: null }],
        },
      },
      orderBy: [{ task: { dueDate: 'asc' } }, { task: { dueTime: { sort: 'asc', nulls: 'first' } } }, { id: 'asc' }],
      take: 200,
      select: taskFields,
    });
    return rows.map(present);
  }

  async get(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: taskFields });
    if (!row.task) throw new NotFoundException('That item is not a task');
    return present(row);
  }

  async update(userId: string, itemId: string, input: UpdateTaskDto) {
    const item = await this.editableTask(userId, itemId);
    const fields = await this.checkedFields(item.spaceId, itemId, {
      timeZone: item.task.timeZone,
      ...input,
      dueDate: input.dueDate === undefined ? dateText(item.task.dueDate) : input.dueDate,
      repeatRule: input.repeatRule === undefined ? item.task.repeatRule : input.repeatRule,
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: { title: input.title, updatedById: userId, task: { update: fields } },
      });
      if (input.title !== undefined && input.title !== item.title) {
        await this.activity.record(transaction, {
          spaceId: item.spaceId,
          actorId: userId,
          itemId,
          verb: 'item.updated',
          data: { title: input.title, renamedFrom: item.title },
        });
      }
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
    });
    return this.get(userId, itemId);
  }

  async complete(userId: string, itemId: string) {
    const item = await this.editableTask(userId, itemId);
    if (item.task.completedAt) return this.get(userId, itemId);
    const next = this.nextOccurrence(item.task);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.task.update({
        where: { itemId },
        data: next
          ? { dueDate: new Date(`${next.date}T00:00:00Z`), repeatRule: next.rule }
          : { completedAt: new Date() },
      });
      await transaction.item.update({ where: { id: itemId }, data: { updatedById: userId } });
      await this.activity.record(transaction, {
        spaceId: item.spaceId,
        actorId: userId,
        itemId,
        verb: 'task.completed',
        data: { title: item.title, ...(next ? { nextDue: next.date } : {}) },
      });
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
    });
    return this.get(userId, itemId);
  }

  async reopen(userId: string, itemId: string) {
    const item = await this.editableTask(userId, itemId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.task.update({ where: { itemId }, data: { completedAt: null } });
      await this.activity.record(transaction, { spaceId: item.spaceId, actorId: userId, itemId, verb: 'task.reopened', data: { title: item.title } });
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
    });
    return this.get(userId, itemId);
  }

  private nextOccurrence(task: { dueDate: Date | null; dueTime: string | null; timeZone: string; repeatRule: string | null }) {
    if (!task.repeatRule || !task.dueDate) return null;
    const rule = parseRule(task.repeatRule);
    if (rule.count === 1) return null;
    const current = dueInstant(task)!;
    const [next] = occurrences(
      rule,
      { date: dateText(task.dueDate)!, time: task.dueTime ?? '09:00', timeZone: task.timeZone },
      { from: new Date(current.getTime() + 1), to: new Date(current.getTime() + 20 * 366 * dayMs) },
      1,
    );
    if (!next) return null;
    return {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: task.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(next),
      rule: formatRule({ ...rule, count: rule.count === null ? null : rule.count - 1 }),
    };
  }

  private async editableTask(userId: string, itemId: string) {
    const found = await this.access.assertItem(userId, itemId, 'edit');
    if (found.trashedAt) throw new BadRequestException('Restore this task from the trash before changing it');
    const item = await this.prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      select: {
        spaceId: true,
        title: true,
        task: { select: { dueDate: true, dueTime: true, timeZone: true, repeatRule: true, assigneeId: true, completedAt: true } },
      },
    });
    if (!item.task) throw new NotFoundException('That item is not a task');
    return { ...item, task: item.task };
  }

  private async checkedFields(spaceId: string, itemId: string | null, input: TaskFieldsDto) {
    if (input.listId) {
      const list = await this.prisma.item.count({ where: { id: input.listId, spaceId, kind: ItemKind.LIST, trashedAt: null } });
      if (!list) throw new BadRequestException('Choose a list from this space');
    }
    if (input.parentId) {
      const parent = await this.prisma.task.findFirst({
        where: { itemId: input.parentId, item: { spaceId, trashedAt: null } },
        select: { parentId: true },
      });
      if (!parent || input.parentId === itemId) throw new BadRequestException('Choose a task from this space');
      if (parent.parentId) throw new BadRequestException('Sub-tasks cannot have sub-tasks of their own');
      if (itemId && (await this.prisma.task.count({ where: { parentId: itemId } }))) {
        throw new BadRequestException('A task with sub-tasks cannot become a sub-task');
      }
    }
    if (input.assigneeId) {
      const member = await this.prisma.spaceMember.count({ where: { spaceId, userId: input.assigneeId } });
      if (!member) throw new BadRequestException('Choose someone from this space');
    }
    const repeatRule = checkedRule(input.repeatRule);
    if (repeatRule && !input.dueDate) {
      throw new BadRequestException('Give a repeating task a due date');
    }
    return {
      listId: input.listId,
      parentId: input.parentId,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(`${input.dueDate}T00:00:00Z`),
      dueTime: input.dueTime,
      timeZone: input.timeZone,
      repeatRule,
      reminderMinutes: input.reminderMinutes,
      assigneeId: input.assigneeId,
      priority: input.priority,
      position: input.position,
    };
  }

  private async afterChange(client: Prisma.TransactionClient, itemId: string, actorId: string, previousAssignee: string | null) {
    const item = await client.item.findUniqueOrThrow({
      where: { id: itemId },
      select: {
        spaceId: true,
        title: true,
        createdById: true,
        task: { select: { dueDate: true, dueTime: true, timeZone: true, reminderMinutes: true, assigneeId: true, completedAt: true } },
      },
    });
    const task = item.task!;
    await client.scheduledJob.deleteMany({
      where: { kind: reminderKind, doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: itemId } },
    });
    const due = dueInstant(task);
    if (due && task.reminderMinutes !== null && !task.completedAt) {
      const remindAt = new Date(due.getTime() - task.reminderMinutes * 60_000);
      if (remindAt > new Date()) {
        await this.jobs.schedule(reminderKind, remindAt, { itemId, due: due.toISOString() }, client);
      }
    }
    if (task.assigneeId && task.assigneeId !== previousAssignee && task.assigneeId !== actorId) {
      await this.inbox.notify(client, [
        { userId: task.assigneeId, kind: 'task_assigned', title: `You were given “${item.title}”`, link: `/spaces/${item.spaceId}/tasks` },
      ]);
    }
  }

  private async remind(payload: { itemId: string; due: string }) {
    const item = await this.prisma.item.findUnique({
      where: { id: payload.itemId },
      select: {
        spaceId: true,
        title: true,
        trashedAt: true,
        createdById: true,
        task: { select: { dueDate: true, dueTime: true, timeZone: true, assigneeId: true, completedAt: true } },
      },
    });
    const task = item?.task;
    if (!item || !task || item.trashedAt || task.completedAt || dueInstant(task)?.toISOString() !== payload.due) return;
    const recipient = task.assigneeId ?? item.createdById;
    if (!recipient) return;
    await this.inbox.notify(this.prisma, [
      {
        userId: recipient,
        kind: 'task_due',
        title: `“${item.title}” is due ${task.dueTime ? `at ${task.dueTime}` : 'today'}`,
        link: `/spaces/${item.spaceId}/tasks`,
      },
    ]);
  }
}
