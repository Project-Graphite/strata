import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './auth.types';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('AUTH_ACCESS_TOKEN_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const session = payload.sid
      ? await this.prisma.refreshSession.findUnique({
          where: { id: payload.sid },
          select: { userId: true, signedInAt: true, revokedAt: true, user: { select: { isActive: true, role: true } } },
        })
      : null;
    if (!session || session.userId !== payload.sub || !session.user.isActive) {
      throw new UnauthorizedException();
    }
    if (
      session.revokedAt &&
      !(await this.prisma.refreshSession.count({
        where: { userId: session.userId, signedInAt: session.signedInAt, revokedAt: null, expiresAt: { gt: new Date() } },
      }))
    ) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      sessionId: payload.sid,
      isAdmin: session.user.role !== UserRole.MEMBER,
      isSystemManager: session.user.role === UserRole.SYSTEM_MANAGER,
      scopes: null,
    };
  }
}
