import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { DashboardsService } from './dashboards.service';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboards.dto';

@Controller('me/dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @Scope('account:read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboards.list(user.id);
  }

  @Post()
  @Scope('account:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateDashboardDto) {
    return this.dashboards.create(user.id, input);
  }

  @Patch(':id')
  @Scope('account:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateDashboardDto) {
    return this.dashboards.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @Scope('account:write')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.dashboards.remove(user.id, id);
  }
}
