import { SpaceQueryDto } from '../validation/space-query.dto';
import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadQueue } from '../files/upload-queue';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateNoteDto, PageChildrenQueryDto, PageKindQueryDto, SaveDatabaseDto, SetPropertiesDto, UpdateNoteDto } from './dto/notes.dto';
import { NoteDatabasesService } from './note-databases.service';
import { NoteVersionsService } from './note-versions.service';
import { NotesService } from './notes.service';
import { readBody } from '../http/read-body';
import { RateLimit } from '../redis/rate-limit.guard';
import { maxDraftFileBytes } from './document-limits';

@Controller()
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly versions: NoteVersionsService,
    private readonly databases: NoteDatabasesService,
    private readonly uploads: UploadQueue,
  ) {}

  @Get('me/pages')
  @Scope('items:read')
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.notes.mine(user.id, query.spaceId);
  }

  @Get('me/notes')
  @Scope('items:read')
  everywhere(@CurrentUser() user: AuthenticatedUser, @Query() query: PageKindQueryDto) {
    return this.notes.everywhere(user.id, query.kind, query.spaceId);
  }

  @Get('spaces/:spaceId/notes')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.notes.list(user.id, spaceId);
  }

  @Post('spaces/:spaceId/notes')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateNoteDto) {
    return this.notes.create(user.id, spaceId, input);
  }

  @Get('spaces/:spaceId/page-children')
  @Scope('items:read')
  children(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: PageChildrenQueryDto) {
    return this.notes.children(user.id, spaceId, query);
  }

  @Post('spaces/:spaceId/page-drafts')
  @Scope('items:write')
  @RateLimit('page-draft', 200, 86_400)
  async recover(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Req() request: Request, @Headers('x-recovery-id') recoveryId?: string) {
    if (!request.is('application/octet-stream')) throw new BadRequestException('Send the draft file itself as the request body');
    if (recoveryId !== undefined && !isUUID(recoveryId)) throw new BadRequestException('The recovery ID is invalid');
    return this.uploads.run(user.id, async () => this.notes.recover(user.id, spaceId, await readBody(request, maxDraftFileBytes, 'Draft files can be at most 8 MB'), recoveryId));
  }

  @Get('notes/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.notes.get(user.id, id);
  }

  @Get('notes/:id/board')
  @Scope('items:read')
  board(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.notes.board(user.id, id);
  }

  @Get('notes/:id/versions')
  @Scope('items:read')
  listVersions(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.versions.list(user.id, id);
  }

  @Get('notes/:id/versions/:versionId')
  @Scope('items:read')
  version(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('versionId', UuidPipe) versionId: string) {
    return this.versions.preview(user.id, id, versionId);
  }

  @Post('notes/:id/versions/:versionId/restore')
  @Scope('items:write')
  @HttpCode(204)
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('versionId', UuidPipe) versionId: string) {
    await this.versions.restore(user.id, id, versionId);
  }

  @Patch('notes/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateNoteDto) {
    return this.notes.update(user.id, id, input);
  }

  @Get('notes/:id/database')
  @Scope('items:read')
  database(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.databases.get(user.id, id);
  }

  @Put('notes/:id/database')
  @Scope('items:write')
  saveDatabase(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SaveDatabaseDto) {
    return this.databases.save(user.id, id, input);
  }

  @Delete('notes/:id/database')
  @Scope('items:write')
  @HttpCode(204)
  async removeDatabase(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.databases.remove(user.id, id);
  }

  @Patch('notes/:id/properties')
  @Scope('items:write')
  setProperties(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SetPropertiesDto) {
    return this.databases.setValues(user.id, id, input);
  }
}
