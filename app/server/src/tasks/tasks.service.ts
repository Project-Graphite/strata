import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind, Prisma, TaskStatus } from '@prisma/client';
import { type Access, AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { ChangesService } from '../changes/changes.service';
import { InboxService } from '../inbox/inbox.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { occurrences, zonedInstant } from '../recurrence/occurrences';
import { formatRule, parseRule, RuleError } from '../recurrence/rule';
import { presentTag, tagFields } from '../tags/tags.service';
import { CreateListDto, CreateTaskDto, ListTasksDto, MoveTaskDto, TaskFieldsDto, UpdateTaskDto } from './dto/tasks.dto';
import { positionBetween, positionGap } from './task-position';
import { statusFields, statusOf } from './task-status';

const pageSize = 100;
const reminderKind = 'task.reminder';

const taskFields = {
  id: true,
  spaceId: true,
  title: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  trashedAt: true,
  tags: { select: { tag: { select: tagFields } }, orderBy: { tag: { name: 'asc' } } },
  subtasks: { where: { item: { trashedAt: null } }, select: { completedAt: true } },
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
      status: true,
      completedAt: true,
      assignee: { select: { id: true, handle: true, displayName: true } },
    },
  },
} satisfies Prisma.ItemSelect;

const detailFields = { ...taskFields, task: { select: { ...taskFields.task.select, description: true } } } satisfies Prisma.ItemSelect;

