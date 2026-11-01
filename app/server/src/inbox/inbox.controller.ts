import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { PageDto } from '../validation/page.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { MarkReadDto } from './dto/inbox.dto';
import { InboxService } from './inbox.service';

@Controller('me/inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @Scope('account:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PageDto) {
    return this.inbox.list(user.id, query.page);
  }

  @Get('summary')
  @Scope('account:read')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.summary(user.id);
  }

  @Post('read')
  @HttpCode(204)
  @Scope('account:write')
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    await this.inbox.readAll(user.id);
  }

  @Patch(':id')
  @HttpCode(204)
  @Scope('account:write')
  async setRead(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: MarkReadDto) {
    await this.inbox.setRead(user.id, id, input.read);
  }
}
