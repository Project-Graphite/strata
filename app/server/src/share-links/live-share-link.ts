import type { Prisma } from '@prisma/client';
import { linkTokenHash } from '../crypto/link-token';

export function unexpiredLink(): Prisma.ShareLinkWhereInput {
  return { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

export function liveShareLink(code: string): Prisma.ShareLinkWhereInput {
  return { AND: [unexpiredLink(), { OR: [{ tokenHash: linkTokenHash(code) }, { slug: code.toLowerCase() }] }] };
}