type TaskRow = Prisma.ItemGetPayload<{ select: typeof taskFields }>;

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
    status: task.status.toLowerCase(),
    labels: row.tags.map(({ tag }) => presentTag(tag)),
    subtaskCounts: { total: row.subtasks.length, done: row.subtasks.filter((subtask) => subtask.completedAt).length },
    assignee: task.assignee,
    completedAt: task.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    private readonly changes: ChangesService,
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
    return this.listsIn({ spaceId });
  }

  myLists(userId: string, spaceId?: string) {
    return this.listsIn({ ...this.access.itemsOf(userId), ...(spaceId ? { spaceId } : {}) });
  }

  private async listsIn(scope: Prisma.ItemWhereInput) {
    const lists = await this.prisma.item.findMany({
      where: { ...scope, kind: ItemKind.LIST, trashedAt: null },
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
          task: {
            create: {
              ...fields,
              ...statusFields(input.status ? statusOf(input.status) : TaskStatus.OPEN, null),
              timeZone: fields.timeZone ?? user.timeZone,
              assigneeId: input.assigneeId === undefined ? userId : input.assigneeId,
              position: input.position ?? Date.now(),
            },
          },
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
    return this.pageOf({ spaceId }, {}, query);
  }

  mine(userId: string, query: ListTasksDto) {
    return this.pageOf({ ...this.access.itemsOf(userId), ...(query.spaceId ? { spaceId: query.spaceId } : {}) }, query.listId || query.spaceId ? {} : { OR: [{ assigneeId: userId }, { assigneeId: null }] }, query);
  }

  private async pageOf(scope: Prisma.ItemWhereInput, tasks: Prisma.TaskWhereInput, query: ListTasksDto) {
    const where: Prisma.ItemWhereInput = {
      ...scope,
      kind: ItemKind.TASK,
      trashedAt: null,
      task: {
        ...tasks,
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

  async today(userId: string, spaceId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const rows = await this.prisma.item.findMany({
      where: {
        ...this.access.itemsOf(userId), ...(spaceId ? { spaceId } : {}),
        kind: ItemKind.TASK,
        trashedAt: null,
        task: {
          completedAt: null,
          dueDate: { lte: dateValue(localDate(user.timeZone)) },
          ...(!spaceId ? { OR: [{ assigneeId: userId }, { assigneeId: null }] } : {}),
        },
      },
      orderBy: [{ task: { dueDate: 'asc' } }, { task: { dueTime: { sort: 'asc', nulls: 'first' } } }, { id: 'asc' }],
      take: 200,
      select: taskFields,
    });
    return rows.map(present);
  }

  async visible(userId: string, itemIds: string[]) {
    const rows = await this.prisma.item.findMany({
      where: { ...this.access.itemsOf(userId), id: { in: itemIds }, kind: ItemKind.TASK, trashedAt: null },
      orderBy: [{ task: { completedAt: { sort: 'asc', nulls: 'first' } } }, { task: { dueDate: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
      select: taskFields,
    });
    return rows.map(present);
  }

  async get(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: detailFields });
    if (!row.task) throw new NotFoundException('That item is not a task');
    const subtasks = await this.prisma.item.findMany({
      where: { kind: ItemKind.TASK, trashedAt: null, task: { parentId: itemId } },
      orderBy: [{ task: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: taskFields,
    });
    return { ...present(row), description: row.task.description, subtasks: subtasks.map(present) };
  }

  async assertTask(userId: string, itemId: string, access: Access) {
    const found = await this.access.assertItem(userId, itemId, access);
    if (!(await this.prisma.task.count({ where: { itemId } }))) throw new NotFoundException('That item is not a task');
    if (access !== 'read' && found.trashedAt) throw new BadRequestException('Restore this task from the trash before changing it');
    return found;
  }

  async activityOf(userId: string, itemId: string, page: number) {
    await this.assertTask(userId, itemId, 'read');
    return this.activity.ofItem(itemId, page);
  }

  async move(userId: string, itemId: string, input: MoveTaskDto) {
    const { spaceId } = await this.assertTask(userId, itemId, 'edit');
    const neighbourIds = [input.previousId, input.nextId].filter((id): id is string => Boolean(id));
    if (neighbourIds.includes(itemId)) throw new BadRequestException('Place the task next to a different task');
    await this.prisma.$transaction(async (transaction) => {
      const between = async () => {
        const neighbours = await transaction.task.findMany({ where: { itemId: { in: neighbourIds }, item: { spaceId, trashedAt: null } }, select: { itemId: true, position: true } });
        if (neighbours.length !== neighbourIds.length) throw new BadRequestException('Choose tasks from this space');
        const positionOf = (id?: string | null) => neighbours.find((neighbour) => neighbour.itemId === id)?.position ?? null;
        return positionBetween(positionOf(input.previousId), positionOf(input.nextId));
      };
      let position = await between();
      if (position === null) {
        await transaction.$executeRaw`
          UPDATE "tasks" SET "position" = "ranked"."rank" * ${positionGap}
          FROM (
            SELECT "tasks"."item_id", row_number() OVER (ORDER BY "tasks"."position", "items"."created_at", "items"."id") AS "rank"
            FROM "tasks" JOIN "items" ON "items"."id" = "tasks"."item_id"
            WHERE "items"."space_id" = ${spaceId}::uuid
          ) AS "ranked"
          WHERE "tasks"."item_id" = "ranked"."item_id"`;
        position = await between();
      }
      if (position === null) throw new BadRequestException('Those tasks are not next to each other');
      await transaction.task.update({ where: { itemId }, data: { position } });
      await transaction.item.update({ where: { id: itemId }, data: { updatedById: userId } });
    });
    this.changes.notify('tasks', { spaceId });
    return this.get(userId, itemId);
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
      if (input.status) await this.changeStatus(transaction, userId, itemId, statusOf(input.status));
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
    });
    this.changes.notify('tasks', { spaceId: item.spaceId });
    return this.get(userId, itemId);
  }

  async complete(userId: string, itemId: string) {
    const item = await this.editableTask(userId, itemId);
    if (item.task.completedAt) return this.get(userId, itemId);
    await this.prisma.$transaction(async (transaction) => {
      await this.changeStatus(transaction, userId, itemId, TaskStatus.DONE);
      await transaction.item.update({ where: { id: itemId }, data: { updatedById: userId } });
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
    });
    return this.get(userId, itemId);
  }

  async reopen(userId: string, itemId: string) {
    const item = await this.editableTask(userId, itemId);
    await this.prisma.$transaction(async (transaction) => {
      await this.changeStatus(transaction, userId, itemId, TaskStatus.OPEN);
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
    });
    return this.get(userId, itemId);
  }

  private async changeStatus(transaction: Prisma.TransactionClient, userId: string, itemId: string, status: TaskStatus) {
    const { spaceId, title, task } = await transaction.item.findUniqueOrThrow({
      where: { id: itemId },
      select: { spaceId: true, title: true, task: { select: { dueDate: true, dueTime: true, timeZone: true, repeatRule: true, status: true, completedAt: true } } },
    });
    const current = task!;
    if (status === current.status) return;
    const next = status === TaskStatus.DONE ? this.nextOccurrence(current) : null;
    await transaction.task.update({
      where: { itemId },
      data: next ? { dueDate: dateValue(next.date), repeatRule: next.rule, ...statusFields(TaskStatus.OPEN, null) } : statusFields(status, current.completedAt),
    });
    await this.activity.record(transaction, {
      spaceId,
      actorId: userId,
      itemId,
      ...(status === TaskStatus.DONE
        ? { verb: 'task.completed', data: { title, ...(next ? { nextDue: next.date } : {}) } }
        : current.status === TaskStatus.DONE
          ? { verb: 'task.reopened', data: { title } }
          : { verb: 'item.updated', data: { title, status: status.toLowerCase() } }),
    });
  }

  private nextOccurrence(task: { dueDate: Date | null; dueTime: string | null; timeZone: string; repeatRule: string | null }) {
    if (!task.repeatRule || !task.dueDate) return null;
    const rule = parseRule(task.repeatRule);
    if (rule.count === 1) return null;
    const current = dueInstant(task)!;
    const [next] = occurrences(
      rule,
      { date: dateText(task.dueDate), time: task.dueTime ?? '09:00', timeZone: task.timeZone },
      { from: new Date(current.getTime() + 1), to: new Date(current.getTime() + 20 * 366 * dayMs) },
      1,
    );
    if (!next) return null;
    return {
      date: localDate(task.timeZone, next),
      rule: formatRule({ ...rule, count: rule.count === null ? null : rule.count - 1 }),
    };
  }

  private async editableTask(userId: string, itemId: string) {
    await this.assertTask(userId, itemId, 'edit');
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
      dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : dateValue(input.dueDate),
      dueTime: input.dueTime,
      timeZone: input.timeZone,
      repeatRule,
      reminderMinutes: input.reminderMinutes,
      assigneeId: input.assigneeId,
      priority: input.priority,
      position: input.position,
      description: input.description === null ? Prisma.DbNull : (input.description as Prisma.InputJsonObject | undefined),
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
        { userId: task.assigneeId, kind: 'task_assigned', title: `You were given “${item.title}”`, link: `/tasks?task=${itemId}` },
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
    if (!recipient || !(await this.access.isMember(recipient, item.spaceId))) return;
    await this.inbox.notify(this.prisma, [
      {
        userId: recipient,
        kind: 'task_due',
        title: `“${item.title}” is due ${task.dueTime ? `at ${task.dueTime}` : 'today'}`,
        link: `/tasks?task=${payload.itemId}`,
      },
    ]);
  }
}
