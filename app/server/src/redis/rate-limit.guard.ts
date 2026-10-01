import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RedisService } from './redis.service';

interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

const rateLimitRule = 'rateLimitRule';

export const RateLimit = (bucket: string, limit: number, windowSeconds: number) =>
  applyDecorators(
    SetMetadata(rateLimitRule, { bucket, limit, windowSeconds }),
    UseGuards(RateLimitGuard),
  );

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const rule = this.reflector.get<RateLimitRule>(rateLimitRule, context.getHandler());
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const key = `rate:${rule.bucket}:${request.user?.id ?? request.ip}`;
    const count = Math.max(
      this.countInMemory(key, rule.windowSeconds),
      (await this.redis.run(async (client) => {
        const current = await client.incr(key);
        if (current === 1) {
          await client.expire(key, rule.windowSeconds);
        }
        return current;
      })) ?? 0,
    );
    if (count > rule.limit) {
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private countInMemory(key: string, windowSeconds: number) {
    const now = Date.now();
    if (this.memory.size > 10_000) {
      for (const [candidate, window] of this.memory) {
        if (window.resetAt <= now) this.memory.delete(candidate);
      }
    }
    const window = this.memory.get(key);
    if (!window || window.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return 1;
    }
    window.count += 1;
    return window.count;
  }
}
