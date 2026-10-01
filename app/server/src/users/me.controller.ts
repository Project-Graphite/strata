import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangeEmailDto, ConfirmPasswordDto } from '../auth/dto/account.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
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
  async deleteAccount(@CurrentUser() user: AuthenticatedUser, @Body() input: ConfirmPasswordDto) {
    await this.auth.deleteAccount(user.id, input.password);
  }

  @Post('email')
  @HttpCode(204)
  @RateLimit('change-email', 5, 3_600)
  async changeEmail(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangeEmailDto) {
    await this.auth.requestEmailChange(user.id, input.email, input.password);
  }

  @Get('export')
  @RateLimit('export', 10, 3_600)
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.users.export(user.id);
  }
}
