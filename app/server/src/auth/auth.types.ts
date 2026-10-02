import type { Request } from 'express';
import type { TokenScope } from '../access-tokens/scopes';

export interface AuthenticatedUser {
  id: string;
  sessionId: string | null;
  isAdmin: boolean;
  isSystemManager: boolean;
  scopes: TokenScope[] | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
