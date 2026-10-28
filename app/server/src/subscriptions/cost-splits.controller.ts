import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CostSplitsService } from './cost-splits.service';
import { SaveCostSplitDto } from './dto/cost-splits.dto';

@Controller()
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
}
