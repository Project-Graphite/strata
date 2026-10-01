import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { RateLimit } from '../redis/rate-limit.guard';
import { AuthService, refreshLifetimeMs } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { deviceHash, deviceLabel, newDeviceId, type Device } from './device';
import { ChangePasswordDto, CompleteSignInDto, EmailDto, ResetPasswordDto } from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const refreshCookie = 'strata_refresh';
const deviceCookie = 'strata_device';
const deviceLifetimeMs = 400 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @RateLimit('register', 5, 3_600)
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('verify-email')
  @RateLimit('verify-email', 20, 3_600)
  verifyEmail(@Body() input: VerifyEmailDto) {
    return this.auth.verifyEmail(input.token);
  }

  @Post('resend-verification')
  @HttpCode(204)
  @RateLimit('resend-verification', 5, 3_600)
  async resendVerification(@Body() input: EmailDto) {
    await this.auth.resendVerification(input.email);
  }

  @Post('forgot-password')
  @HttpCode(204)
  @RateLimit('forgot-password', 5, 3_600)
  async forgotPassword(@Body() input: EmailDto) {
    await this.auth.requestPasswordReset(input.email);
  }

  @Post('reset-password')
  @HttpCode(204)
  @RateLimit('reset-password', 10, 3_600)
  async resetPassword(@Body() input: ResetPasswordDto) {
    await this.auth.resetPassword(input.token, input.password);
  }

  @Post('login')
  @RateLimit('login', 10, 900)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(input, this.device(request, response));
    if ('challenge' in result) {
      return { twoStep: true, challenge: result.challenge };
    }
    this.setRefreshCookie(response, result.session.refreshToken);
    return { accessToken: result.session.accessToken, user: result.session.user };
  }

  @Post('two-step')
  @RateLimit('two-step', 10, 900)
  async completeTwoStep(
    @Body() input: CompleteSignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.completeTwoStep(input.challenge, input.code, this.device(request, response));
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  @RateLimit('change-password', 10, 3_600)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const session = await this.auth.changePassword(
      user.id,
      { password: input.currentPassword, code: input.code },
      input.newPassword,
      this.device(request, response),
    );
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('refresh')
  @RateLimit('refresh', 60, 900)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const token = request.cookies[refreshCookie] as string | undefined;
    if (!token) {
      throw new UnauthorizedException();
    }
    const session = await this.auth.refresh(token);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    await this.auth.logout(request.cookies[refreshCookie] as string | undefined);
    response.clearCookie(refreshCookie, { path: '/api/v1/auth' });
    return { loggedOut: true };
  }

  private device(request: Request, response: Response): Device {
    let id = request.cookies[deviceCookie] as string | undefined;
    if (!id || !/^[\w-]{43}$/.test(id)) {
      id = newDeviceId();
      response.cookie(deviceCookie, id, {
        httpOnly: true,
        maxAge: deviceLifetimeMs,
        path: '/api/v1/auth',
        sameSite: 'strict',
        secure: this.config.get('NODE_ENV') === 'production',
      });
    }
    return { hash: deviceHash(id), label: deviceLabel(request.headers['user-agent']) };
  }

  private setRefreshCookie(response: Response, token: string) {
    response.cookie(refreshCookie, token, {
      httpOnly: true,
      maxAge: refreshLifetimeMs,
      path: '/api/v1/auth',
      sameSite: 'strict',
      secure: this.config.get('NODE_ENV') === 'production',
    });
  }

  private assertTrustedOrigin(request: Request) {
    const trusted = new Set(
      this.config.get<string>('AUTH_TRUSTED_ORIGINS')?.split(',') ?? [],
    );
    if (!request.headers.origin || !trusted.has(request.headers.origin)) {
      throw new UnauthorizedException('Request origin is not trusted');
    }
  }
}
