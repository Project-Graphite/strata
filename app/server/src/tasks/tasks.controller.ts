import { SpaceQueryDto } from '../validation/space-query.dto';
import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { uploadedFile } from '../files/files.controller';
import { UploadQueue } from '../files/upload-queue';
import { RateLimit } from '../redis/rate-limit.guard';
import { PageDto } from '../validation/page.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateListDto, CreateTaskDto, ListTasksDto, MoveTaskDto, TaskCommentDto, UpdateTaskDto } from './dto/tasks.dto';
import { TaskAttachmentsService } from './task-attachments.service';
import { TaskCommentsService } from './task-comments.service';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly taskComments: TaskCommentsService,
    private readonly taskFiles: TaskAttachmentsService,
    private readonly uploads: UploadQueue,
  ) {}

  @Get('spaces/:spaceId/lists')
  @Scope('items:read')
  lists(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.tasks.lists(user.id, spaceId);
  }

  @Post('spaces/:spaceId/lists')
  @Scope('items:write')
  createList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Body() input: CreateListDto,
  ) {
    return this.tasks.createList(user.id, spaceId, input);
  }

  @Get('spaces/:spaceId/tasks')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: ListTasksDto) {
    return this.tasks.list(user.id, spaceId, query);
  }

  @Post('spaces/:spaceId/tasks')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateTaskDto) {
    return this.tasks.create(user.id, spaceId, input);
  }

  @Get('me/lists')
  @Scope('items:read')
  myLists(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.tasks.myLists(user.id, query.spaceId);
  }

  @Get('me/tasks')
  @Scope('items:read')
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTasksDto) {
    return this.tasks.mine(user.id, query);
  }

  @Get('tasks/today')
  @Scope('items:read')
  today(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.tasks.today(user.id, query.spaceId);
  }

  @Get('tasks/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.tasks.get(user.id, id);
  }

  @Patch('tasks/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateTaskDto) {
    return this.tasks.update(user.id, id, input);
  }

  @Post('tasks/:id/complete')
  @Scope('items:write')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.tasks.complete(user.id, id);
  }

  @Post('tasks/:id/reopen')
  @Scope('items:write')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.tasks.reopen(user.id, id);
  }

  @Post('tasks/:id/move')
  @Scope('items:write')
  @HttpCode(200)
  move(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: MoveTaskDto) {
    return this.tasks.move(user.id, id, input);
  }

  @Get('tasks/:id/activity')
  @Scope('items:read')
  activity(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Query() query: PageDto) {
    return this.tasks.activityOf(user.id, id, query.page);
  }

  @Get('tasks/:id/comments')
  @Scope('items:read')
  comments(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.taskComments.list(user.id, id);
  }

  @Post('tasks/:id/comments')
  @Scope('items:write')
  @RateLimit('comment', 120, 3_600)
  comment(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: TaskCommentDto) {
    return this.taskComments.create(user.id, id, input.body);
  }

  @Patch('tasks/:id/comments/:commentId')
  @Scope('items:write')
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('commentId', UuidPipe) commentId: string,
    @Body() input: TaskCommentDto,
  ) {
    return this.taskComments.update(user.id, id, commentId, input.body);
  }

  @Delete('tasks/:id/comments/:commentId')
  @Scope('items:write')
  @HttpCode(204)
  async removeComment(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('commentId', UuidPipe) commentId: string) {
    await this.taskComments.remove(user.id, id, commentId);
  }

  @Get('tasks/:id/attachments')
  @Scope('items:read')
  attachments(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.taskFiles.list(user.id, id);
  }

  @Post('tasks/:id/attachments')
  @Scope('items:write')
  @RateLimit('upload', 200, 86_400)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Headers('x-file-name') name: string | undefined,
    @Req() request: Request,
  ) {
    const read = uploadedFile(request, name);
    return this.uploads.run(user.id, async () => {
      const file = await read();
      return this.taskFiles.upload(user.id, id, file.name, file.data);
    });
  }

  @Put('tasks/:id/attachments/:fileId')
  @Scope('items:write')
  attach(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('fileId', UuidPipe) fileId: string) {
    return this.taskFiles.attach(user.id, id, fileId);
  }

  @Delete('tasks/:id/attachments/:fileId')
  @Scope('items:write')
  @HttpCode(204)
  async detach(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('fileId', UuidPipe) fileId: string) {
    await this.taskFiles.detach(user.id, id, fileId);
  }
}
