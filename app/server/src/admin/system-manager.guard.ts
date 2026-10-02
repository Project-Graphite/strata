import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class SystemManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest<AuthenticatedRequest>().user.isSystemManager) {
      throw new ForbiddenException('Only the system manager can do this');
    }
    return true;
  }
}
