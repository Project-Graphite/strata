import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { AddToGoalDto, CreateAssetDto, CreateSavingsGoalDto, UpdateAssetDto, UpdateSavingsGoalDto } from './dto/wealth.dto';
import { WealthService } from './wealth.service';

@Controller()
export class WealthController {
  constructor(private readonly wealth: WealthService) {}

  @Get('me/savings-goals')
  @Scope('items:read')
  goals(@CurrentUser() user: AuthenticatedUser) {
    return this.wealth.goals(user.id);
  }

  @Post('me/savings-goals')
  @Scope('items:write')
  createGoal(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateSavingsGoalDto) {
    return this.wealth.createGoal(user.id, input);
  }

  @Patch('savings-goals/:id')
  @Scope('items:write')
  updateGoal(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateSavingsGoalDto) {
    return this.wealth.updateGoal(user.id, id, input);
  }

  @Post('savings-goals/:id/add')
  @Scope('items:write')
  @HttpCode(200)
  addToGoal(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: AddToGoalDto) {
    return this.wealth.addToGoal(user.id, id, input);
  }

  @Delete('savings-goals/:id')
  @Scope('items:write')
  @HttpCode(204)
  async removeGoal(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.wealth.removeGoal(user.id, id);
  }

  @Get('me/net-worth')
  @Scope('items:read')
  netWorth(@CurrentUser() user: AuthenticatedUser) {
    return this.wealth.netWorth(user.id);
  }

  @Post('me/assets')
  @Scope('items:write')
  createAsset(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAssetDto) {
    return this.wealth.createAsset(user.id, input);
  }

  @Patch('assets/:id')
  @Scope('items:write')
  updateAsset(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateAssetDto) {
    return this.wealth.updateAsset(user.id, id, input);
  }

  @Delete('assets/:id')
  @Scope('items:write')
  @HttpCode(204)
  async removeAsset(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.wealth.removeAsset(user.id, id);
  }
}
