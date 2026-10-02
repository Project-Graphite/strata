import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { scopeKey, tokenPrefix, type TokenScope } from '../access-tokens/scopes';
import { TokenAuthenticator } from '../access-tokens/token-authenticator';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenAuthenticator,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    if (!header.startsWith(`Bearer ${tokenPrefix}`)) {
      return (await super.canActivate(context)) as boolean;
    }
    const user = await this.tokens.authenticate(header.slice('Bearer '.length));
    if (!user) {
      throw new UnauthorizedException();
    }
    const scope = this.reflector.getAllAndOverride<TokenScope | undefined>(scopeKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) {
      throw new ForbiddenException('Access tokens cannot be used for this. Sign in instead.');
    }
    if (!user.scopes?.includes(scope)) {
      throw new ForbiddenException(`This token needs the ${scope} scope`);
    }
    request.user = user;
    return true;
  }
}
