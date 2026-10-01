import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangeEmailDto, ProofDto, TwoStepCodeDto } from '../auth/dto/account.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionsService } from '../auth/sessions.service';
import { TwoStepService } from '../auth/two-step.service';
import { RateLimit } from '../redis/rate-limit.guard';
import { UuidPipe } from '../validation/uuid.pipe';
import { UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly twoStep: TwoStepService,
    private readonly sessions: SessionsService,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileDto) {
    return this.users.updateProfile(user.id, input);
  }

  @Delete()
  @HttpCode(204)
  @RateLimit('delete-account', 5, 3_600)
  async deleteAccount(@CurrentUser() user: AuthenticatedUser, @Body() input: ProofDto) {
    await this.auth.deleteAccount(user.id, input);
  }

  @Post('email')
  @HttpCode(204)
  @RateLimit('change-email', 5, 3_600)
  async changeEmail(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangeEmailDto) {
    await this.auth.requestEmailChange(user.id, input.email, input);
  }

  @Get('export')
  @RateLimit('export', 10, 3_600)
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.users.export(user.id);
  }

  @Get('two-step')
  twoStepStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.twoStep.status(user.id);
  }

  @Post('two-step/setup')
  @RateLimit('two-step-setup', 10, 3_600)
  async setUpTwoStep(@CurrentUser() user: AuthenticatedUser, @Body() input: ProofDto) {
    await this.auth.reauthenticate(user.id, input);
    return this.twoStep.setup(user.id);
  }

  @Post('two-step/confirm')
  @RateLimit('two-step-confirm', 10, 3_600)
  confirmTwoStep(@CurrentUser() user: AuthenticatedUser, @Body() input: TwoStepCodeDto) {
    return this.twoStep.confirm(user.id, input.code);
  }

  @Delete('two-step')
  @HttpCode(204)
  @RateLimit('two-step-disable', 10, 3_600)
  async disableTwoStep(@CurrentUser() user: AuthenticatedUser, @Body() input: ProofDto) {
    await this.auth.reauthenticate(user.id, input);
    await this.twoStep.disable(user.id);
  }

  @Post('two-step/recovery-codes')
  @RateLimit('recovery-codes', 10, 3_600)
  async regenerateRecoveryCodes(@CurrentUser() user: AuthenticatedUser, @Body() input: ProofDto) {
    await this.auth.reauthenticate(user.id, input);
    return this.twoStep.regenerateRecoveryCodes(user.id);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.list(user.id, user.sessionId);
  }

  @Delete('sessions')
  @HttpCode(204)
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    await this.sessions.revokeOthers(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id', UuidPipe) id: string) {
    await this.sessions.revoke(user.id, id);
  }
}
