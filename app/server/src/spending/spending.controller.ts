import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateExpenseDto, ImportExpensesDto, InsightsDto, MonthDto, SaveBudgetDto, SavePlanDto, UpdateExpenseDto } from './dto/spending.dto';
import { SpendingService } from './spending.service';

@Controller()
export class SpendingController {
  constructor(private readonly spending: SpendingService) {}

  @Get('spaces/:spaceId/spending')
  @Scope('items:read')
  month(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: MonthDto) {
    return this.spending.month(user.id, spaceId, query.month);
  }

  @Get('spaces/:spaceId/spending/insights')
  @Scope('items:read')
  insights(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Query() query: InsightsDto) {
    return this.spending.insights(user.id, spaceId, query.months ?? 6);
  }

  @Get('spaces/:spaceId/expenses/export')
  @Scope('items:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  export(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.spending.export(user.id, spaceId);
  }

  @Put('spaces/:spaceId/spending-plan')
  @Scope('items:write')
  savePlan(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: SavePlanDto) {
    return this.spending.savePlan(user.id, spaceId, input);
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
