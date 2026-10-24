import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { propertyRules, propertyValue, valueMap, type Property } from './database';
import { SaveDatabaseDto, SetPropertiesDto } from './dto/notes.dto';
import { noteFields, NotesService, present } from './notes.service';
import { PageAccessService } from './page-access.service';

const emptyValue = (value: unknown) => value === '' || (Array.isArray(value) && value.length === 0);

@Injectable()
export class NoteDatabasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: NotesService,
    private readonly changes: ChangesService,
    private readonly pages: PageAccessService,
  ) {}

  async get(userId: string, noteId: string) {
    await this.notes.note(userId, noteId, 'read', [ItemKind.NOTE]);
    const schema = await this.prisma.databaseSchema.findUnique({ where: { itemId: noteId } });
    if (!schema) throw new NotFoundException('This page is not a database');
    const rows = await this.prisma.item.findMany({
      where: { kind: ItemKind.NOTE, trashedAt: null, archivedAt: null, note: { parentId: noteId }, AND: this.pages.pagesOf(userId) },
      orderBy: [{ note: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { ...noteFields, properties: { select: { propertyId: true, value: true } } },
    });
    return {
      revision: schema.updatedAt.toISOString(),
      properties: schema.properties as unknown as Property[],
      view: schema.view,
      groupBy: schema.groupBy,
      dateBy: schema.dateBy,
      rows: rows.map((row) => ({ ...present(row), values: valueMap(row.properties) })),
    };
  }

  async save(userId: string, noteId: string, input: SaveDatabaseDto) {
    const found = await this.notes.note(userId, noteId, 'edit', [ItemKind.NOTE]);
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before changing it');
    if (found.quick) throw new BadRequestException('A note cannot be a database');
    if (!found.permissions.organize) throw new ForbiddenException('Space editing access is required to change the database schema');
    const properties: Property[] = input.properties.map(({ id, name, type, options }) =>
      type === 'select' || type === 'multiSelect' ? { id, name, type, options: options ?? [] } : { id, name, type },
    );
    if (new Set(properties.map((property) => property.id)).size !== properties.length) {
      throw new BadRequestException('Each property needs its own id');
    }
    if (properties.some((property) => property.options && new Set(property.options.map((option) => option.id)).size !== property.options.length)) {
      throw new BadRequestException('Each option needs its own id');
    }
    if (input.groupBy && !properties.some((property) => property.id === input.groupBy && property.type === 'select')) {
      throw new BadRequestException('Group a board by a select property');
    }
    if (input.dateBy && !properties.some((property) => property.id === input.dateBy && property.type === 'date')) {
      throw new BadRequestException('Lay out a calendar by a date property');
    }
    const members = await this.members(found.spaceId);
    await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.databaseSchema.findUnique({ where: { itemId: noteId }, select: { properties: true, updatedAt: true } });
      const previousTypes = new Map(((before?.properties ?? []) as unknown as Property[]).map((property) => [property.id, property.type]));
      const settings = {
        properties: properties as unknown as Prisma.InputJsonValue,
        view: input.view,
        groupBy: input.groupBy ?? null,
        dateBy: input.dateBy ?? null,
        updatedAt: new Date(Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1)),
      };
      if (input.expectedRevision !== undefined) {
        if (input.expectedRevision === null) {
          if (before) throw new ConflictException('This page is already a database. Reload it to see the current properties.');
          await transaction.databaseSchema.create({ data: { itemId: noteId, ...settings } });
        } else if ((await transaction.databaseSchema.updateMany({
          where: { itemId: noteId, updatedAt: new Date(input.expectedRevision) },
          data: settings,
        })).count !== 1) throw new ConflictException('The database changed while you were editing. Your property draft is kept; reopen it to use the current schema.');
      } else await transaction.databaseSchema.upsert({ where: { itemId: noteId }, create: { itemId: noteId, ...settings }, update: settings });
      const current = new Map(properties.map((property) => [property.id, property]));
      const values = await transaction.noteProperty.findMany({ where: { item: { note: { parentId: noteId } } } });
      for (const entry of values) {
        const property = current.get(entry.propertyId);
        const options = new Set((property?.options ?? []).map((option) => option.id));
        const value =
          property?.type === 'multiSelect' && Array.isArray(entry.value) ? entry.value.filter((option) => options.has(String(option))) : entry.value;
        const kept = property && previousTypes.get(property.id) === property.type ? propertyValue(property, value, members) : undefined;
        const where = { itemId_propertyId: { itemId: entry.itemId, propertyId: entry.propertyId } };
        if (kept === undefined || emptyValue(kept)) await transaction.noteProperty.delete({ where });
        else if (JSON.stringify(kept) !== JSON.stringify(entry.value)) {
          await transaction.noteProperty.update({ where, data: { value: kept as Prisma.InputJsonValue } });
        }
      }
    });
    this.changes.notify('page-databases', { spaceId: found.spaceId, itemId: noteId });
    this.changes.notify('page-details', { spaceId: found.spaceId, itemId: noteId });
    return this.get(userId, noteId);
  }

  async remove(userId: string, noteId: string) {
    const found = await this.notes.note(userId, noteId, 'edit', [ItemKind.NOTE]);
    if (!found.permissions.organize) throw new ForbiddenException('Space editing access is required to change the database schema');
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before changing it');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "database_schemas" WHERE "item_id" = ${noteId}::uuid FOR UPDATE`;
      await transaction.noteProperty.deleteMany({ where: { item: { note: { parentId: noteId } } } });
      await transaction.databaseSchema.deleteMany({ where: { itemId: noteId } });
    });
    this.changes.notify('page-databases', { spaceId: found.spaceId, itemId: noteId });
    this.changes.notify('page-details', { spaceId: found.spaceId, itemId: noteId });
  }

  async setValues(userId: string, noteId: string, input: SetPropertiesDto) {
    const found = await this.notes.note(userId, noteId, 'edit', [ItemKind.NOTE]);
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before changing it');
    const parentId = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "items" WHERE "id" = ${noteId}::uuid FOR UPDATE`;
      const note = await transaction.note.findUnique({ where: { itemId: noteId }, select: { parentId: true } });
      if (!note?.parentId) throw new BadRequestException('Only pages inside a database have properties');
      await this.pages.assertPage(userId, note.parentId, 'read', transaction);
      await transaction.$queryRaw`SELECT 1 FROM "database_schemas" WHERE "item_id" = ${note.parentId}::uuid FOR UPDATE`;
      const schema = await transaction.databaseSchema.findUnique({ where: { itemId: note.parentId }, select: { properties: true } });
      if (!schema) throw new BadRequestException('Only pages inside a database have properties');
      const properties = new Map((schema.properties as unknown as Property[]).map((property) => [property.id, property]));
      const entries = Object.entries(input.values);
      if (!found.permissions.spaceRole && entries.some(([id]) => properties.get(id)?.type === 'person')) throw new ForbiddenException('Space membership is required to assign people');
      const members = entries.some(([id]) => properties.get(id)?.type === 'person') ? await this.members(found.spaceId) : new Set<string>();
      if (input.expectedValues) {
        const current = valueMap(await transaction.noteProperty.findMany({ where: { itemId: noteId } }));
        for (const [id] of entries) {
          if (!Object.hasOwn(input.expectedValues, id)) throw new BadRequestException('Include the previous value for each property being changed');
          if (JSON.stringify(current[id] ?? null) !== JSON.stringify(input.expectedValues[id] ?? null)) throw new ConflictException('Someone changed this property. Your draft is kept; choose which value to use.');
        }
      }
      const changes = entries.map(([id, value]) => {
        const property = properties.get(id);
        if (!property) throw new BadRequestException('That property is not part of this database');
        if (value === null || (typeof value === 'string' && !value.trim())) return { id, value: null };
        const normalized = propertyValue(property, value, members);
        if (normalized === undefined) throw new BadRequestException(`${property.name} ${propertyRules[property.type]}`);
        return { id, value: emptyValue(normalized) ? null : (normalized as Prisma.InputJsonValue) };
      });
      for (const change of changes) {
        if (change.value === null) {
          await transaction.noteProperty.deleteMany({ where: { itemId: noteId, propertyId: change.id } });
        } else {
          await transaction.noteProperty.upsert({
            where: { itemId_propertyId: { itemId: noteId, propertyId: change.id } },
            create: { itemId: noteId, propertyId: change.id, value: change.value },
            update: { value: change.value },
          });
        }
      }
      await transaction.item.update({ where: { id: noteId }, data: { updatedById: userId } });
      return note.parentId;
    });
    this.changes.notify('page-databases', { spaceId: found.spaceId, itemId: parentId });
    this.changes.notify('page-details', { spaceId: found.spaceId, itemId: noteId });
    return { values: valueMap(await this.prisma.noteProperty.findMany({ where: { itemId: noteId } })) };
  }

  private async members(spaceId: string) {
    const rows = await this.prisma.spaceMember.findMany({ where: { spaceId }, select: { userId: true } });
    return new Set(rows.map((row) => row.userId));
  }
}
