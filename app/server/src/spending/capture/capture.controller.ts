import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../admin/admin.guard';
import { Scope } from '../../access-tokens/scopes';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { ProofDto } from '../../auth/dto/account.dto';
import { RateLimit } from '../../redis/rate-limit.guard';
import { UuidPipe } from '../../validation/uuid.pipe';
import { CaptureMessageDto, IgnoreCaptureDto, RecordCaptureDto, UpdateSenderRuleDto } from '../dto/capture.dto';
import { CaptureService } from './capture.service';
import { SenderRulesService } from './sender-rules.service';

@Controller()
export class CaptureController {
  constructor(
    private readonly captures: CaptureService,
    private readonly senderRules: SenderRulesService,
  ) {}

  @Post('me/captures')
  @Scope('spending:capture')
  @RateLimit('captures', 300, 3_600)
  @HttpCode(200)
  receive(@CurrentUser() user: AuthenticatedUser, @Body() input: CaptureMessageDto) {
    return this.captures.receive(user.id, input);
  }

  @Post('me/captures/device')
  @RateLimit('capture-device', 30, 3_600)
  connectDevice(@CurrentUser() user: AuthenticatedUser, @Body() proof: ProofDto) {
    return this.captures.connectDevice(user.id, proof);
  }

  @Get('me/captures')
  @Scope('items:read')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.captures.pending(user.id);
  }

  @Post('captures/:id/record')
  @Scope('items:write')
  record(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: RecordCaptureDto) {
    return this.captures.recordReviewed(user.id, id, input);
  }

  @Post('captures/:id/ignore')
  @Scope('items:write')
  @HttpCode(204)
  async ignore(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: IgnoreCaptureDto) {
    await this.captures.ignore(user.id, id, input);
  }

  @Get('me/sender-rules')
  @Scope('items:read')
  rules(@CurrentUser() user: AuthenticatedUser) {
    return this.senderRules.list(user.id);
  }

  @Patch('sender-rules/:id')
  @Scope('items:write')
  updateRule(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateSenderRuleDto) {
    return this.senderRules.update(user.id, id, input);
  }

  @Delete('sender-rules/:id')
  @Scope('items:write')
  @HttpCode(204)
  async removeRule(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.senderRules.remove(user.id, id);
  }

  @Get('admin/parser-reports')
  @UseGuards(AdminGuard)
  reports() {
    return this.captures.reports();
  }
}
