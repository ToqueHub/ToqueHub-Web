import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';

export type PlanningActor = Pick<AuthenticatedUser, 'id' | 'role'> & {
  permissions?: string[];
  employeeId?: string | null;
};

const isSuperAdmin = (user: Pick<AuthenticatedUser, 'role'>) => user.role === 'SUPER_ADMIN';
const legacyWriteRoles = new Set(['Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable']);

export const hasPlanningPermission = (
  user: Pick<AuthenticatedUser, 'role'> & { permissions?: string[] },
  permission: 'planning.read' | 'planning.write',
) => isSuperAdmin(user)
  || user.permissions?.includes(permission) === true
  || (permission === 'planning.read' && user.permissions?.includes('planning.write') === true)
  || (user.permissions === undefined && legacyWriteRoles.has(user.role));

export function assertPlanningRead(user: Pick<AuthenticatedUser, 'role'> & { permissions?: string[] }) {
  if (!hasPlanningPermission(user, 'planning.read')) {
    throw new ForbiddenException('Planning read access is required');
  }
}

export function assertPlanningWrite(user: Pick<AuthenticatedUser, 'role'> & { permissions?: string[] }) {
  if (!hasPlanningPermission(user, 'planning.write')) {
    throw new ForbiddenException('Planning write access is required');
  }
}

@Injectable()
export class PlanningReadGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
    assertPlanningRead(user);
    return true;
  }
}

@Injectable()
export class PlanningWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
    assertPlanningWrite(user);
    return true;
  }
}
