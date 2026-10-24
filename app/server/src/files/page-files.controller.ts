import { Controller, Get, NotFoundException, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { documentLinks } from '../notes/document-text';
import { PageAccessService } from '../notes/page-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UuidPipe } from '../validation/uuid.pipe';
import { fileHeaders, FilesService } from './files.service';

@Controller('notes/:id/files')
@UseGuards(JwtAuthGuard)
export class PageFilesController {
  constructor(private readonly files: FilesService, private readonly prisma: PrismaService, private readonly pages: PageAccessService, private readonly realtime: RealtimeService) {}

  @Get(':fileId')
  @Scope('items:read')
  async download(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Param('fileId', UuidPipe) fileId: string, @Res({ passthrough: true }) response: Response) {
    const page = await this.pages.assertPage(user.id, id, 'read');
    const document = this.realtime.hocuspocus.documents.get(id);
    if (document ? !documentLinks(document).files.has(fileId) : !await this.prisma.itemLink.findFirst({ where: { sourceItemId: id, targetItemId: fileId, kind: 'ATTACHMENT' }, select: { id: true } })) throw new NotFoundException('That file is not attached to this page');
    if (!await this.prisma.item.findFirst({ where: { id: fileId, spaceId: page.spaceId, kind: 'FILE', trashedAt: null }, select: { id: true } })) throw new NotFoundException('That file is not attached to this page');
    const file = await this.files.read(fileId);
    response.set(fileHeaders(file));
    return new StreamableFile(file.stream);
  }
}
