import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateCommentDto, UpdateCommentDto } from './dto/notes.dto';
import { NoteCommentsService } from './note-comments.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NoteCommentsController {
  constructor(private readonly comments: NoteCommentsService) {}

  @Get('notes/:id/comments')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.comments.list(user.id, id);
  }

  @Post('notes/:id/comments')
  @Scope('items:write')
  @RateLimit('comment', 120, 3_600)
  create(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: CreateCommentDto) {
    return this.comments.create(user.id, id, input);
  }

  @Patch('comments/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateCommentDto) {
    return this.comments.update(user.id, id, input.body);
  }

  @Delete('comments/:id')
  @Scope('items:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.comments.remove(user.id, id);
  }

  @Put('comments/:id/resolved')
  @Scope('items:write')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.comments.resolve(user.id, id, true);
  }

  @Delete('comments/:id/resolved')
  @Scope('items:write')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.comments.resolve(user.id, id, false);
  }
}
