import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, LinkKind, Prisma } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const attachmentFields = {
  createdAt: true,
  target: { select: { id: true, file: { select: { originalName: true, mimeType: true, sizeBytes: true, width: true, height: true } } } },
} satisfies Prisma.ItemLinkSelect;

function present(link: Prisma.ItemLinkGetPayload<{ select: typeof attachmentFields }>) {
  const file = link.target.file!;
  return { id: link.target.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, width: file.width, height: file.height, attachedAt: link.createdAt };
}

@Injectable()
export class TaskAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly files: FilesService,
    private readonly changes: ChangesService,
  ) {}

  async list(userId: string, taskId: string) {
    await this.tasks.assertTask(userId, taskId, 'read');
    const links = await this.prisma.itemLink.findMany({
      where: { sourceItemId: taskId, kind: LinkKind.ATTACHMENT, target: { kind: ItemKind.FILE, trashedAt: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: attachmentFields,
    });
    return links.map(present);
  }

  async attach(userId: string, taskId: string, fileId: string) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    if (!(await this.prisma.item.count({ where: { id: fileId, spaceId: task.spaceId, kind: ItemKind.FILE, trashedAt: null } }))) {
      throw new BadRequestException('Choose a file from this space');
    }
    const link = await this.prisma.itemLink.upsert({
      where: { sourceItemId_targetItemId_kind: { sourceItemId: taskId, targetItemId: fileId, kind: LinkKind.ATTACHMENT } },
      create: { sourceItemId: taskId, targetItemId: fileId, kind: LinkKind.ATTACHMENT, createdById: userId },
      update: {},
      select: attachmentFields,
    });
    this.changes.notify('task-details', { spaceId: task.spaceId, itemId: taskId });
    return present(link);
  }

  async upload(userId: string, taskId: string, name: string, data: Buffer) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    const file = await this.files.upload(userId, task.spaceId, name, data);
    return this.attach(userId, taskId, file.id);
  }

  async detach(userId: string, taskId: string, fileId: string) {
    const task = await this.tasks.assertTask(userId, taskId, 'edit');
    const { count } = await this.prisma.itemLink.deleteMany({ where: { sourceItemId: taskId, targetItemId: fileId, kind: LinkKind.ATTACHMENT } });
    if (count === 0) throw new NotFoundException('That file is not attached to this task');
    this.changes.notify('task-details', { spaceId: task.spaceId, itemId: taskId });
  }
}
