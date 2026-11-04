import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
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
import { CreateListDto, CreateTaskDto, ListTasksDto, MoveTaskDto, ShareTaskDto, TaskColumnDto, TaskFieldsDto, UpdateTaskDto } from './dto/tasks.dto';
import { uniqueViolation } from '../prisma/errors';
import { builtInTaskTypes, taskType } from './task-type';
import { WatchersService } from '../watchers/watchers.service';
import { positionBetween, positionGap } from './task-position';
import { statusFields, statusOf } from './task-status';

const pageSize = 100;
const reminderKind = 'task.reminder';
const reminderLeads = [
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
] as const;
const taskLink = (itemId: string) => `/tasks?task=${itemId}`;
const statusNames: Record<TaskStatus, string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', DONE: 'Done' };
const fieldNames = {
  title: 'title',
  status: 'status',
  columnId: 'column',
  assigneeId: 'assignee',
  dueDate: 'due date',
  dueTime: 'due time',
  priority: 'priority',
  type: 'type',
  listId: 'list',
  parentId: 'parent task',
  description: 'description',
  repeatRule: 'repeat',
} as const;
const maxColumns = 10;
const columnFields = { id: true, spaceId: true, name: true, position: true } satisfies Prisma.TaskColumnSelect;

function columnTaken(error: unknown): never {
  if (uniqueViolation(error)) throw new ConflictException('This space already has a column with that name');
  throw error;
}

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
      priority: true,
      position: true,
      status: true,
      type: true,
      columnId: true,
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
    priority: task.priority,
    position: task.position,
    status: task.status.toLowerCase(),
    type: task.type,
    columnId: task.columnId,
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
    private readonly watchers: WatchersService,
  ) {}

  onModuleInit() {
    this.jobs.handle(reminderKind, (payload) => this.remind(payload as { itemId: string; due: string; lead?: 'day' | 'hour' }));
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

  async columns(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.columnsIn({ spaceId });
  }

  myColumns(userId: string) {
    return this.columnsIn({ space: this.access.spacesOf(userId) });
  }

  async createColumn(userId: string, spaceId: string, input: TaskColumnDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    if ((await this.prisma.taskColumn.count({ where: { spaceId } })) >= maxColumns) throw new BadRequestException(`A space can have at most ${maxColumns} extra columns`);
    const column = await this.prisma.taskColumn.create({ data: { spaceId, name: input.name, position: Date.now() }, select: columnFields }).catch(columnTaken);
    this.changes.notify('tasks', { spaceId });
    return column;
  }

  async renameColumn(userId: string, columnId: string, input: TaskColumnDto) {
    const { spaceId } = await this.editableColumn(userId, columnId);
    const column = await this.prisma.taskColumn.update({ where: { id: columnId }, data: { name: input.name }, select: columnFields }).catch(columnTaken);
    this.changes.notify('tasks', { spaceId });
    return column;
  }

  async removeColumn(userId: string, columnId: string) {
    const { spaceId } = await this.editableColumn(userId, columnId);
    await this.prisma.taskColumn.delete({ where: { id: columnId } });
    this.changes.notify('tasks', { spaceId });
  }

  private async editableColumn(userId: string, columnId: string) {
    const column = await this.prisma.taskColumn.findUnique({ where: { id: columnId }, select: { spaceId: true } });
    if (!column) throw new NotFoundException('That column is already gone');
    await this.access.assertSpace(userId, column.spaceId, 'edit');
    return column;
  }

  private columnsIn(where: Prisma.TaskColumnWhereInput) {
    return this.prisma.taskColumn.findMany({ where, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: columnFields });
  }

  async lists(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.listsIn({ spaceId });
  }

  myLists(userId: string, spaceId?: string) {
    return this.listsIn({ ...this.access.spaceItemsOf(userId), ...(spaceId ? { spaceId } : {}) });
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
              ...statusFields(fields.columnId ? TaskStatus.IN_PROGRESS : input.status ? statusOf(input.status) : TaskStatus.OPEN, null),
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
      await this.watchers.watch(transaction, item.id, [userId, input.assigneeId === undefined ? userId : input.assigneeId]);
      return item.id;
    });
    return this.get(userId, id);
  }

  async list(userId: string, spaceId: string, query: ListTasksDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.pageOf({ spaceId }, {}, query, userId);
  }

  mine(userId: string, query: ListTasksDto) {
    return this.pageOf({ ...this.access.spaceItemsOf(userId), ...(query.spaceId ? { spaceId: query.spaceId } : {}) }, query.listId || query.spaceId || query.assignee ? {} : { OR: [{ assigneeId: userId }, { assigneeId: null }] }, query, userId);
  }

  async filters(userId: string, spaceId?: string) {
    const scope: Prisma.ItemWhereInput = { ...this.access.spaceItemsOf(userId), ...(spaceId ? { spaceId } : {}), kind: ItemKind.TASK, trashedAt: null };
    const [types, assignees] = await Promise.all([
      this.prisma.task.findMany({ where: { item: scope, type: { notIn: builtInTaskTypes } }, distinct: ['type'], orderBy: { type: 'asc' }, select: { type: true } }),
      this.prisma.user.findMany({ where: { assignedTasks: { some: { item: scope } } }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true } }),
    ]);
    return { types: types.map((row) => row.type), assignees };
  }

  private async pageOf(scope: Prisma.ItemWhereInput, tasks: Prisma.TaskWhereInput, query: ListTasksDto, userId: string) {
    const where: Prisma.ItemWhereInput = {
      ...scope,
      kind: ItemKind.TASK,
      trashedAt: null,
      task: {
        ...tasks,
        ...(query.listId ? { listId: query.listId === 'none' ? null : query.listId } : {}),
        ...(query.assignee && query.assignee !== 'any' ? { assigneeId: query.assignee === 'me' ? userId : query.assignee === 'none' ? null : query.assignee } : {}),
        ...(query.type ? { type: { equals: taskType(query.type), mode: 'insensitive' as const } } : {}),
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
        ...this.access.spaceItemsOf(userId), ...(spaceId ? { spaceId } : {}),
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
      where: { ...this.access.spaceItemsOf(userId), id: { in: itemIds }, kind: ItemKind.TASK, trashedAt: null },
      orderBy: [{ task: { completedAt: { sort: 'asc', nulls: 'first' } } }, { task: { dueDate: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
      select: taskFields,
    });
    return rows.map(present);
  }

  async get(userId: string, itemId: string) {
    await this.access.assertSpaceItem(userId, itemId, 'read');
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
    const found = await this.access.assertSpaceItem(userId, itemId, access);
    if (!(await this.prisma.task.count({ where: { itemId } }))) throw new NotFoundException('That item is not a task');
    if (access !== 'read' && found.trashedAt) throw new BadRequestException('Restore this task from the trash before changing it');
    return found;
  }

  async share(userId: string, itemId: string, { userIds, message }: ShareTaskDto) {
    const { spaceId } = await this.assertTask(userId, itemId, 'read');
    const recipients = [...new Set(userIds)].filter((recipient) => recipient !== userId);
    const members = await this.prisma.spaceMember.count({ where: { spaceId, userId: { in: recipients }, user: { isActive: true } } });
    if (recipients.length === 0 || members !== recipients.length) throw new BadRequestException('Choose people from this space.');
    await this.prisma.$transaction(async (transaction) => {
      const { title } = await transaction.item.findUniqueOrThrow({ where: { id: itemId }, select: { title: true } });
      const sharer = await this.watchers.actorName(transaction, userId);
      await this.watchers.watch(transaction, itemId, recipients);
      await this.inbox.notify(
        transaction,
        recipients.map((recipient) => ({ userId: recipient, kind: 'watching' as const, title: `${sharer} shared “${title}” with you`, body: message || undefined, link: `/tasks?task=${itemId}` })),
      );
    });
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
        data: { title: input.title, updatedById: userId, task: { update: { ...fields, ...(input.columnId === undefined && input.status ? { columnId: null } : {}) } } },
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
      if (input.columnId) await this.changeStatus(transaction, userId, itemId, TaskStatus.IN_PROGRESS);
      else if (input.status) await this.changeStatus(transaction, userId, itemId, statusOf(input.status));
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
      await this.reportChange(transaction, itemId, userId, input, item.task.assigneeId);
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
      await this.watchers.watch(transaction, itemId, [userId]);
      await this.watchers.notify(transaction, itemId, userId, { title: `${await this.watchers.actorName(transaction, userId)} finished “${item.title}”`, link: taskLink(itemId) });
    });
    return this.get(userId, itemId);
  }

  async reopen(userId: string, itemId: string) {
    const item = await this.editableTask(userId, itemId);
    await this.prisma.$transaction(async (transaction) => {
      await this.changeStatus(transaction, userId, itemId, TaskStatus.OPEN);
      await this.afterChange(transaction, itemId, userId, item.task.assigneeId);
      await this.watchers.watch(transaction, itemId, [userId]);
      await this.watchers.notify(transaction, itemId, userId, { title: `${await this.watchers.actorName(transaction, userId)} reopened “${item.title}”`, link: taskLink(itemId) });
    });
    return this.get(userId, itemId);
  }

  private async reportChange(transaction: Prisma.TransactionClient, itemId: string, userId: string, input: UpdateTaskDto, previousAssignee: string | null) {
    const changed = (Object.keys(fieldNames) as (keyof typeof fieldNames)[]).filter((field) => input[field] !== undefined);
    const { title, task } = await transaction.item.findUniqueOrThrow({ where: { id: itemId }, select: { title: true, task: { select: { status: true, assigneeId: true, column: { select: { name: true } } } } } });
    await this.watchers.watch(transaction, itemId, [userId, task!.assigneeId]);
    if (changed.length === 0) return;
    const actor = await this.watchers.actorName(transaction, userId);
    const moved = changed.every((field) => field === 'status' || field === 'columnId');
    await this.watchers.notify(
      transaction,
      itemId,
      userId,
      {
        title: moved
          ? `${actor} moved “${title}” to ${task!.column?.name ?? statusNames[task!.status]}`
          : `${actor} changed the ${changed.map((field) => fieldNames[field]).join(', ')} of “${title}”`,
        link: taskLink(itemId),
      },
      [task!.assigneeId !== previousAssignee ? task!.assigneeId : null],
    );
  }

  private async changeStatus(transaction: Prisma.TransactionClient, userId: string, itemId: string, status: TaskStatus) {
    const { spaceId, title, task } = await transaction.item.findUniqueOrThrow({
      where: { id: itemId },
      select: { spaceId: true, title: true, task: { select: { dueDate: true, dueTime: true, timeZone: true, repeatRule: true, status: true, completedAt: true } } },
    });
    if (!spaceId) throw new NotFoundException('That item is not a task');
    const current = task!;
    if (status === current.status) return;
    const next = status === TaskStatus.DONE ? this.nextOccurrence(current) : null;
    await transaction.task.update({
      where: { itemId },
      data: {
        ...(next ? { dueDate: dateValue(next.date), repeatRule: next.rule, ...statusFields(TaskStatus.OPEN, null) } : statusFields(status, current.completedAt)),
        ...(status === TaskStatus.IN_PROGRESS ? {} : { columnId: null }),
      },
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
    const { spaceId } = await this.assertTask(userId, itemId, 'edit');
    const item = await this.prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      select: {
        title: true,
        task: { select: { dueDate: true, dueTime: true, timeZone: true, repeatRule: true, assigneeId: true, completedAt: true } },
      },
    });
    if (!item.task) throw new NotFoundException('That item is not a task');
    return { ...item, spaceId, task: item.task };
  }

  private async knownType(spaceId: string, type: string) {
    if (builtInTaskTypes.includes(type)) return type;
    const existing = await this.prisma.task.findFirst({ where: { type: { equals: type, mode: 'insensitive' }, item: { spaceId } }, select: { type: true } });
    return existing?.type ?? type;
  }

  private async checkedFields(spaceId: string, itemId: string | null, input: TaskFieldsDto) {
    if (input.listId) {
      const list = await this.prisma.item.count({ where: { id: input.listId, spaceId, kind: ItemKind.LIST, trashedAt: null } });
      if (!list) throw new BadRequestException('Choose an epic from this space');
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
    if (input.columnId && !(await this.prisma.taskColumn.count({ where: { id: input.columnId, spaceId } }))) {
      throw new BadRequestException('Choose a column from this space');
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
      assigneeId: input.assigneeId,
      columnId: input.columnId,
      priority: input.priority,
      position: input.position,
      type: input.type === undefined ? undefined : await this.knownType(spaceId, taskType(input.type)),
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
        task: { select: { dueDate: true, dueTime: true, timeZone: true, assigneeId: true, completedAt: true } },
      },
    });
    const task = item.task!;
    await client.scheduledJob.deleteMany({
      where: { kind: reminderKind, doneAt: null, failedAt: null, payload: { path: ['itemId'], equals: itemId } },
    });
    const due = dueInstant(task);
    if (due && !task.completedAt) {
      for (const [lead, leadMs] of reminderLeads) {
        const remindAt = new Date(due.getTime() - leadMs);
        if (remindAt > new Date()) await this.jobs.schedule(reminderKind, remindAt, { itemId, due: due.toISOString(), lead }, client);
      }
    }
    if (task.assigneeId && task.assigneeId !== previousAssignee && task.assigneeId !== actorId) {
      await this.inbox.notify(client, [
        { userId: task.assigneeId, kind: 'task_assigned', title: `You were given “${item.title}”`, link: `/tasks?task=${itemId}` },
      ]);
    }
  }

  private async remind(payload: { itemId: string; due: string; lead?: 'day' | 'hour' }) {
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
    if (!recipient || !item.spaceId || !(await this.access.isMember(recipient, item.spaceId))) return;
    await this.inbox.notify(this.prisma, [
      {
        userId: recipient,
        kind: 'task_due',
        title: `“${item.title}” is due ${payload.lead === 'day' ? 'tomorrow' : 'today'}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
        link: `/tasks?task=${payload.itemId}`,
      },
    ]);
  }
}
