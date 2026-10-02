import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { FilesService, maxFileBytes } from './files.service';

function tooLarge() {
  return new PayloadTooLargeException('Files can be at most 25 MB');
}

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

async function readBody(request: Request) {
  if (Number(request.headers['content-length'] ?? 0) > maxFileBytes) {
    throw tooLarge();
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxFileBytes) {
      request.destroy();
      throw tooLarge();
    }
    chunks.push(chunk as Buffer);
  }
  if (size === 0) {
    throw new BadRequestException('The file is empty');
  }
  return Buffer.concat(chunks);
}

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('spaces/:spaceId/files')
  @Scope('items:write')
  @RateLimit('upload', 200, 86_400)
  @UseGuards(JwtAuthGuard)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Headers('x-file-name') name: string | undefined,
    @Req() request: Request,
  ) {
    if (request.is('application/json') || request.is('application/x-www-form-urlencoded')) {
      throw new BadRequestException('Send the file itself as the request body');
    }
    return this.files.upload(user.id, spaceId, fileName(name), await readBody(request));
  }

  @Get('files/:id')
  @Scope('items:read')
  @UseGuards(JwtAuthGuard)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.files.download(user.id, id);
    response.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.stream);
  }
}
