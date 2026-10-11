import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto, ListBookmarksDto, SaveArticleDto, UpdateBookmarkDto } from './dto/bookmarks.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get('me/bookmarks')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListBookmarksDto) {
    return this.bookmarks.list(user.id, query);
  }

  @Post('spaces/:spaceId/bookmarks')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateBookmarkDto) {
    return this.bookmarks.create(user.id, spaceId, input);
  }

  @Get('bookmarks/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.bookmarks.get(user.id, id);
  }

  @Patch('bookmarks/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateBookmarkDto) {
    return this.bookmarks.markRead(user.id, id, input.read);
  }

  @Post('bookmarks/:id/fetch')
  @Scope('items:write')
  fetchAgain(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.bookmarks.fetchAgain(user.id, id);
  }

  @Put('bookmarks/:id/article')
  @Scope('items:write')
  saveArticle(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SaveArticleDto) {
    return this.bookmarks.saveArticle(user.id, id, input);
  }
}
