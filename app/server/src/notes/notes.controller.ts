import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';
import { NoteVersionsService } from './note-versions.service';
import { NotesService } from './notes.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly versions: NoteVersionsService,
  ) {}

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

  @Get('notes/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.notes.get(user.id, id);
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
}
