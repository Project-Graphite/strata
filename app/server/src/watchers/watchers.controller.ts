import { Controller, Delete, Get, Param } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { WatchersService } from './watchers.service';

@Controller('items/:id')
export class WatchersController {
  constructor(private readonly watchers: WatchersService) {}

  @Get('watchers')
  @Scope('items:read')
  status(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.watchers.status(user.id, id);
  }

  @Delete('watch')
  @Scope('items:read')
  unwatch(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.watchers.stopWatching(user.id, id);
  }
}
