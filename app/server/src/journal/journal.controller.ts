import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JournalQueryDto, SetMoodDto } from './dto/journal.dto';
import { JournalService } from './journal.service';

@Controller('me/journal')
@UseGuards(JwtAuthGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  @Scope('items:read')
  year(@CurrentUser() user: AuthenticatedUser, @Query() query: JournalQueryDto) {
    return this.journal.year(user.id, query.year);
  }

  @Post(':day/page')
  @Scope('items:write')
  open(@CurrentUser() user: AuthenticatedUser, @Param('day') day: string) {
    return this.journal.open(user.id, day);
  }

  @Put(':day/mood')
  @Scope('items:write')
  setMood(@CurrentUser() user: AuthenticatedUser, @Param('day') day: string, @Body() input: SetMoodDto) {
    return this.journal.setMood(user.id, day, input.mood);
  }
}
