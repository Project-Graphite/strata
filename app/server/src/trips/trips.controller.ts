import { SpaceQueryDto } from '../validation/space-query.dto';
import { Query, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateTripDto, UpdateTripDto } from './dto/trips.dto';
import { TripsService } from './trips.service';

@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('me/trips')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.trips.list(user.id, query.spaceId);
  }

  @Post('spaces/:spaceId/trips')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateTripDto) {
    return this.trips.create(user.id, spaceId, input);
  }

  @Get('trips/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.trips.get(user.id, id);
  }

  @Patch('trips/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateTripDto) {
    return this.trips.update(user.id, id, input);
  }
}
