import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';

type PurchasingActor = Pick<AuthenticatedUser, 'id' | 'role' | 'permissions'>;

export const PURCHASING_PERMISSIONS = [
  { key: 'purchasing.read', description: 'Consulter les achats' },
  { key: 'purchasing.draft', description: 'Créer et modifier ses commandes non envoyées' },
  { key: 'purchasing.write', description: 'Modifier toutes les commandes d’achat' },
  { key: 'purchasing.send', description: 'Envoyer les commandes fournisseurs' },
  { key: 'purchasing.receive', description: 'Valider les réceptions fournisseurs' },
  { key: 'purchasing.manage', description: 'Configurer les achats et l’envoi Resend' },
] as const;

export const PURCHASING_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'Administrateur', 'ADMIN']);

const TRANSITIONS: Readonly<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> = {
  DRAFT: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED],
  SENT: [PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.CANCELLED],
  ACKNOWLEDGED: [
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CANCELLED,
  ],
  PARTIALLY_RECEIVED: [
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CLOSED,
  ],
  RECEIVED: [],
  CLOSED: [],
  CANCELLED: [],
};

@Injectable()
export class PurchaseOrderPolicy {
  assertPermission(actor: Pick<AuthenticatedUser, 'role' | 'permissions'>, permission: string) {
    if (!PURCHASING_ADMIN_ROLES.has(actor.role) && !actor.permissions.includes(permission))
      throw new ForbiddenException(`Permission requise : ${permission}`);
  }

  effectivePermissions(actor: Pick<AuthenticatedUser, 'role' | 'permissions'>) {
    return PURCHASING_ADMIN_ROLES.has(actor.role)
      ? PURCHASING_PERMISSIONS.map(({ key }) => key)
      : actor.permissions.filter((permission) => permission.startsWith('purchasing.'));
  }

  orderVisibility(actor: PurchasingActor): Prisma.PurchaseOrderWhereInput {
    if (PURCHASING_ADMIN_ROLES.has(actor.role) || actor.permissions.includes('purchasing.write'))
      return {};
    return { OR: [{ status: { not: PurchaseOrderStatus.DRAFT } }, { createdById: actor.id }] };
  }

  assertDraftOwner(actor: PurchasingActor, order: { createdById: string }) {
    this.assertPermission(
      actor,
      order.createdById === actor.id ? 'purchasing.draft' : 'purchasing.write',
    );
  }

  assertMutable(status: PurchaseOrderStatus) {
    if (status !== PurchaseOrderStatus.DRAFT)
      throw new BadRequestException(
        'Une commande envoyée ne peut plus être modifiée. Dupliquez-la pour créer une nouvelle commande.',
      );
  }

  assertTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus) {
    if (!TRANSITIONS[from].includes(to))
      throw new BadRequestException(`Transition de commande interdite : ${from} → ${to}.`);
  }

  canTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus) {
    return TRANSITIONS[from].includes(to);
  }
}
