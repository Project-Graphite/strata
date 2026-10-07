import { Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { CalendarFeedService } from './calendar-feed.service';

@Controller()
export class CalendarController {
  constructor(private readonly feeds: CalendarFeedService) {}

  @Get('me/calendar-feed')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.feeds.status(user.id);
  }

  @Post('me/calendar-feed')
  @UseGuards(JwtAuthGuard)
  @RateLimit('calendar-feed-reset', 20, 3_600)
  reset(@CurrentUser() user: AuthenticatedUser) {
    return this.feeds.reset(user.id);
  }

  @Delete('me/calendar-feed')
  @UseGuards(JwtAuthGuard)
  disable(@CurrentUser() user: AuthenticatedUser) {
    return this.feeds.disable(user.id);
  }

  @Get('calendar/:file')
  @RateLimit('calendar-feed', 120, 3_600)
  async feed(@Param('file') file: string, @Res({ passthrough: true }) response: Response) {
    const text = await this.feeds.feed(file);
    response.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' });
    return text;
  }
}
