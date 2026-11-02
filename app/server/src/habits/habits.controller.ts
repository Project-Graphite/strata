import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateHabitDto, UpdateHabitDto } from './dto/habits.dto';
import { HabitsService } from './habits.service';

@Controller()
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}


  @Post('me/habits')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateHabitDto) {
    return this.habits.create(user.id, input);
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
