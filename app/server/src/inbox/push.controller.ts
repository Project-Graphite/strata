import { Body, Controller, Delete, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushEndpointDto, SavePushSubscriptionDto } from './dto/push.dto';
import { PushService } from './push.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('push/key')
  key() {
    return this.push.publicKey();
  }

  @Put('me/push-subscriptions')
  save(@CurrentUser() user: AuthenticatedUser, @Body() input: SavePushSubscriptionDto) {
    return this.push.save(user.id, input);
  }

  @Post('me/push-subscriptions/find')
  @HttpCode(200)
  find(@CurrentUser() user: AuthenticatedUser, @Body() input: PushEndpointDto) {
    return this.push.find(user.id, input.endpoint);
  }

  @Delete('me/push-subscriptions')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Body() input: PushEndpointDto) {
    await this.push.remove(user.id, input.endpoint);
  }
}
