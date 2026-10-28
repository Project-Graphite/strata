import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RedisService } from './redis.service';

interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
  perCookie?: { name: string; limit: number };
}

const rateLimitRule = 'rateLimitRule';
const writeRule: RateLimitRule = { bucket: 'writes', limit: 600, windowSeconds: 300 };
const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const RateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
  perCookie?: RateLimitRule['perCookie'],
) => SetMetadata(rateLimitRule, { bucket, limit, windowSeconds, perCookie });

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const rule =
      this.reflector.get<RateLimitRule | undefined>(rateLimitRule, context.getHandler()) ??
      (readMethods.has(request.method) ? undefined : writeRule);
    if (!rule) return true;
    const cookie = rule.perCookie && (request.cookies[rule.perCookie.name] as string | undefined);
    const retryAfter = Math.max(
      await this.hit(`rate:${rule.bucket}:${request.user?.id ?? request.ip}`, rule.limit, rule.windowSeconds),
      rule.perCookie && cookie
        ? await this.hit(
            `rate:${rule.bucket}:cookie:${createHash('sha256').update(cookie).digest('hex')}`,
            rule.perCookie.limit,
            rule.windowSeconds,
          )
        : 0,
    );
    if (retryAfter > 0) {
      http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private async hit(key: string, limit: number, windowSeconds: number) {
    const window = this.countInMemory(key, windowSeconds);
    const stored = await this.redis.run(async (client) => {
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, windowSeconds);
      }
      return current > limit ? Math.max(await client.ttl(key), 1) : 0;
    });
    return Math.max(
      window.count > limit ? Math.ceil((window.resetAt - Date.now()) / 1000) : 0,
      stored ?? 0,
    );
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
      const fresh = { count: 1, resetAt: now + windowSeconds * 1000 };
      this.memory.set(key, fresh);
      return fresh;
    }
    window.count += 1;
    return window;
  }
}
