import { Controller, Delete, Get, Headers, HttpCode, Param, Put, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { AvatarsService } from './avatars.service';
import { uploadedFile } from './files.controller';
import { fileHeaders } from './files.service';

@Controller()
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  @Put('me/avatar')
  @Scope('account:write')
  @RateLimit('avatar', 30, 86_400)
  async set(@CurrentUser() user: AuthenticatedUser, @Headers('x-file-name') name: string | undefined, @Req() request: Request) {
    const file = await uploadedFile(request, name)();
    return this.avatars.set(user.id, file.name, file.data);
  }

  @Delete('me/avatar')
  @HttpCode(204)
  @Scope('account:write')
  async remove(@CurrentUser() user: AuthenticatedUser) {
    await this.avatars.remove(user.id);
  }

  @Get('users/:id/avatar')
  @Scope('account:read')
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.avatars.read(user.id, id);
    response.set(fileHeaders(file));
    return new StreamableFile(file.stream);
  }
}
