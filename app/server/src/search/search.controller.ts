import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { SearchDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Scope('items:read')
  @RateLimit('search', 600, 3_600)
  @UseGuards(JwtAuthGuard)
  find(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchDto) {
    return this.search.search(user.id, query.q);
  }
}
