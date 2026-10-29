import { Prisma } from '@prisma/client';
import { SecretBox } from '../../crypto/secret-box.service';
import type { Suggestion } from './capture.service';

export function sealSuggestion(box: SecretBox, suggestion: Suggestion | Prisma.JsonValue) {
  return { sealed: box.seal(JSON.stringify(suggestion)) };
}

export function openSuggestion(box: SecretBox, stored: Prisma.JsonValue) {
  const { sealed } = stored as { sealed?: unknown };
  return (typeof sealed === 'string' ? JSON.parse(box.open(sealed)) : stored) as Suggestion;
}
