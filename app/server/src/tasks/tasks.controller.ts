import { SpaceQueryDto } from '../validation/space-query.dto';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateListDto, CreateTaskDto, ListTasksDto, UpdateTaskDto } from './dto/tasks.dto';
import { TasksService } from './tasks.service';

@Controller()
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
}
