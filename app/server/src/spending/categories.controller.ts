import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CategoriesService } from './categories.service';
import { CreateMerchantRuleDto, SaveCategoriesDto } from './dto/categories.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get('spaces/:spaceId/spending-categories')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.categories.list(user.id, spaceId);
  }

  @Put('spaces/:spaceId/spending-categories')
  @Scope('items:write')
  save(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: SaveCategoriesDto) {
    return this.categories.save(user.id, spaceId, input);
  }

  @Get('spaces/:spaceId/merchant-rules')
  @Scope('items:read')
  rules(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.categories.rules(user.id, spaceId);
  }

  @Post('spaces/:spaceId/merchant-rules')
  @Scope('items:write')
  saveRule(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateMerchantRuleDto) {
    return this.categories.saveRule(user.id, spaceId, input);
  }

  @Delete('merchant-rules/:id')
  @Scope('items:write')
  @HttpCode(204)
  async removeRule(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.categories.removeRule(user.id, id);
  }
}
