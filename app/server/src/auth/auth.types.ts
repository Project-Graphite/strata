import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  isAdmin: boolean;
  isSystemManager: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
