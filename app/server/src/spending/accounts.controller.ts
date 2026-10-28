import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('spaces/:spaceId/accounts')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.accounts.list(user.id, spaceId);
  }

  @Get('spaces/:spaceId/cards')
  @Scope('items:read')
  cards(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.accounts.cards(user.id, spaceId);
  }

  @Post('spaces/:spaceId/accounts')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateAccountDto) {
    return this.accounts.create(user.id, spaceId, input);
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
}
