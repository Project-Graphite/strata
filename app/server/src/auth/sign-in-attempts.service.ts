import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../redis/redis.service';

const maxFailures = 10;
const maxAccountFailures = 100;
const lockSeconds = 15 * 60;
const accountField = 'account';

@Injectable()
export class SignInAttemptsService {
  private readonly memory = new Map<string, { counts: Record<string, number>; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  async assertAllowed(email: string, address?: string) {
    const key = this.key(email);
    const field = this.field(address);
    const [stored, storedForAccount] = (await this.redis.run((client) => client.hmGet(key, [field, accountField]))) ?? [];
    const remembered = this.remembered(key);
    if (
      Math.max(Number(stored ?? 0), remembered[field] ?? 0) >= maxFailures ||
      Math.max(Number(storedForAccount ?? 0), remembered[accountField] ?? 0) >= maxAccountFailures
    ) {
      throw new HttpException('Too many failed sign-ins for this account. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async failed(email: string, address?: string) {
    const key = this.key(email);
    const field = this.field(address);
    await this.redis.run(async (client) => {
      await client.hIncrBy(key, field, 1);
      await client.hIncrBy(key, accountField, 1);
      await client.expire(key, lockSeconds);
    });
    const now = Date.now();
    if (this.memory.size > 10_000) {
      for (const [candidate, window] of this.memory) {
        if (window.resetAt <= now) this.memory.delete(candidate);
      }
    }
    const counts = this.remembered(key);
    this.memory.set(key, {
      counts: { ...counts, [field]: (counts[field] ?? 0) + 1, [accountField]: (counts[accountField] ?? 0) + 1 },
      resetAt: now + lockSeconds * 1000,
    });
  }

  async clear(email: string) {
    const key = this.key(email);
    await this.redis.run((client) => client.del(key));
    this.memory.delete(key);
  }

  private remembered(key: string): Record<string, number> {
    const window = this.memory.get(key);
    return window && window.resetAt > Date.now() ? window.counts : {};
  }

  private key(email: string) {
    return `sign-in-attempts:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`;
  }

  private field(address?: string) {
    return `address:${address ?? 'unknown'}`;
  }
}
