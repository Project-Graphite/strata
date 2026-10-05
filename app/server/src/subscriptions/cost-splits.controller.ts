import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CostSplitsService } from './cost-splits.service';
import { BalancesQueryDto, CreateSettlementDto, SaveCostSplitDto } from './dto/cost-splits.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CostSplitsController {
  constructor(private readonly splits: CostSplitsService) {}

  @Put('subscriptions/:id/split')
  @Scope('items:write')
  save(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SaveCostSplitDto) {
    return this.splits.save(user.id, id, input);
  }

  @Delete('subscriptions/:id/split')
  @Scope('items:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.splits.remove(user.id, id);
  }

  @Get('spaces/:spaceId/balances')
  @Scope('items:read')
  balances(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: BalancesQueryDto) {
    return this.splits.balances(user.id, spaceId, query);
  }

  @Post('spaces/:spaceId/settlements')
  @Scope('items:write')
  settle(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateSettlementDto) {
    return this.splits.settle(user.id, spaceId, input);
  }

  @Delete('settlements/:id')
  @Scope('items:write')
  @HttpCode(204)
  async undo(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.splits.undoSettlement(user.id, id);
  }
}
