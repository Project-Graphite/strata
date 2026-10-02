import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateSpaceDto, UpdateMemberDto, UpdateSpaceDto } from './dto/spaces.dto';
import { SpacesService } from './spaces.service';

@Controller('spaces')
@UseGuards(JwtAuthGuard)
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.spaces.list(user.id);
  }

  @Post()
  @RateLimit('create-space', 30, 3_600)
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateSpaceDto) {
    return this.spaces.create(user.id, input);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Body() input: UpdateSpaceDto,
  ) {
    return this.spaces.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.spaces.remove(user.id, id);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.spaces.members(user.id, id);
  }

  @Patch(':id/members/:userId')
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
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('userId', UuidPipe) memberId: string,
  ) {
    await this.spaces.removeMember(user.id, id, memberId);
  }
}
