import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';
import { TagsService } from './tags.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get('spaces/:spaceId/tags')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.tags.list(user.id, spaceId);
  }

  @Post('spaces/:spaceId/tags')
  @RateLimit('create-tag', 300, 3_600)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Body() input: CreateTagDto,
  ) {
    return this.tags.create(user.id, spaceId, input);
  }

  @Patch('tags/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateTagDto) {
    return this.tags.update(user.id, id, input);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.tags.remove(user.id, id);
  }
}
