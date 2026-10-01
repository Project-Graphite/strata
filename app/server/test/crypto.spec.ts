import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { matchingStep, newTotpSecret, otpauthUri, totpCode } from '../src/auth/totp';
import { SecretBox } from '../src/crypto/secret-box.service';

const rfcVector = 'GEZDGNBVGY3TQOJQ'.repeat(2);

describe('SecretBox', () => {
  const box = new SecretBox(new ConfigService({ DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64') }));

  it('round-trips a value and never stores it in the clear', () => {
    const sealed = box.seal('authenticator secret');

    expect(sealed).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(sealed).not.toContain('authenticator');
    expect(box.open(sealed)).toBe('authenticator secret');
    expect(box.seal('authenticator secret')).not.toBe(sealed);
  });

  it('refuses a tampered value and one sealed with another key', () => {
    const sealed = box.seal('authenticator secret');
    const [prefix, iv, tag, data] = sealed.split(':');
    const flipped = Buffer.from(data!, 'base64url');
    flipped[0]! ^= 1;

    expect(() => box.open([prefix, iv, tag, flipped.toString('base64url')].join(':'))).toThrow();
    const other = new SecretBox(new ConfigService({ DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64') }));
    expect(() => other.open(sealed)).toThrow();
    expect(() => box.open('v2:a:b:c')).toThrow('unknown format');
  });
});

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    expect(totpCode(rfcVector, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(rfcVector, Math.floor(1_111_111_109 / 30))).toBe('081804');
    expect(totpCode(rfcVector, Math.floor(1_234_567_890 / 30))).toBe('005924');
    expect(totpCode(rfcVector, Math.floor(2_000_000_000 / 30))).toBe('279037');
  });

  it('accepts the current code and one step either side, and nothing further', () => {
    const now = 1_234_567_890_000;
    const step = Math.floor(now / 30_000);

    expect(matchingStep(rfcVector, totpCode(rfcVector, step), now)).toBe(step);
    expect(matchingStep(rfcVector, totpCode(rfcVector, step - 1), now)).toBe(step - 1);
    expect(matchingStep(rfcVector, totpCode(rfcVector, step + 1), now)).toBe(step + 1);
    expect(matchingStep(rfcVector, totpCode(rfcVector, step + 2), now)).toBeNull();
    expect(matchingStep(rfcVector, '12345', now)).toBeNull();
  });

  it('creates 160-bit secrets and an authenticator link naming Strata', () => {
    const secret = newTotpSecret();

    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = new URL(otpauthUri(secret, 'amr@example.com'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/Strata:amr@example.com');
    expect(uri.searchParams.get('secret')).toBe(secret);
    expect(uri.searchParams.get('issuer')).toBe('Strata');
  });
});
