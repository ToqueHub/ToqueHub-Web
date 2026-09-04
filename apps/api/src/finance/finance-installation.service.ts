import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction, FinanceProvider, FinanceSourceType } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { FINANCE_ADMIN_ROLES, FINANCE_PERMISSIONS, FinancePolicy } from './finance.policy';

@Injectable()
export class FinanceInstallationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
  ) {}

  async install(organizationId: string, actor: AuthenticatedUser) {
    if (!FINANCE_ADMIN_ROLES.has(actor.role)) {
      throw new ForbiddenException('Seul un administrateur peut installer Finance.');
    }
    await this.ensurePermissions();
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        financeInstalledAt: true,
        primarySiteId: true,
        sites: {
          where: { isArchived: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
          take: 1,
        },
      },
    });
    const defaultSiteId = organization?.primarySiteId ?? organization?.sites[0]?.id ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { financeInstalledAt: organization?.financeInstalledAt ?? new Date() },
      });
      await tx.financeSettings.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      });
      await Promise.all([
        tx.financeDataSource.upsert({
          where: {
            organizationId_provider_name: {
              organizationId,
              provider: FinanceProvider.FENNOA,
              name: 'Fennoa',
            },
          },
          update: {},
          create: {
            organizationId,
            provider: FinanceProvider.FENNOA,
            name: 'Fennoa',
            sourceType: FinanceSourceType.ACCOUNTING_API,
          },
        }),
        tx.financeDataSource.upsert({
          where: {
            organizationId_provider_name: {
              organizationId,
              provider: FinanceProvider.FLATPAY,
              name: 'FlatPay POS',
            },
          },
          update: {},
          create: {
            organizationId,
            siteId: defaultSiteId,
            provider: FinanceProvider.FLATPAY,
            name: 'FlatPay POS',
            sourceType: FinanceSourceType.FILE_IMPORT,
            isPrimarySales: true,
            isPrimaryPos: true,
          },
        }),
        tx.financeDataSource.upsert({
          where: {
            organizationId_provider_name: {
              organizationId,
              provider: FinanceProvider.LOYVERSE,
              name: 'Loyverse',
            },
          },
          update: { siteId: defaultSiteId },
          create: {
            organizationId,
            siteId: defaultSiteId,
            provider: FinanceProvider.LOYVERSE,
            name: 'Loyverse',
            sourceType: FinanceSourceType.POS_API,
            isPrimarySales: true,
          },
        }),
        tx.financeDataSource.upsert({
          where: {
            organizationId_provider_name: {
              organizationId,
              provider: FinanceProvider.PAYPAL_POS,
              name: 'PayPal POS',
            },
          },
          update: { siteId: defaultSiteId },
          create: {
            organizationId,
            siteId: defaultSiteId,
            provider: FinanceProvider.PAYPAL_POS,
            name: 'PayPal POS',
            sourceType: FinanceSourceType.POS_API,
            isPrimarySales: true,
          },
        }),
        tx.financeDataSource.upsert({
          where: {
            organizationId_provider_name: {
              organizationId,
              provider: FinanceProvider.GENERIC,
              name: 'Import universel',
            },
          },
          update: {},
          create: {
            organizationId,
            provider: FinanceProvider.GENERIC,
            name: 'Import universel',
            sourceType: FinanceSourceType.FILE_IMPORT,
          },
        }),
      ]);
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.MODULE_FINANCE_INSTALLED,
          entityType: 'Module',
          entityId: 'finance',
          entityName: 'Finance',
        },
      });
    });
  }

  async uninstall(organizationId: string, actor: AuthenticatedUser) {
    this.policy.assertPermission(actor, 'finance.manage');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { financeInstalledAt: null },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.MODULE_FINANCE_UNINSTALLED,
          entityType: 'Module',
          entityId: 'finance',
          entityName: 'Finance',
        },
      });
    });
    return { installed: false };
  }

  private async ensurePermissions() {
    await this.prisma.permission.createMany({
      data: [...FINANCE_PERMISSIONS],
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
      where: { key: { in: FINANCE_PERMISSIONS.map(({ key }) => key) } },
    });
    for (const role of roles) {
      const allowed =
        role.name === 'Utilisateur'
          ? new Set(['finance.read'])
          : new Set(permissions.map(({ key }) => key));
      await this.prisma.rolePermission.createMany({
        data: permissions
          .filter(({ key }) => allowed.has(key))
          .map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      });
    }
  }
}
