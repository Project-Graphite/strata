import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { AddGoogleCalendarDto, ImportDriveFilesDto } from './dto/google.dto';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleDriveService } from './google-drive.service';

@Controller('me/google')
export class GoogleController {
  constructor(
    private readonly accounts: GoogleAuthService,
    private readonly calendars: GoogleCalendarService,
    private readonly drive: GoogleDriveService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.status(user.id);
  }

  @Delete()
  @HttpCode(204)
  @RateLimit('google-unlink', 10, 3_600)
  async unlink(@CurrentUser() user: AuthenticatedUser) {
    await this.accounts.unlink(user.id);
  }

  @Get('picker')
  @RateLimit('google-picker', 60, 3_600)
  picker(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.pickerToken(user.id);
  }

  @Post('drive')
  @Scope('items:write')
  @RateLimit('google-drive-import', 60, 3_600)
  importFiles(@CurrentUser() user: AuthenticatedUser, @Body() input: ImportDriveFilesDto) {
    return this.drive.import(user.id, input);
  }

  @Get('calendars')
  @Scope('items:read')
  listCalendars(@CurrentUser() user: AuthenticatedUser) {
    return this.calendars.calendars(user.id);
  }

  @Post('calendars')
  @Scope('items:write')
  @RateLimit('google-calendar-add', 30, 3_600)
  addCalendar(@CurrentUser() user: AuthenticatedUser, @Body() input: AddGoogleCalendarDto) {
    return this.calendars.add(user.id, input.calendarId);
  }

  @Post('calendars/sync')
  @Scope('items:write')
  @RateLimit('google-calendar-sync', 30, 3_600)
  syncCalendars(@CurrentUser() user: AuthenticatedUser) {
    return this.calendars.syncNow(user.id);
  }

  @Post('calendars/:id/default')
  @Scope('items:write')
  makeDefault(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.calendars.makeDefault(user.id, id);
  }

  @Delete('calendars/:id')
  @Scope('items:write')
  @HttpCode(204)
  async removeCalendar(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.calendars.remove(user.id, id);
  }
}
