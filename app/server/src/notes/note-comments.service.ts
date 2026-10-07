import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/notes.dto';
import { NotesService } from './notes.service';

const maxComments = 500;

const commentFields = {
  id: true,
  parentId: true,
  body: true,
  resolvedAt: true,
  editedAt: true,
  createdAt: true,
  author: { select: { id: true, displayName: true } },
} satisfies Prisma.NoteCommentSelect;

@Injectable()
export class NoteCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: NotesService,
    private readonly inbox: InboxService,
  ) {}

  async list(userId: string, noteId: string) {
    await this.notes.note(userId, noteId, 'read');
    return this.prisma.noteComment.findMany({ where: { itemId: noteId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: commentFields });
  }

  async create(userId: string, noteId: string, input: CreateCommentDto) {
    const found = await this.notes.note(userId, noteId, 'read');
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before commenting');
    if ((await this.prisma.noteComment.count({ where: { itemId: noteId } })) >= maxComments) {
      throw new ConflictException(`A page can hold ${maxComments} comments. Delete some resolved ones first.`);
    }
    if (input.parentId && !(await this.prisma.noteComment.count({ where: { id: input.parentId, itemId: noteId, parentId: null } }))) {
      throw new BadRequestException('Reply to a comment on this page');
    }
    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.noteComment.create({
        data: { itemId: noteId, parentId: input.parentId ?? null, authorId: userId, body: input.body },
        select: commentFields,
      });
      const recipients = await this.recipients(transaction, noteId, found.spaceId, userId);
      await this.inbox.notify(
        transaction,
        recipients.map((recipient) => ({
          userId: recipient,
          kind: 'comment',
          title: `${created.author?.displayName} commented on ${found.title || 'Untitled'}`,
          body: created.body.slice(0, 200),
          link: `/notes/${noteId}`,
        })),
      );
      return created;
    });
  }

  async update(userId: string, commentId: string, body: string) {
    const comment = await this.comment(userId, commentId);
    if (comment.authorId !== userId) throw new ForbiddenException('Only the person who wrote a comment can change it');
    return this.prisma.noteComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() }, select: commentFields });
  }

  async remove(userId: string, commentId: string) {
    const comment = await this.comment(userId, commentId);
    if (comment.authorId !== userId && comment.role !== SpaceRole.OWNER) {
      throw new ForbiddenException('Only the person who wrote a comment or an owner of the space can delete it');
    }
    await this.prisma.noteComment.deleteMany({ where: { id: commentId } });
  }

  async resolve(userId: string, commentId: string, resolved: boolean) {
    const comment = await this.comment(userId, commentId);
    await this.notes.note(userId, comment.itemId, 'edit');
    if (comment.parentId) throw new BadRequestException('Resolve the comment that started the thread');
    return this.prisma.noteComment.update({
      where: { id: commentId },
      data: resolved ? { resolvedAt: new Date(), resolvedById: userId } : { resolvedAt: null, resolvedById: null },
      select: commentFields,
    });
  }

  private async comment(userId: string, commentId: string) {
    const comment = await this.prisma.noteComment.findUnique({ where: { id: commentId }, select: { itemId: true, parentId: true, authorId: true } });
    if (!comment) throw new NotFoundException('Comment not found');
    const { role } = await this.notes.note(userId, comment.itemId, 'read');
    return { ...comment, role };
  }

  private async recipients(transaction: Prisma.TransactionClient, noteId: string, spaceId: string, writerId: string) {
    const item = await transaction.item.findUniqueOrThrow({ where: { id: noteId }, select: { createdById: true } });
    const commenters = await transaction.noteComment.findMany({ where: { itemId: noteId }, distinct: ['authorId'], select: { authorId: true } });
    const wanted = [item.createdById, ...commenters.map((commenter) => commenter.authorId)].filter((id): id is string => Boolean(id) && id !== writerId);
    const members = await transaction.spaceMember.findMany({ where: { spaceId, userId: { in: wanted } }, select: { userId: true } });
    return members.map((member) => member.userId);
  }
}
