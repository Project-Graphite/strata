import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Scope } from '../../access-tokens/scopes';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RateLimit } from '../../redis/rate-limit.guard';
import { UuidPipe } from '../../validation/uuid.pipe';
import { CaptureMessageDto, QuickEntryDto } from '../dto/capture.dto';
import { CreateExpenseDto } from '../dto/spending.dto';
import { CaptureService } from './capture.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CaptureController {
  constructor(private readonly captures: CaptureService) {}

  @Post('spaces/:spaceId/captures')
  @Scope('spending:capture')
  @RateLimit('captures', 300, 3_600)
  @HttpCode(200)
  receive(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CaptureMessageDto) {
    return this.captures.receive(user.id, spaceId, input);
  }

  @Post('spaces/:spaceId/expenses/quick')
  @Scope('items:write')
  quick(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: QuickEntryDto) {
    return this.captures.quick(user.id, spaceId, input);
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
