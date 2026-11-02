import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateExpenseDto, ExpenseIdsDto, ExportDto, ImportExpensesDto, InsightsDto, MonthDto, SaveBudgetDto, SavePlanDto, TransactionsDto, UpdateExpenseDto, UpdateExpensesDto } from './dto/spending.dto';
import { SpendingService } from './spending.service';

@Controller()
export class SpendingController {
  constructor(private readonly spending: SpendingService) {}

  @Get('me/spending')
  @Scope('items:read')
  month(@CurrentUser() user: AuthenticatedUser, @Query() query: MonthDto) {
    return this.spending.month(user.id, query.month);
  }

  @Get('me/spending/insights')
  @Scope('items:read')
  insights(@CurrentUser() user: AuthenticatedUser, @Query() query: InsightsDto) {
    return this.spending.insights(user.id, query.months ?? 6);
  }

  @Get('me/expenses/export')
  @Scope('items:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  export(@CurrentUser() user: AuthenticatedUser, @Query() query: ExportDto) {
    return this.spending.export(user.id, query);
  }

  @Put('me/spending-plan')
  @Scope('items:write')
  savePlan(@CurrentUser() user: AuthenticatedUser, @Body() input: SavePlanDto) {
    return this.spending.savePlan(user.id, input);
  }

  @Get('me/expenses')
  @Scope('items:read')
  transactions(@CurrentUser() user: AuthenticatedUser, @Query() query: TransactionsDto) {
    return this.spending.transactions(user.id, query);
  }

  @Get('me/expenses/trash')
  @Scope('items:read')
  trashed(@CurrentUser() user: AuthenticatedUser) {
    return this.spending.trashed(user.id);
  }

  @Patch('me/expenses')
  @Scope('items:write')
  updateMany(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateExpensesDto) {
    return this.spending.updateMany(user.id, input);
  }

  @Post('me/expenses/trash')
  @Scope('items:write')
  @HttpCode(200)
  trashMany(@CurrentUser() user: AuthenticatedUser, @Body() input: ExpenseIdsDto) {
    return this.spending.trashMany(user.id, input.ids, true);
  }

  @Post('me/expenses/restore')
  @Scope('items:write')
  @HttpCode(200)
  restoreMany(@CurrentUser() user: AuthenticatedUser, @Body() input: ExpenseIdsDto) {
    return this.spending.trashMany(user.id, input.ids, false);
  }

  @Post('me/expenses/delete')
  @Scope('items:write')
  @HttpCode(200)
  deleteMany(@CurrentUser() user: AuthenticatedUser, @Body() input: ExpenseIdsDto) {
    return this.spending.deleteMany(user.id, input.ids);
  }

  @Post('me/expenses')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateExpenseDto) {
    return this.spending.create(user.id, input);
  }

  @Post('me/expenses/import')
  @Scope('items:write')
  importExpenses(@CurrentUser() user: AuthenticatedUser, @Body() input: ImportExpensesDto) {
    return this.spending.import(user.id, input.expenses);
  }

  @Post('me/expenses/import/check')
  @Scope('items:read')
  @HttpCode(200)
  checkImport(@CurrentUser() user: AuthenticatedUser, @Body() input: ImportExpensesDto) {
    return this.spending.duplicates(user.id, input.expenses);
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

  @Put('me/budgets/:category')
  @Scope('items:write')
  saveBudget(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string, @Body() input: SaveBudgetDto) {
    return this.spending.saveBudget(user.id, category, input);
  }

  @Delete('me/budgets/:category')
  @Scope('items:write')
  @HttpCode(204)
  removeBudget(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string) {
    return this.spending.removeBudget(user.id, category);
  }
}
