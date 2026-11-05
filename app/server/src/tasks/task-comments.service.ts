import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import { audienceOf } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskCommentDto } from './dto/tasks.dto';
import { TasksService } from './tasks.service';
import { WatchersService } from '../watchers/watchers.service';

const maxComments = 500;
const mentionPattern = /(?:^|[^\w@])@([a-z0-9][a-z0-9_-]*)/gi;

const commentFields = {
  id: true,
  body: true,
  document: true,
  editedAt: true,
  createdAt: true,
  parentId: true,
  author: { select: { id: true, displayName: true } },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.NoteCommentSelect;

export const commentReactions = ['👍', '❤️', '🎉', '😄', '👀', '🚀'];

function present({ reactions, ...comment }: Prisma.NoteCommentGetPayload<{ select: typeof commentFields }>, userId: string) {
  const emojis = [...new Set(reactions.map((reaction) => reaction.emoji))];
  return {
    ...comment,
    reactions: emojis.map((emoji) => {
      const given = reactions.filter((reaction) => reaction.emoji === emoji);
      return { emoji, count: given.length, mine: given.some((reaction) => reaction.userId === userId) };
    }),
  };
}

const handlesIn = (text: string) => new Set([...text.matchAll(mentionPattern)].map((match) => match[1]!.toLowerCase()));

@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly changes: ChangesService,
    private readonly watchers: WatchersService,
    private readonly inbox: InboxService,
  ) {}

  async list(userId: string, taskId: string) {
    await this.tasks.assertTask(userId, taskId, 'read');
    const comments = await this.prisma.noteComment.findMany({ where: { itemId: taskId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: commentFields });
    return comments.map((comment) => present(comment, userId));
  }

  async create(userId: string, taskId: string, { body, document, parentId }: TaskCommentDto) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    if ((await this.prisma.noteComment.count({ where: { itemId: taskId } })) >= maxComments) {
      throw new ConflictException(`A task can hold ${maxComments} comments. Delete some old ones first.`);
    }
    if (parentId && !(await this.prisma.noteComment.count({ where: { id: parentId, itemId: taskId, parentId: null } }))) {
      throw new BadRequestException('Reply to a comment on this task.');
    }
    const created = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.noteComment.create({ data: { itemId: taskId, authorId: userId, parentId, body, document: document as Prisma.InputJsonObject | undefined }, select: commentFields });
      const { title } = await transaction.item.findUniqueOrThrow({ where: { id: taskId }, select: { title: true } });
      const mentioned = await this.mention(transaction, { spaceId: task.spaceId, taskId, title, authorId: userId, body });
      await this.watchers.watch(transaction, taskId, [userId]);
      await this.watchers.notify(transaction, taskId, userId, { title: `${created.author?.displayName ?? 'Someone'} commented on “${title}”`, body: body.slice(0, 200), link: `/tasks?task=${taskId}` }, mentioned);
      return created;
    });
    this.changes.notify('task-details', { ...audienceOf(task.home), itemId: taskId });
    return present(created, userId);
  }

  async update(userId: string, taskId: string, commentId: string, { body, document }: TaskCommentDto) {
    const { comment, task } = await this.comment(userId, taskId, commentId);
    if (comment.authorId !== userId) throw new ForbiddenException('Only the person who wrote a comment can change it');
    const updated = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.noteComment.update({ where: { id: commentId }, data: { body, document: document ? (document as Prisma.InputJsonObject) : Prisma.DbNull, editedAt: new Date() }, select: commentFields });
      const { title } = await transaction.item.findUniqueOrThrow({ where: { id: taskId }, select: { title: true } });
      await this.mention(transaction, { spaceId: task.spaceId, taskId, title, authorId: userId, body, before: comment.body });
      return updated;
    });
    this.changes.notify('task-details', { ...audienceOf(task.home), itemId: taskId });
    return present(updated, userId);
  }

  async remove(userId: string, taskId: string, commentId: string) {
    const { comment, task } = await this.comment(userId, taskId, commentId);
    if (comment.authorId !== userId && task.role !== SpaceRole.OWNER) {
      throw new ForbiddenException('Only the person who wrote a comment or an owner of the space can delete it');
    }
    await this.prisma.noteComment.deleteMany({ where: { id: commentId } });
    this.changes.notify('task-details', { ...audienceOf(task.home), itemId: taskId });
  }

  async react(userId: string, taskId: string, commentId: string, emoji: string, reacting: boolean) {
    if (!commentReactions.includes(emoji)) throw new BadRequestException('Choose one of the offered reactions.');
    const task = await this.tasks.assertTask(userId, taskId, 'read');
    if (!(await this.prisma.noteComment.count({ where: { id: commentId, itemId: taskId } }))) throw new NotFoundException('Comment not found');
    if (reacting) {
      await this.prisma.commentReaction.createMany({ data: [{ commentId, userId, emoji }], skipDuplicates: true });
      await this.watchers.watch(this.prisma, taskId, [userId]);
    } else await this.prisma.commentReaction.deleteMany({ where: { commentId, userId, emoji } });
    this.changes.notify('task-details', { ...audienceOf(task.home), itemId: taskId });
    return present(await this.prisma.noteComment.findUniqueOrThrow({ where: { id: commentId }, select: commentFields }), userId);
  }

  private async mention(
    transaction: Prisma.TransactionClient,
    { spaceId, taskId, title, authorId, body, before = '' }: { spaceId: string | null; taskId: string; title: string; authorId: string; body: string; before?: string },
  ) {
    const already = handlesIn(before);
    const handles = [...handlesIn(body)].filter((handle) => !already.has(handle));
    if (handles.length === 0 || !spaceId) return [];
    const mentioned = (
      await transaction.spaceMember.findMany({ where: { spaceId, userId: { not: authorId }, user: { handle: { in: handles }, isActive: true } }, select: { userId: true } })
    ).map((member) => member.userId);
    if (mentioned.length === 0) return [];
    const author = await this.watchers.actorName(transaction, authorId);
    await this.watchers.watch(transaction, taskId, mentioned);
    await this.inbox.notify(
      transaction,
      mentioned.map((userId) => ({ userId, kind: 'comment' as const, title: `${author} mentioned you on “${title}”`, body: body.slice(0, 200), link: `/tasks?task=${taskId}` })),
    );
    return mentioned;
  }

  private async comment(userId: string, taskId: string, commentId: string) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    const comment = await this.prisma.noteComment.findFirst({ where: { id: commentId, itemId: taskId }, select: { authorId: true, body: true } });
    if (!comment) throw new NotFoundException('Comment not found');
    return { comment, task };
  }
}
