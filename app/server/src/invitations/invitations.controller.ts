import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { LinkCodeDto } from '../validation/link-code.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { InviteToSpaceDto, InviteToStrataDto } from './dto/invitations.dto';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('invitations')
  @RateLimit('invite', 20, 86_400)
  @UseGuards(JwtAuthGuard)
  inviteToStrata(@CurrentUser() user: AuthenticatedUser, @Body() input: InviteToStrataDto) {
    return this.invitations.inviteToStrata(user.id, input);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard)
  sent(@CurrentUser() user: AuthenticatedUser) {
    return this.invitations.sent(user.id);
  }

  @Get('invitations/lookup/:code')
  @RateLimit('invite-lookup', 60, 3_600)
  lookup(@Param() input: LinkCodeDto) {
    return this.invitations.lookup(input.code);
  }

  @Post('invitations/redeem')
  @RateLimit('invite-redeem', 30, 3_600)
  @UseGuards(JwtAuthGuard)
  redeem(@CurrentUser() user: AuthenticatedUser, @Body() input: LinkCodeDto) {
    return this.invitations.redeem(user.id, input.code);
  }

  @Delete('invitations/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.invitations.withdraw(user.id, id);
  }

  @Post('invitations/:id/accept')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.invitations.accept(user.id, id);
  }

  @Post('invitations/:id/decline')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async decline(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.invitations.decline(user.id, id);
  }

  @Get('me/invitations')
  @UseGuards(JwtAuthGuard)
  received(@CurrentUser() user: AuthenticatedUser) {
    return this.invitations.received(user.id);
  }

  @Post('spaces/:spaceId/invitations')
  @RateLimit('invite', 20, 86_400)
  @UseGuards(JwtAuthGuard)
  inviteToSpace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Body() input: InviteToSpaceDto,
  ) {
    return this.invitations.inviteToSpace(user.id, spaceId, input);
  }

  @Get('spaces/:spaceId/invitations')
  @UseGuards(JwtAuthGuard)
  forSpace(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.invitations.forSpace(user.id, spaceId);
  }
}
