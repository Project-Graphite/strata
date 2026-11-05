import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateSpaceDto, TransferSpaceDto, UpdateMemberDto, UpdateSpaceDto, UpdateSpaceSettingsDto } from './dto/spaces.dto';
import { SpacesService } from './spaces.service';

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  @Scope('spaces:read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.spaces.list(user.id);
  }

  @Post()
  @RateLimit('create-space', 30, 3_600)
  @Scope('spaces:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateSpaceDto) {
    return this.spaces.create(user.id, input);
  }

  @Get(':id')
  @Scope('spaces:read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') idOrSlug: string) {
    return this.spaces.get(user.id, idOrSlug);
  }

  @Get(':id/settings')
  @Scope('spaces:read')
  settings(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.settings(user.id, id);
  }

  @Patch(':id/settings')
  @Scope('spaces:write')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateSpaceSettingsDto) {
    return this.spaces.updateSettings(user.id, id, input);
  }

  @Patch(':id')
  @Scope('spaces:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body() input: UpdateSpaceDto,
  ) {
    return this.spaces.update(user.id, id, input);
  }

  @Get(':id/storage')
  @Scope('spaces:read')
  storage(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.storage(user.id, id);
  }

  @Put(':id/archive')
  @Scope('spaces:write')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.archive(user.id, id, true);
  }

  @Delete(':id/archive')
  @Scope('spaces:write')
  unarchive(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.archive(user.id, id, false);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  @Scope('spaces:write')
  transfer(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: TransferSpaceDto) {
    return this.spaces.transfer(user.id, id, input.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Scope('spaces:write')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.spaces.remove(user.id, id);
  }

  @Get(':id/members')
  @Scope('spaces:read')
  members(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.members(user.id, id);
  }

  @Patch(':id/members/:userId')
  @Scope('spaces:write')
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('userId', UuidPipe) memberId: string,
    @Body() input: UpdateMemberDto,
  ) {
    return this.spaces.changeRole(user.id, id, memberId, input);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @Scope('spaces:write')
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('userId', UuidPipe) memberId: string,
  ) {
    await this.spaces.removeMember(user.id, id, memberId);
  }
}
