import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateHabitDto, UpdateHabitDto } from './dto/habits.dto';
import { HabitsService } from './habits.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get('spaces/:spaceId/habits')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.habits.list(user.id, spaceId);
  }

  @Post('spaces/:spaceId/habits')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateHabitDto) {
    return this.habits.create(user.id, spaceId, input);
  }

  @Get('me/habits')
  @Scope('items:read')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.habits.mine(user.id);
  }

  @Patch('habits/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateHabitDto) {
    return this.habits.update(user.id, id, input);
  }

  @Delete('habits/:id')
  @Scope('items:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.habits.remove(user.id, id);
  }

  @Put('habits/:id/check-ins/:day')
  @Scope('items:write')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('day') day: string) {
    return this.habits.checkIn(user.id, id, day, true);
  }

  @Delete('habits/:id/check-ins/:day')
  @Scope('items:write')
  undoCheckIn(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('day') day: string) {
    return this.habits.checkIn(user.id, id, day, false);
  }
}
