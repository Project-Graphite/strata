import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateTidyRuleDto, TidyActionDto, UpdateTidyRuleDto } from './dto/tidy.dto';
import { TidyRulesService } from './tidy-rules.service';
import { TidyService } from './tidy.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TidyController {
  constructor(
    private readonly tidy: TidyService,
    private readonly rules: TidyRulesService,
  ) {}

  @Get('tidy/scan')
  @Scope('items:read')
  scan(@CurrentUser() user: AuthenticatedUser) {
    return this.tidy.scan(user.id);
  }

  @Post('tidy/preview')
  @Scope('items:read')
  @HttpCode(200)
  preview(@CurrentUser() user: AuthenticatedUser, @Body() input: TidyActionDto) {
    return this.tidy.preview(user.id, input);
  }

  @Post('tidy/apply')
  @Scope('items:write')
  apply(@CurrentUser() user: AuthenticatedUser, @Body() input: TidyActionDto) {
    return this.tidy.apply(user.id, input);
  }

  @Get('tidy/history')
  @Scope('items:read')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.tidy.history(user.id);
  }

  @Post('tidy/history/:id/undo')
  @Scope('items:write')
  @HttpCode(200)
  undo(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.tidy.undo(user.id, id);
  }

  @Get('spaces/:spaceId/tidy-rules')
  @Scope('items:read')
  listRules(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.rules.list(user.id, spaceId);
  }

  @Post('spaces/:spaceId/tidy-rules')
  @Scope('items:write')
  createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Body() input: CreateTidyRuleDto,
  ) {
    return this.rules.create(user.id, spaceId, input);
  }

  @Patch('tidy-rules/:id')
  @Scope('items:write')
  updateRule(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateTidyRuleDto) {
    return this.rules.update(user.id, id, input.enabled);
  }

  @Delete('tidy-rules/:id')
  @Scope('items:write')
  @HttpCode(204)
  async removeRule(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.rules.remove(user.id, id);
  }

  @Get('tidy-rules/:id/matches')
  @Scope('items:read')
  matches(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.rules.matches(user.id, id);
  }
}
