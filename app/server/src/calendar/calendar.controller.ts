import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendarSubscriptionsService } from './calendar-subscriptions.service';
import { SpaceQueryDto } from '../validation/space-query.dto';
import { AddCalendarDto, CalendarEventDto } from './dto/calendar.dto';
import { Public } from '../auth/public.decorator';

@Controller()
export class CalendarController {
  constructor(
    private readonly feeds: CalendarFeedService,
    private readonly subscriptions: CalendarSubscriptionsService,
  ) {}

  @Get('me/calendar-feed')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.feeds.status(user.id);
  }

  @Post('me/calendar-feed')
  @RateLimit('calendar-feed-reset', 20, 3_600)
  reset(@CurrentUser() user: AuthenticatedUser) {
    return this.feeds.reset(user.id);
  }

  @Delete('me/calendar-feed')
  disable(@CurrentUser() user: AuthenticatedUser) {
    return this.feeds.disable(user.id);
  }

  @Public()
  @Get('calendar/:file')
  @RateLimit('calendar-feed', 120, 3_600)
  async feed(@Param('file') file: string, @Res({ passthrough: true }) response: Response) {
    const text = await this.feeds.feed(file);
    response.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' });
    return text;
  }

  @Get('me/calendars')
  @Scope('items:read')
  calendars(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.subscriptions.mine(user.id, query.spaceId);
  }

  @Post('me/calendars/refresh')
  @Scope('items:read')
  @RateLimit('calendars-refresh', 600, 3_600)
  refreshMine(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.refreshMine(user.id, new Date());
  }

  @Post('spaces/:spaceId/calendars')
  @Scope('items:write')
  @RateLimit('calendar-add', 20, 3_600)
  add(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: AddCalendarDto) {
    return this.subscriptions.add(user.id, spaceId, input);
  }

  @Get('calendars/:id/event')
  @Scope('items:read')
  event(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Query() query: CalendarEventDto) {
    return this.subscriptions.event(user.id, id, query.uid);
  }

  @Post('calendars/:id/refresh')
  @Scope('items:write')
  @RateLimit('calendar-refresh', 30, 3_600)
  refresh(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.subscriptions.refreshNow(user.id, id);
  }

  @Delete('calendars/:id')
  @Scope('items:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.subscriptions.remove(user.id, id);
  }
}
