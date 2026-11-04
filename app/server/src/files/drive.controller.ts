import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { DriveService } from './drive.service';
import { DriveQueryDto, DriveSelectionDto, FolderDto, MoveDriveItemsDto, RenameDriveItemDto } from './dto/files.dto';

@Controller('me')
export class DriveController {
  constructor(private readonly drive: DriveService) {}

  @Get('drive')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: DriveQueryDto) {
    return query.spaceId ? this.drive.spaceFolder(user.id, query.spaceId) : this.drive.list(user.id, query.folderId);
  }

  @Post('folders')
  @Scope('items:write')
  createFolder(@CurrentUser() user: AuthenticatedUser, @Body() input: FolderDto) {
    return this.drive.createFolder(user.id, input.name, input.parentId);
  }

  @Patch('drive/:id')
  @Scope('items:write')
  rename(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: RenameDriveItemDto) {
    return this.drive.rename(user.id, id, input.name);
  }

  @Post('drive/move')
  @Scope('items:write')
  @HttpCode(204)
  async move(@CurrentUser() user: AuthenticatedUser, @Body() input: MoveDriveItemsDto) {
    await this.drive.move(user.id, input.itemIds, input.folderId);
  }

  @Post('drive/trash')
  @Scope('items:write')
  @HttpCode(204)
  async trash(@CurrentUser() user: AuthenticatedUser, @Body() input: DriveSelectionDto) {
    await this.drive.setTrashed(user.id, input.itemIds, true);
  }

  @Post('drive/restore')
  @Scope('items:write')
  @HttpCode(204)
  async restore(@CurrentUser() user: AuthenticatedUser, @Body() input: DriveSelectionDto) {
    await this.drive.setTrashed(user.id, input.itemIds, false);
  }
}