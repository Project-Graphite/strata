import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const maxComments = 500;

const commentFields = {
  id: true,
  body: true,
  editedAt: true,
  createdAt: true,
  author: { select: { id: true, displayName: true } },
} satisfies Prisma.NoteCommentSelect;

@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly changes: ChangesService,
  ) {}

  async list(userId: string, taskId: string) {
    await this.tasks.assertTask(userId, taskId, 'read');
    return this.prisma.noteComment.findMany({ where: { itemId: taskId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: commentFields });
  }

  async create(userId: string, taskId: string, body: string) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    if ((await this.prisma.noteComment.count({ where: { itemId: taskId } })) >= maxComments) {
      throw new ConflictException(`A task can hold ${maxComments} comments. Delete some old ones first.`);
    }
    const created = await this.prisma.noteComment.create({ data: { itemId: taskId, authorId: userId, body }, select: commentFields });
    this.changes.notify('task-details', { spaceId: task.spaceId, itemId: taskId });
    return created;
  }

  async update(userId: string, taskId: string, commentId: string, body: string) {
    const { comment, task } = await this.comment(userId, taskId, commentId);
    if (comment.authorId !== userId) throw new ForbiddenException('Only the person who wrote a comment can change it');
    const updated = await this.prisma.noteComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() }, select: commentFields });
    this.changes.notify('task-details', { spaceId: task.spaceId, itemId: taskId });
    return updated;
  }

  async remove(userId: string, taskId: string, commentId: string) {
    const { comment, task } = await this.comment(userId, taskId, commentId);
    if (comment.authorId !== userId && task.role !== SpaceRole.OWNER) {
      throw new ForbiddenException('Only the person who wrote a comment or an owner of the space can delete it');
    }
    await this.prisma.noteComment.deleteMany({ where: { id: commentId } });
    this.changes.notify('task-details', { spaceId: task.spaceId, itemId: taskId });
  }

  private async comment(userId: string, taskId: string, commentId: string) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    const comment = await this.prisma.noteComment.findFirst({ where: { id: commentId, itemId: taskId }, select: { authorId: true } });
    if (!comment) throw new NotFoundException('Comment not found');
    return { comment, task };
  }
}
