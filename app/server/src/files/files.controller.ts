import { SpaceQueryDto } from '../validation/space-query.dto';
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../redis/rate-limit.guard';
import { readBody } from '../http/read-body';
import { UuidPipe } from '../validation/uuid.pipe';
import { fileHeaders, FilesService, maxFileBytes } from './files.service';
import { UploadQueue } from './upload-queue';

function badName() {
  return new BadRequestException('Give the file a name of 1 to 200 characters');
}

function fileName(encoded: string | undefined) {
  let name: string;
  try {
    name = decodeURIComponent(encoded ?? '').trim();
  } catch {
    throw badName();
  }
  const cleaned = [...name]
    .map((character) => (character.charCodeAt(0) < 32 || '\u007f/\\'.includes(character) ? '_' : character))
    .join('');
  if (!cleaned || cleaned.length > 200) {
    throw badName();
  }
  return cleaned;
}

@Controller()
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly uploads: UploadQueue,
  ) {}

  @Post('spaces/:spaceId/files')
  @Scope('items:write')
  @RateLimit('upload', 200, 86_400)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Headers('x-file-name') name: string | undefined,
    @Req() request: Request,
  ) {
    if (request.is('application/json') || request.is('application/x-www-form-urlencoded')) {
      throw new BadRequestException('Send the file itself as the request body');
    }
    const cleanedName = fileName(name);
    return this.uploads.run(user.id, async () => this.files.upload(user.id, spaceId, cleanedName, await readBody(request, maxFileBytes, 'Files can be at most 25 MB')));
  }

  @Get('me/storage')
  @Scope('items:read')
  storage(@CurrentUser() user: AuthenticatedUser, @Query() query: SpaceQueryDto) {
    return this.files.storage(user.id, query.spaceId);
  }

  @Get('files/:id')
  @Scope('items:read')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.files.download(user.id, id);
    response.set(fileHeaders(file));
    return new StreamableFile(file.stream);
  }
}
