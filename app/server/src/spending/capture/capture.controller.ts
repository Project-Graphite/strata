import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Scope } from '../../access-tokens/scopes';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RateLimit } from '../../redis/rate-limit.guard';
import { UuidPipe } from '../../validation/uuid.pipe';
import { CaptureMessageDto } from '../dto/capture.dto';
import { CreateExpenseDto } from '../dto/spending.dto';
import { CaptureService } from './capture.service';

@Controller()
export class CaptureController {
  constructor(private readonly captures: CaptureService) {}

  @Post('spaces/:spaceId/captures')
  @Scope('spending:capture')
  @RateLimit('captures', 300, 3_600)
  @HttpCode(200)
  receive(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CaptureMessageDto) {
    return this.captures.receive(user.id, spaceId, input);
  }

  @Post('spaces/:spaceId/captures/device')
  @RateLimit('capture-device', 30, 3_600)
  connectDevice(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.captures.connectDevice(user.id, spaceId);
  }

  @Get('spaces/:spaceId/captures')
  @Scope('items:read')
  pending(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.captures.pending(user.id, spaceId);
  }

  @Post('captures/:id/record')
  @Scope('items:write')
  record(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: CreateExpenseDto) {
    return this.captures.recordReviewed(user.id, id, input);
  }

  @Post('captures/:id/ignore')
  @Scope('items:write')
  @HttpCode(204)
  async ignore(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.captures.ignore(user.id, id);
  }
}
