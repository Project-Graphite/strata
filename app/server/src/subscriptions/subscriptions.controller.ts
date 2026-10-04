import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateSubscriptionDto, ListSubscriptionsDto, UpdateSubscriptionDto } from './dto/subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('spaces/:spaceId/subscriptions')
  @Scope('items:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Query() query: ListSubscriptionsDto,
  ) {
    return this.subscriptions.list(user.id, spaceId, query);
  }

  @Post('spaces/:spaceId/subscriptions')
  @Scope('items:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Body() input: CreateSubscriptionDto,
  ) {
    return this.subscriptions.create(user.id, spaceId, input);
  }

  @Get('subscriptions/summary')
  @Scope('items:read')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.summary(user.id);
  }

  @Get('subscriptions/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.subscriptions.get(user.id, id);
  }

  @Get('subscriptions/:id/prices')
  @Scope('items:read')
  prices(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.subscriptions.prices(user.id, id);
  }

  @Patch('subscriptions/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateSubscriptionDto) {
    return this.subscriptions.update(user.id, id, input);
  }

  @Post('subscriptions/:id/used')
  @Scope('items:write')
  markUsed(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.subscriptions.markUsed(user.id, id);
  }

  @Post('subscriptions/:id/cancel')
  @Scope('items:write')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.subscriptions.cancel(user.id, id);
  }

  @Post('subscriptions/:id/resume')
  @Scope('items:write')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.subscriptions.resume(user.id, id);
  }
}
