import { Controller, Post, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { WeeklyReviewService } from './weekly-review.service';

@Controller('me/weekly-review')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly reviews: WeeklyReviewService) {}

  @Post()
  @Scope('items:write')
  @RateLimit('weekly-review', 20, 3_600)
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.reviews.create(user.id);
  }
}
