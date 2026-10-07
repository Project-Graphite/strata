import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhooks.dto';
import { WebhooksService } from './webhooks.service';

@Controller('me/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.webhooks.list(user.id);
  }

  @Post()
  @RateLimit('webhook-create', 20, 3_600)
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateWebhookDto) {
    return this.webhooks.create(user.id, input);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateWebhookDto) {
    return this.webhooks.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.webhooks.remove(user.id, id);
  }

  @Get(':id/deliveries')
  deliveries(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.webhooks.deliveries(user.id, id);
  }

  @Post(':id/ping')
  @RateLimit('webhook-ping', 30, 3_600)
  ping(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.webhooks.ping(user.id, id);
  }
}
