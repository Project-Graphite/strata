import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify<string, Buffer, number, ScryptOptions, Buffer>(scrypt);
const scryptCost = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  async hash(password: string) {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 64, scryptCost);
    const { N, r, p } = scryptCost;
    return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  async verify(password: string, encoded: string) {
    const [scheme, N, r, p, saltHex, keyHex] = encoded.split('$');
    if (scheme !== 'scrypt' || !N || !r || !p || !saltHex || !keyHex) {
      return false;
    }
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: scryptCost.maxmem,
    });
    return timingSafeEqual(expected, actual);
  }

  async assertNotBreached(password: string) {
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    let body: string;
    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.text();
    } catch (error) {
      this.logger.warn(
        `The breached password check is unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return;
    }
    const breached = body.split('\n').some((line) => {
      const [suffix, count] = line.trim().split(':');
      return suffix === digest.slice(5) && Number(count) > 0;
    });
    if (breached) {
      throw new BadRequestException(
        'This password has appeared in a data breach, so it is easy to guess. Choose a different one.',
      );
    }
  }
}
