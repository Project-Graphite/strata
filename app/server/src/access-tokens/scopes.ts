import { SetMetadata } from '@nestjs/common';

export const tokenScopes = ['spaces:read', 'items:read', 'items:write'] as const;

export type TokenScope = (typeof tokenScopes)[number];

export const tokenPrefix = 'strata_pat_';

export const scopeKey = 'tokenScope';

export const Scope = (scope: TokenScope) => SetMetadata(scopeKey, scope);
