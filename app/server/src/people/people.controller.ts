import { SpaceQueryDto } from '../validation/space-query.dto';
import { Query, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreatePersonDto, UpdatePersonDto } from './dto/people.dto';
import { PeopleService } from './people.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('me/people')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.people.list(user.id, query.spaceId);
  }

  @Post('spaces/:spaceId/people')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreatePersonDto) {
    return this.people.create(user.id, spaceId, input);
  }

  @Get('people/:id')
  @Scope('items:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.people.get(user.id, id);
  }

  @Patch('people/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdatePersonDto) {
    return this.people.update(user.id, id, input);
  }
}
