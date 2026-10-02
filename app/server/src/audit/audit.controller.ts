import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PageDto } from '../validation/page.dto';
import { AuditService } from './audit.service';

@Controller('me/audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PageDto) {
    return this.audit.list(user.id, query.page);
  }
}
