import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { LinkCodeDto } from '../validation/link-code.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { DatePollsService } from './date-polls.service';
import { PickPollOptionDto, PollVotesDto, SetPollDto } from './dto/events.dto';
import { Public } from '../auth/public.decorator';

@Controller()
export class DatePollsController {
  constructor(private readonly polls: DatePollsService) {}

  @Get('events/:id/poll')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.polls.forMember(user.id, id);
  }

  @Put('events/:id/poll')
  @Scope('items:write')
  set(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SetPollDto) {
    return this.polls.set(user.id, id, input);
  }

  @Delete('events/:id/poll')
  @Scope('items:write')
  @HttpCode(204)
  async close(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.polls.close(user.id, id);
  }

  @Put('events/:id/poll/votes')
  @Scope('items:write')
  vote(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: PollVotesDto) {
    return this.polls.voteAsMember(user.id, id, input.votes);
  }

  @Post('events/:id/poll/pick')
  @Scope('items:write')
  pick(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: PickPollOptionDto) {
    return this.polls.pick(user.id, id, input.optionId);
  }

  @Public()
  @Get('rsvp/:code/poll')
  @RateLimit('rsvp-open', 120, 3_600)
  guestView(@Param() input: LinkCodeDto) {
    return this.polls.forGuest(input.code);
  }

  @Public()
  @Put('rsvp/:code/poll')
  @RateLimit('rsvp', 30, 3_600)
  guestVote(@Param() input: LinkCodeDto, @Body() answer: PollVotesDto) {
    return this.polls.voteAsGuest(input.code, answer.votes);
  }
}
