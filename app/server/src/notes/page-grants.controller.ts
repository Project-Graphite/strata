import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { SavePageGrantDto } from './dto/page-grants.dto';
import { PageGrantsService } from './page-grants.service';

@Controller('notes/:id/people')
export class PageGrantsController {
  constructor(private readonly grants: PageGrantsService) {}

  @Get()
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.grants.list(user.id, id);
  }

  @Put()
  @Scope('items:write')
  save(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SavePageGrantDto) {
    return this.grants.save(user.id, id, input);
  }

  @Delete(':userId')
  @HttpCode(204)
  @Scope('items:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('userId', UuidPipe) recipientId: string) {
    return this.grants.remove(user.id, id, recipientId);
  }
}
