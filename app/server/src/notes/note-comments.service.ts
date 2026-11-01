import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceRole } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/notes.dto';
import { NotesService } from './notes.service';

const maxComments = 500;

export function mentions(body: string, name: string) {
  const text = body.toLocaleLowerCase();
  const tag = `@${name.trim().toLocaleLowerCase()}`;
  if (tag.length < 2) return false;
  for (let at = text.indexOf(tag); at >= 0; at = text.indexOf(tag, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(text[at + tag.length] ?? '')) return true;
  }
  return false;
}

const commentFields = {
  id: true,
  parentId: true,
  body: true,
  blockId: true,
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
    private readonly changes: ChangesService,
  ) {}

  async list(userId: string, noteId: string) {
    await this.notes.note(userId, noteId, 'read');
    return this.prisma.noteComment.findMany({ where: { itemId: noteId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: commentFields });
  }

  async create(userId: string, noteId: string, input: CreateCommentDto) {
    const found = await this.notes.note(userId, noteId, 'comment');
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before commenting');
    if ((await this.prisma.noteComment.count({ where: { itemId: noteId } })) >= maxComments) {
      throw new ConflictException(`A page can hold ${maxComments} comments. Delete some resolved ones first.`);
    }
    if (input.parentId && !(await this.prisma.noteComment.count({ where: { id: input.parentId, itemId: noteId, parentId: null } }))) {
      throw new BadRequestException('Reply to a comment on this page');
    }
    const created = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.noteComment.create({
        data: { itemId: noteId, parentId: input.parentId ?? null, authorId: userId, body: input.body, blockId: input.parentId ? null : (input.blockId ?? null) },
        select: commentFields,
      });
      const mentioned = await this.mentioned(transaction, noteId, found.spaceId, userId, created.body);
      const recipients = (await this.recipients(transaction, noteId, found.spaceId, userId)).filter((recipient) => !mentioned.includes(recipient));
      await this.inbox.notify(transaction, [
        ...mentioned.map((recipient) => ({ recipient, verb: 'mentioned you on' })),
        ...recipients.map((recipient) => ({ recipient, verb: 'commented on' })),
      ].map(({ recipient, verb }) => ({
        userId: recipient,
        kind: 'comment' as const,
        title: `${created.author?.displayName} ${verb} ${found.title || 'Untitled'}`,
        body: created.body.slice(0, 200),
        link: `/pages/${noteId}`,
      })));
      return created;
    });
    this.changes.notify('page-comments', { spaceId: found.spaceId, itemId: noteId });
    return created;
  }

  async update(userId: string, commentId: string, body: string) {
    const comment = await this.comment(userId, commentId);
    if (comment.authorId !== userId) throw new ForbiddenException('Only the person who wrote a comment can change it');
    const updated = await this.prisma.noteComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() }, select: commentFields });
    this.changes.notify('page-comments', { spaceId: comment.spaceId, itemId: comment.itemId });
    return updated;
  }

  async remove(userId: string, commentId: string) {
    const comment = await this.comment(userId, commentId);
    if (comment.authorId !== userId && comment.role !== SpaceRole.OWNER) {
      throw new ForbiddenException('Only the person who wrote a comment or an owner of the space can delete it');
    }
    await this.prisma.noteComment.deleteMany({ where: { id: commentId } });
    this.changes.notify('page-comments', { spaceId: comment.spaceId, itemId: comment.itemId });
  }

  async resolve(userId: string, commentId: string, resolved: boolean) {
    const comment = await this.comment(userId, commentId);
    await this.notes.note(userId, comment.itemId, 'edit');
    if (comment.parentId) throw new BadRequestException('Resolve the comment that started the thread');
    const updated = await this.prisma.noteComment.update({
      where: { id: commentId },
      data: resolved ? { resolvedAt: new Date(), resolvedById: userId } : { resolvedAt: null, resolvedById: null },
      select: commentFields,
    });
    this.changes.notify('page-comments', { spaceId: comment.spaceId, itemId: comment.itemId });
    return updated;
  }

  private async comment(userId: string, commentId: string) {
    const comment = await this.prisma.noteComment.findUnique({ where: { id: commentId }, select: { itemId: true, parentId: true, authorId: true } });
    if (!comment) throw new NotFoundException('Comment not found');
    const { role, spaceId } = await this.notes.note(userId, comment.itemId, 'comment');
    return { ...comment, role, spaceId };
  }

  private async mentioned(transaction: Prisma.TransactionClient, noteId: string, spaceId: string, writerId: string, body: string) {
    if (!body.includes('@')) return [];
    const people = [
      ...(await transaction.spaceMember.findMany({ where: { spaceId }, select: { userId: true, user: { select: { displayName: true } } } })),
      ...(await transaction.pageGrant.findMany({ where: { itemId: noteId, item: { trashedAt: null, archivedAt: null } }, select: { userId: true, user: { select: { displayName: true } } } })),
    ];
    return [...new Set(people.filter((person) => person.userId !== writerId && mentions(body, person.user.displayName)).map((person) => person.userId))];
  }

  private async recipients(transaction: Prisma.TransactionClient, noteId: string, spaceId: string, writerId: string) {
    const item = await transaction.item.findUniqueOrThrow({ where: { id: noteId }, select: { createdById: true } });
    const commenters = await transaction.noteComment.findMany({ where: { itemId: noteId }, distinct: ['authorId'], select: { authorId: true } });
    const wanted = [item.createdById, ...commenters.map((commenter) => commenter.authorId)].filter((id): id is string => Boolean(id) && id !== writerId);
    const members = await transaction.spaceMember.findMany({ where: { spaceId, userId: { in: wanted } }, select: { userId: true } });
    const guests = await transaction.pageGrant.findMany({ where: { itemId: noteId, userId: { in: wanted }, item: { trashedAt: null, archivedAt: null } }, select: { userId: true } });
    return [...new Set([...members, ...guests].map((member) => member.userId))];
  }
}
