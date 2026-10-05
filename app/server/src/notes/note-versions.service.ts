import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as Y from 'yjs';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { documentText } from './document-text';
import { NotesService } from './notes.service';

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
    await this.notes.note(userId, noteId, 'read');
    const versions = await this.prisma.noteVersion.findMany({
      where: { itemId: noteId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, createdAt: true, createdBy: { select: { displayName: true } } },
    });
    return versions.map((version) => ({ id: version.id, createdAt: version.createdAt, createdBy: version.createdBy?.displayName ?? null }));
  }

  async preview(userId: string, noteId: string, versionId: string) {
    await this.notes.note(userId, noteId, 'read');
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
