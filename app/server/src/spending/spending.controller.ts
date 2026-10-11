import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateExpenseDto, ImportExpensesDto, MonthDto, SaveBudgetDto, UpdateExpenseDto } from './dto/spending.dto';
import { SpendingService } from './spending.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SpendingController {
  constructor(private readonly spending: SpendingService) {}

  @Get('spaces/:spaceId/spending')
  @Scope('items:read')
  month(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: MonthDto) {
    return this.spending.month(user.id, spaceId, query.month);
  }

  @Post('spaces/:spaceId/expenses')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateExpenseDto) {
    return this.spending.create(user.id, spaceId, input);
  }

  @Post('spaces/:spaceId/expenses/import')
  @Scope('items:write')
  importExpenses(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: ImportExpensesDto) {
    return this.spending.import(user.id, spaceId, input.expenses);
  }

  @Get('expenses/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spending.get(user.id, id);
  }

  @Patch('expenses/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateExpenseDto) {
    return this.spending.update(user.id, id, input);
  }

  @Put('spaces/:spaceId/budgets/:category')
  @Scope('items:write')
  saveBudget(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Param('category') category: string, @Body() input: SaveBudgetDto) {
    return this.spending.saveBudget(user.id, spaceId, category, input);
  }

  @Delete('spaces/:spaceId/budgets/:category')
  @Scope('items:write')
  @HttpCode(204)
  removeBudget(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Param('category') category: string) {
    return this.spending.removeBudget(user.id, spaceId, category);
  }
}
