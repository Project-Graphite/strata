import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../redis/redis.service';

const maxFailures = 10;
const lockSeconds = 15 * 60;

@Injectable()
export class SignInAttemptsService {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  async assertAllowed(email: string) {
    const key = this.key(email);
    const stored = Number((await this.redis.run((client) => client.get(key))) ?? 0);
    if (Math.max(stored, this.remembered(key)) >= maxFailures) {
      throw new HttpException('Too many failed sign-ins for this account. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async failed(email: string) {
    const key = this.key(email);
    await this.redis.run(async (client) => {
      await client.incr(key);
      await client.expire(key, lockSeconds);
    });
    const now = Date.now();
    if (this.memory.size > 10_000) {
      for (const [candidate, window] of this.memory) {
        if (window.resetAt <= now) this.memory.delete(candidate);
      }
    }
    this.memory.set(key, { count: this.remembered(key) + 1, resetAt: now + lockSeconds * 1000 });
  }

  async clear(email: string) {
    const key = this.key(email);
    await this.redis.run((client) => client.del(key));
    this.memory.delete(key);
  }

  private remembered(key: string) {
    const window = this.memory.get(key);
    return window && window.resetAt > Date.now() ? window.count : 0;
  }

  private key(email: string) {
    return `sign-in-failures:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`;
  }
}
