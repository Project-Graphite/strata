import { SpaceQueryDto } from '../validation/space-query.dto';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateMealDto, CreateRecipeDto, ImportRecipeDto, MealPlanWeekDto, UpdateRecipeDto } from './dto/recipes.dto';
import { RecipesService } from './recipes.service';

@Controller()
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get('me/recipes')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.recipes.list(user.id, query.spaceId);
  }

  @Post('spaces/:spaceId/recipes')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateRecipeDto) {
    return this.recipes.create(user.id, spaceId, input);
  }

  @Post('recipes/import')
  @Scope('items:write')
  @HttpCode(200)
  @RateLimit('recipe-import', 30, 600)
  importPage(@Body() input: ImportRecipeDto) {
    return this.recipes.importPage(input.url);
  }

  @Get('recipes/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.recipes.get(user.id, id);
  }

  @Patch('recipes/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateRecipeDto) {
    return this.recipes.update(user.id, id, input);
  }

  @Get('spaces/:spaceId/meal-plan')
  @Scope('items:read')
  week(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: MealPlanWeekDto) {
    return this.recipes.week(user.id, spaceId, query.from);
  }

  @Post('spaces/:spaceId/meal-plan')
  @Scope('items:write')
  addMeal(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateMealDto) {
    return this.recipes.addMeal(user.id, spaceId, input);
  }

  @Delete('meal-plan/:id')
  @Scope('items:write')
  @HttpCode(204)
  removeMeal(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.recipes.removeMeal(user.id, id);
  }

  @Post('spaces/:spaceId/meal-plan/shopping-list')
  @Scope('items:write')
  @HttpCode(200)
  shoppingList(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: MealPlanWeekDto) {
    return this.recipes.shoppingList(user.id, spaceId, input.from);
  }
}
