import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { LinkCodeDto } from '../validation/link-code.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { AgendaDto, CreateEventDto, InviteGuestDto, OpenRsvpDto, RsvpDto, UpdateEventDto } from './dto/events.dto';
import { EventsService } from './events.service';
import { Public } from '../auth/public.decorator';

@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('spaces/:spaceId/events')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateEventDto) {
    return this.events.create(user.id, spaceId, input);
  }

  @Get('agenda')
  @Scope('items:read')
  agenda(@CurrentUser() user: AuthenticatedUser, @Query() query: AgendaDto) {
    return this.events.agenda(user.id, query.from, query.to, query.spaceId);
  }

  @Get('events/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.events.get(user.id, id);
  }

  @Patch('events/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateEventDto) {
    return this.events.update(user.id, id, input);
  }

  @Post('events/:id/guests')
  @RateLimit('invite-guest', 50, 86_400)
  @Scope('items:write')
  invite(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: InviteGuestDto) {
    return this.events.invite(user.id, id, input);
  }

  @Delete('events/:id/guests/:guestId')
  @HttpCode(204)
  @Scope('items:write')
  async removeGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('guestId', UuidPipe) guestId: string,
  ) {
    await this.events.removeGuest(user.id, id, guestId);
  }

  @Public()
  @Get('rsvp/:code')
  @RateLimit('rsvp-open', 120, 3_600)
  rsvpView(@Param() input: LinkCodeDto) {
    return this.events.rsvpView(input.code);
  }

  @Public()
  @Post('rsvp/:code')
  @RateLimit('rsvp', 30, 3_600)
  rsvp(@Param() input: LinkCodeDto, @Body() answer: RsvpDto) {
    return this.events.rsvp(input.code, answer);
  }

  @Public()
  @Post('share/:code/rsvp')
  @RateLimit('rsvp', 30, 3_600)
  rsvpByShareLink(@Param() input: LinkCodeDto, @Body() answer: OpenRsvpDto) {
    return this.events.rsvpByShareLink(input.code, answer);
  }
}
