import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest<AuthenticatedRequest>().user.isAdmin) {
      throw new ForbiddenException('Only admins can do this');
    }
    return true;
  }
}
