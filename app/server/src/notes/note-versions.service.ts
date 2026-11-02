import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import * as Y from 'yjs';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { documentText } from './document-text';
import { SetContentDto } from './dto/notes.dto';
import { NotesService } from './notes.service';
import { Block, blocksDocument, textDocument } from './templates';

const blockKinds = ['heading', 'paragraph', 'bullets', 'numbers', 'tasks'] as const;
const maxBlockText = 10_000;

function readBlocks(blocks: unknown[]): Block[] {
  return blocks.map((block) => {
    const [kind, content] = Array.isArray(block) && block.length === 2 ? (block as [unknown, unknown]) : [];
    const lines = Array.isArray(content) ? content : [content];
    if (!blockKinds.includes(kind as (typeof blockKinds)[number]) || !lines.every((line) => typeof line === 'string' && line.length <= maxBlockText)) {
      throw new BadRequestException('Each block is ["heading" | "paragraph", text] or ["bullets" | "numbers" | "tasks", [lines]]');
    }
    if ((kind === 'heading' || kind === 'paragraph') !== !Array.isArray(content)) {
      throw new BadRequestException('Headings and paragraphs take one text; lists take an array of lines');
    }
    return [kind, content] as Block;
  });
}

@Injectable()
export class NoteVersionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: NotesService,
    private readonly realtime: RealtimeService,
    private readonly maintenance: MaintenanceScheduler,
  ) {}

  onModuleInit() {
    this.maintenance.register((now) => this.thin(now));
  }

  async list(userId: string, noteId: string) {
    if (!(await this.notes.note(userId, noteId, 'read')).permissions.history) throw new ForbiddenException('Editing access is required to view page history');
    const versions = await this.prisma.noteVersion.findMany({
      where: { itemId: noteId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, createdAt: true, createdBy: { select: { displayName: true } } },
    });
    return versions.map((version) => ({ id: version.id, createdAt: version.createdAt, createdBy: version.createdBy?.displayName ?? null }));
  }

  async preview(userId: string, noteId: string, versionId: string) {
    if (!(await this.notes.note(userId, noteId, 'read')).permissions.history) throw new ForbiddenException('Editing access is required to view page history');
    const version = await this.version(noteId, versionId);
    const document = new Y.Doc();
    Y.applyUpdate(document, new Uint8Array(version.state));
    return { id: version.id, createdAt: version.createdAt, text: documentText(document) };
  }

  async restore(userId: string, noteId: string, versionId: string) {
    const found = await this.notes.note(userId, noteId, 'edit');
    const version = await this.version(noteId, versionId);
    await this.realtime.restore(noteId, new Uint8Array(version.state), { userId, role: found.role });
  }

  async content(userId: string, noteId: string) {
    await this.notes.note(userId, noteId, 'read', [ItemKind.NOTE]);
    const stored = await this.prisma.noteDocument.findUnique({ where: { itemId: noteId }, select: { state: true } });
    const document = new Y.Doc();
    if (stored) Y.applyUpdate(document, new Uint8Array(stored.state));
    return { text: documentText(document) };
  }

  async write(userId: string, noteId: string, input: SetContentDto) {
    const found = await this.notes.note(userId, noteId, 'edit', [ItemKind.NOTE]);
    const document = input.blocks === undefined ? textDocument(input.text ?? '') : blocksDocument(readBlocks(input.blocks));
    await this.realtime.restore(noteId, Y.encodeStateAsUpdate(document), { userId, role: found.role });
    return { text: documentText(document) };
  }

  thin(now: Date) {
    return this.prisma.$executeRaw`
      DELETE FROM "note_versions" AS "version"
      USING (
        SELECT "id", row_number() OVER (
          PARTITION BY "item_id",
            date_trunc(CASE WHEN "created_at" < ${now}::timestamp - interval '90 days' THEN 'week' ELSE 'day' END, "created_at")
          ORDER BY "created_at" DESC
        ) AS "rank"
        FROM "note_versions"
        WHERE "created_at" < ${now}::timestamp - interval '7 days'
      ) AS "ranked"
      WHERE "version"."id" = "ranked"."id" AND "ranked"."rank" > 1`;
  }

  private async version(noteId: string, versionId: string) {
    const version = await this.prisma.noteVersion.findFirst({
      where: { id: versionId, itemId: noteId },
      select: { id: true, createdAt: true, state: true },
    });
    if (!version) throw new NotFoundException('That version is not available');
    return version;
  }
}
