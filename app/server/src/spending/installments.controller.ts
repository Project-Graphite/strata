import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UuidPipe } from '../validation/uuid.pipe';
import { CreateInstallmentDto, UpdateInstallmentDto } from './dto/installments.dto';
import { InstallmentsService } from './installments.service';

@Controller()
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get('spaces/:spaceId/installments')
  @Scope('items:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string) {
    return this.installments.list(user.id, spaceId);
  }

  @Post('spaces/:spaceId/installments')
  @Scope('items:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId', UuidPipe) spaceId: string, @Body() input: CreateInstallmentDto) {
    return this.installments.create(user.id, spaceId, input);
  }

  @Patch('installments/:id')
  @Scope('items:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string, @Body() input: UpdateInstallmentDto) {
    return this.installments.update(user.id, id, input);
  }

  @Post('installments/:id/paid')
  @Scope('items:write')
  @HttpCode(200)
  paid(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    return this.installments.paid(user.id, id);
  }

  @Delete('installments/:id')
  @Scope('items:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.installments.remove(user.id, id);
  }
}
