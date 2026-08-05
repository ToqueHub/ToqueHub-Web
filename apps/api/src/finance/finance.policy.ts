import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';

export const FINANCE_PERMISSIONS = [
  { key: 'finance.read', description: 'Consulter le pilotage financier' },
  { key: 'finance.import', description: 'Importer des rapports comptables et de caisse' },
  { key: 'finance.budget', description: 'Créer et modifier les budgets financiers' },
  { key: 'finance.manage', description: 'Configurer les sources et les règles Finance' },
] as const;

export const FINANCE_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'Administrateur', 'ADMIN']);

@Injectable()
export class FinancePolicy {
  assertPermission(actor: Pick<AuthenticatedUser, 'role' | 'permissions'>, permission: string) {
    if (!FINANCE_ADMIN_ROLES.has(actor.role) && !actor.permissions.includes(permission)) {
      throw new ForbiddenException(`Permission requise : ${permission}`);
    }
  }

  effectivePermissions(actor: Pick<AuthenticatedUser, 'role' | 'permissions'>) {
    return FINANCE_ADMIN_ROLES.has(actor.role)
      ? FINANCE_PERMISSIONS.map(({ key }) => key)
      : actor.permissions.filter((permission) => permission.startsWith('finance.'));
  }
}
