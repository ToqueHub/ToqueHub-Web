import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  PURCHASING_ADMIN_ROLES,
  PURCHASING_PERMISSIONS,
  PurchaseOrderPolicy,
} from './purchase-order.policy';

@Injectable()
export class PurchasingInstallationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PurchaseOrderPolicy,
  ) {}

  async install(organizationId: string, actor: AuthenticatedUser) {
    if (!PURCHASING_ADMIN_ROLES.has(actor.role))
      throw new ForbiddenException('Seul un administrateur peut installer Achats.');
    await this.ensurePermissions();
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization?.stocksInstalledAt)
      throw new BadRequestException('Le module Stocks doit être installé avant Achats.');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { purchasingInstalledAt: organization.purchasingInstalledAt ?? new Date() },
      });
      await tx.purchasingSettings.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      });
      await tx.purchasingOnboardingProgress.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.MODULE_PURCHASING_INSTALLED,
          entityType: 'Module',
          entityId: 'purchasing',
          entityName: 'Achats',
        },
      });
    });
  }

  async uninstall(organizationId: string, actor: AuthenticatedUser) {
    this.policy.assertPermission(actor, 'purchasing.manage');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { purchasingInstalledAt: null },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.MODULE_PURCHASING_UNINSTALLED,
          entityType: 'Module',
          entityId: 'purchasing',
          entityName: 'Achats',
        },
      });
    });
    return { installed: false };
  }

  private async ensurePermissions() {
    await this.prisma.permission.createMany({
      data: [...PURCHASING_PERMISSIONS],
      skipDuplicates: true,
    });
    const roles = await this.prisma.role.findMany({
      where: {
        name: {
          in: ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Utilisateur'],
        },
      },
    });
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: PURCHASING_PERMISSIONS.map((permission) => permission.key) } },
    });
    for (const role of roles) {
      const keys =
        role.name === 'Utilisateur'
          ? new Set(['purchasing.read', 'purchasing.draft'])
          : new Set(permissions.map((permission) => permission.key));
      await this.prisma.rolePermission.createMany({
        data: permissions
          .filter((permission) => keys.has(permission.key))
          .map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      });
    }
  }
}
