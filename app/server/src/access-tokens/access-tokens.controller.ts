import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { AccessTokensService } from './access-tokens.service';
import { CreateAccessTokenDto } from './dto/access-tokens.dto';

@Controller('me/tokens')
@UseGuards(JwtAuthGuard)
export class AccessTokensController {
  constructor(private readonly tokens: AccessTokensService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tokens.list(user.id);
  }

  @Post()
  @RateLimit('create-token', 20, 3_600)
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAccessTokenDto) {
    return this.tokens.create(user.id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.tokens.revoke(user.id, id);
  }
}
