import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from '../src/crypto/secret-box.service';
import { openSuggestion, sealSuggestion } from '../src/spending/capture/sealed-suggestion';

const box = new SecretBox(new ConfigService({ DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64') }));
const suggestion = {
  direction: 'spent' as const,
  amountMinor: 25_000,
  currency: 'EGP',
  merchant: 'CARREFOUR MAADI',
  cardDigits: '1234',
  accountId: 'account-id',
  availableMinor: 975_000,
  title: 'Carrefour',
  category: null,
};

describe('capture suggestions at rest', () => {
  it('stores a new suggestion sealed and reads it back whole', () => {
    const stored = sealSuggestion(box, suggestion);

    expect(Object.keys(stored)).toEqual(['sealed']);
    expect(stored.sealed).toMatch(/^v1:/);
    expect(JSON.stringify(stored)).not.toContain('CARREFOUR');
    expect(JSON.stringify(stored)).not.toContain('1234');
    expect(openSuggestion(box, stored)).toEqual(suggestion);
  });

  it('still reads legacy rows stored in clear', () => {
    expect(openSuggestion(box, suggestion)).toEqual(suggestion);
    expect(openSuggestion(box, {})).toEqual({});
  });

  it('refuses a sealed suggestion from another key', () => {
    const other = new SecretBox(new ConfigService({ DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64') }));
    expect(() => openSuggestion(box, sealSuggestion(other, suggestion))).toThrow();
  });
});
