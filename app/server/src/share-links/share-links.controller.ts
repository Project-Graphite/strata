import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { LinkCodeDto } from '../validation/link-code.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateShareLinkDto } from './dto/share-links.dto';
import { ShareLinksService } from './share-links.service';

@Controller()
export class ShareLinksController {
  constructor(private readonly shareLinks: ShareLinksService) {}

  @Post('items/:id/share-links')
  @RateLimit('share-link', 100, 86_400)
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: CreateShareLinkDto) {
    return this.shareLinks.create(user.id, id, input);
  }

  @Get('items/:id/share-links')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.shareLinks.list(user.id, id);
  }

  @Delete('items/:id/share-links/:linkId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
    @Param('linkId', UuidPipe) linkId: string,
  ) {
    await this.shareLinks.revoke(user.id, id, linkId);
  }

  @Get('share/:code')
  @RateLimit('share-open', 120, 3_600)
  open(@Param() input: LinkCodeDto) {
    return this.shareLinks.open(input.code);
  }
}
