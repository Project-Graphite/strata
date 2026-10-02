import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PageDto } from '../validation/page.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateLinkDto, ListItemsDto, SetItemTagsDto, UpdateItemDto } from './dto/items.dto';
import { ItemsService } from './items.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get('spaces/:spaceId/items')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Query() query: ListItemsDto,
  ) {
    return this.items.list(user.id, spaceId, query);
  }

  @Get('trash')
  trash(@CurrentUser() user: AuthenticatedUser, @Query() query: PageDto) {
    return this.items.listTrash(user.id, query.page);
  }

  @Get('items/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.items.get(user.id, id);
  }

  @Patch('items/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateItemDto) {
    return this.items.update(user.id, id, input);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.items.remove(user.id, id);
  }

  @Put('items/:id/tags')
  setTags(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: SetItemTagsDto) {
    return this.items.setTags(user.id, id, input.tagIds);
  }

  @Post('items/:id/trash')
  @HttpCode(204)
  async moveToTrash(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.items.moveToTrash(user.id, id);
  }

  @Post('items/:id/restore')
  @HttpCode(204)
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.items.restore(user.id, id);
  }

  @Get('items/:id/links')
  links(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.items.links(user.id, id);
  }

  @Post('items/:id/links')
  link(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: CreateLinkDto) {
    return this.items.link(user.id, id, input);
  }

  @Delete('items/:id/links/:linkId')
  @HttpCode(204)
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('linkId', UuidPipe) linkId: string,
  ) {
    await this.items.unlink(user.id, id, linkId);
  }
}
