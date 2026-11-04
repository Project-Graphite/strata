import { Controller, Delete, Get, Param, Put } from '@nestjs/common';
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

  @Put('watch')
  @Scope('items:read')
  watch(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.watchers.setWatching(user.id, id, true);
  }

  @Delete('watch')
  @Scope('items:read')
  unwatch(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.watchers.setWatching(user.id, id, false);
  }

  @Put('watchers/:userId')
  @Scope('items:write')
  add(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('userId', UuidPipe) watcherId: string) {
    return this.watchers.setOtherWatching(user.id, id, watcherId, true);
  }

  @Delete('watchers/:userId')
  @Scope('items:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('userId', UuidPipe) watcherId: string) {
    return this.watchers.setOtherWatching(user.id, id, watcherId, false);
  }
}