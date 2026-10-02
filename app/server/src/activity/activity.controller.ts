import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PageDto } from '../validation/page.dto';
import { UuidPipe } from '../validation/uuid.pipe';
import { ActivityService } from './activity.service';

@Controller('spaces/:spaceId/activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @Scope('spaces:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId', UuidPipe) spaceId: string,
    @Query() query: PageDto,
  ) {
    return this.activity.list(user.id, spaceId, query.page);
  }
}
