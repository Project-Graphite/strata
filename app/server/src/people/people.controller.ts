import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreatePersonDto, UpdatePersonDto } from './dto/people.dto';
import { PeopleService } from './people.service';

@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('me/people')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.people.list(user.id);
  }

  @Post('me/people')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreatePersonDto) {
    return this.people.create(user.id, input);
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
