import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateListDto, CreateTaskDto, ListTasksDto, UpdateTaskDto } from './dto/tasks.dto';
import { TasksService } from './tasks.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

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

  @Get('tasks/today')
  @Scope('items:read')
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.today(user.id);
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
}
