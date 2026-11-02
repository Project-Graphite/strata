import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, CreateCardDto, ReconcileAccountDto, UpdateAccountDto, UpdateCardDto } from './dto/accounts.dto';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('me/accounts')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.list(user.id);
  }

  @Get('me/cards')
  @Scope('items:read')
  cards(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.cards(user.id);
  }

  @Get('me/cards/seen')
  @Scope('items:read')
  seenCards(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.seenCards(user.id);
  }

  @Delete('me/cards/seen/:digits')
  @Scope('items:write')
  @HttpCode(204)
  forgetSeenCard(@CurrentUser() user: AuthenticatedUser, @Param('digits') digits: string) {
    return this.accounts.forgetSeenCard(user.id, digits);
  }

  @Post('me/accounts')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAccountDto) {
    return this.accounts.create(user.id, input);
  }

  @Patch('accounts/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateAccountDto) {
    return this.accounts.update(user.id, id, input);
  }

  @Delete('accounts/:id')
  @Scope('items:write')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.accounts.remove(user.id, id);
  }

  @Post('accounts/:id/reconcile')
  @Scope('items:write')
  reconcile(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: ReconcileAccountDto) {
    return this.accounts.reconcile(user.id, id, input.balanceMinor);
  }

  @Post('accounts/:id/cards')
  @Scope('items:write')
  addCard(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: CreateCardDto) {
    return this.accounts.addCard(user.id, id, input);
  }

  @Patch('cards/:id')
  @Scope('items:write')
  updateCard(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateCardDto) {
    return this.accounts.updateCard(user.id, id, input);
  }

  @Delete('cards/:id')
  @Scope('items:write')
  @HttpCode(204)
  removeCard(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.accounts.removeCard(user.id, id);
  }
}
