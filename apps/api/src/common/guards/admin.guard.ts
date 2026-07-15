import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/authenticated-user';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'Administrateur']);

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !ADMIN_ROLES.has(user.role)) {
      throw new ForbiddenException('User management is restricted to administrators.');
    }

    return true;
  }
}
