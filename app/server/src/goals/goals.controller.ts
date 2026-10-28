import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateGoalDto, GoalHabitsDto, ListGoalsDto, UpdateGoalDto } from './dto/goals.dto';
import { GoalsService } from './goals.service';

@Controller()
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get('me/goals')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListGoalsDto) {
    return this.goals.list(user.id, query);
  }

  @Post('spaces/:spaceId/goals')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateGoalDto) {
    return this.goals.create(user.id, spaceId, input);
  }

  @Get('goals/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.goals.get(user.id, id);
  }

  @Patch('goals/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateGoalDto) {
    return this.goals.update(user.id, id, input);
  }

  @Put('goals/:id/habits')
  @Scope('items:write')
  setHabits(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: GoalHabitsDto) {
    return this.goals.setHabits(user.id, id, input);
  }
}
