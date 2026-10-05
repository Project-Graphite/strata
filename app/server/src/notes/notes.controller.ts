import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';
import { NotesService } from './notes.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

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

  @Patch('notes/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateNoteDto) {
    return this.notes.update(user.id, id, input);
  }
}
