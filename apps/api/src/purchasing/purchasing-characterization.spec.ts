import { PurchasingDeliveryMode } from '@prisma/client';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchasingDeliveryService } from './purchasing-delivery.service';
import { PurchasingInstallationService } from './purchasing-installation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PurchasingContextService } from './purchasing-context.service';
import { PurchaseOrderCommandService } from './purchase-order-command.service';

function installationService(prisma: unknown = {}) {
  const database = prisma as PrismaService;
  const policy = new PurchaseOrderPolicy();
  return new PurchasingInstallationService(database, policy);
}

function commandService(prisma: unknown = {}) {
  const database = prisma as PrismaService;
  const policy = new PurchaseOrderPolicy();
  return new PurchaseOrderCommandService(
    database,
    new PurchasingContextService(database),
    policy,
    new PurchasingDeliveryService(),
    {} as never,
    {} as never,
  );
}

describe('Purchasing delivery and permission rules', () => {
  it('exposes every Purchasing permission to a SUPER_ADMIN even before role seeding', () => {
    const permissions = new PurchaseOrderPolicy().effectivePermissions({
      role: 'SUPER_ADMIN',
      permissions: [],
    });

    expect(permissions).toEqual([
      'purchasing.read',
      'purchasing.draft',
      'purchasing.write',
      'purchasing.send',
      'purchasing.receive',
      'purchasing.manage',
    ]);
  });

  it('applies lead time and the supplier cutoff in its timezone', () => {
    const dates = new PurchasingDeliveryService().options(
      {
        deliveryMode: PurchasingDeliveryMode.ON_DEMAND,
        deliveryWeekdays: [],
        cutoffTime: '09:00',
        timezone: 'UTC',
        leadTimeDays: 2,
      },
      new Date('2026-07-13T10:00:00.000Z'),
      3,
    );

    expect(dates).toEqual(['2026-07-16', '2026-07-17', '2026-07-18']);
  });

  it('only proposes configured weekdays for scheduled suppliers', () => {
    const dates = new PurchasingDeliveryService().options(
      {
        deliveryMode: PurchasingDeliveryMode.SCHEDULED_DAYS,
        deliveryWeekdays: [3, 5],
        cutoffTime: null,
        timezone: 'Europe/Helsinki',
        leadTimeDays: 1,
      },
      new Date('2026-07-13T07:00:00.000Z'),
      4,
    );

    expect(dates).toEqual(['2026-07-15', '2026-07-17', '2026-07-22', '2026-07-24']);
  });

  it('returns no delivery date and rejects orders for an in-store supplier', () => {
    const delivery = new PurchasingDeliveryService();
    const profile = {
      deliveryMode: PurchasingDeliveryMode.NO_DELIVERY,
      deliveryWeekdays: [],
      cutoffTime: null,
      timezone: 'Europe/Helsinki',
      leadTimeDays: 0,
      orderingEnabled: false,
    };

    expect(delivery.options(profile, new Date('2026-08-01T12:00:00.000Z'))).toEqual([]);
    expect(() => delivery.assertOrderable(profile)).toThrow('achats sur place');
  });

  it('keeps another user draft outside a standard user query', () => {
    const visibility = new PurchaseOrderPolicy().orderVisibility({
      id: 'user-1',
      role: 'Utilisateur',
      permissions: ['purchasing.read', 'purchasing.draft'],
    });
    expect(visibility).toEqual({ OR: [{ status: { not: 'DRAFT' } }, { createdById: 'user-1' }] });
    expect(
      new PurchaseOrderPolicy().orderVisibility({
        id: 'manager-1',
        role: 'Manager',
        permissions: ['purchasing.write'],
      }),
    ).toEqual({});
  });
});

describe('Purchasing installation safeguards', () => {
  it('refuses installation when Stocks is absent', async () => {
    const prisma = {
      permission: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      rolePermission: { createMany: jest.fn() },
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ stocksInstalledAt: null, purchasingInstalledAt: null }),
      },
    };
    await expect(
      installationService(prisma).install('org-1', {
        id: 'admin-1',
        email: 'admin@example.com',
        organizationId: 'org-1',
        role: 'ADMIN',
        permissions: [],
      }),
    ).rejects.toThrow('Stocks doit être installé');
  });

  it('enforces manage permission for uninstall instead of relying on the UI', async () => {
    await expect(
      installationService({}).uninstall('org-1', {
        id: 'user-1',
        email: 'user@example.com',
        organizationId: 'org-1',
        role: 'Utilisateur',
        permissions: ['purchasing.read'],
      }),
    ).rejects.toThrow('purchasing.manage');
  });

  it('is idempotent on reinstall and never deletes Purchasing business data', async () => {
    const installedAt = new Date('2026-07-14T10:00:00.000Z');
    const tx = {
      organization: { update: jest.fn().mockResolvedValue({}) },
      purchasingSettings: { upsert: jest.fn().mockResolvedValue({}) },
      purchasingOnboardingProgress: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      permission: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      rolePermission: { createMany: jest.fn() },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: installedAt,
          purchasingInstalledAt: installedAt,
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const purchasing = installationService(prisma);
    const admin = {
      id: 'admin-1',
      email: 'admin@example.com',
      organizationId: 'org-1',
      role: 'ADMIN',
      permissions: [],
    };

    await purchasing.install('org-1', admin);
    await purchasing.install('org-1', admin);

    expect(tx.organization.update).toHaveBeenCalledTimes(2);
    expect(tx.organization.update).toHaveBeenLastCalledWith({
      where: { id: 'org-1' },
      data: { purchasingInstalledAt: installedAt },
    });
    expect(tx.purchasingSettings.upsert).toHaveBeenCalledTimes(2);
    expect(tx.purchasingOnboardingProgress.upsert).toHaveBeenCalledTimes(2);
    expect(Object.keys(tx)).not.toContain('purchaseOrder');
    expect(Object.keys(tx)).not.toContain('purchaseReceipt');
  });

  it('uninstalls visibility without deleting orders, receipts, settings or history', async () => {
    const tx = {
      organization: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const result = await installationService(prisma).uninstall('org-1', {
      id: 'admin-1',
      email: 'admin@example.com',
      organizationId: 'org-1',
      role: 'ADMIN',
      permissions: [],
    });

    expect(result).toEqual({ installed: false });
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { purchasingInstalledAt: null },
    });
    expect(Object.keys(tx)).toEqual(['organization', 'auditLog']);
  });
});

describe('Purchasing Stocks source of truth', () => {
  it('resumes the current user draft for a supplier without creating another order', async () => {
    const existingDraft = {
      id: 'draft-1',
      number: 'CA-2026-00001',
      supplierId: 'supplier-1',
      siteId: 'site-1',
      status: 'DRAFT',
      createdById: 'user-1',
      deliveryFeeSnapshot: 0,
      totalExcludingTax: 12,
      totalTax: 1.2,
      totalIncludingTax: 13.2,
      lines: [],
      receipts: [],
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: new Date(),
          purchasingInstalledAt: new Date(),
        }),
      },
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(existingDraft) },
      $transaction: jest.fn(),
    };

    const result = await commandService(prisma).resumeDraft(
      'org-1',
      {
        id: 'user-1',
        email: 'user@example.com',
        organizationId: 'org-1',
        role: 'Utilisateur',
        permissions: ['purchasing.draft'],
      },
      { supplierId: 'supplier-1', siteId: 'site-1' },
    );

    expect(result).toEqual(expect.objectContaining({ id: 'draft-1', totalIncludingTax: 13.2 }));
    expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 'supplier-1',
          createdById: 'user-1',
          status: 'DRAFT',
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to create an order for a supplier configured for in-store purchases', async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: new Date(),
          purchasingInstalledAt: new Date(),
        }),
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'supplier-store',
          name: 'Supermarché',
          purchasingProfile: {
            deliveryMode: PurchasingDeliveryMode.NO_DELIVERY,
            deliveryWeekdays: [],
            cutoffTime: null,
            timezone: 'Europe/Helsinki',
            leadTimeDays: 0,
            orderingEnabled: false,
          },
        }),
      },
      site: { findFirst: jest.fn().mockResolvedValue({ id: 'site-1' }) },
      purchasingSettings: {
        upsert: jest.fn().mockResolvedValue({ defaultCurrency: 'EUR' }),
      },
      product: { findMany: jest.fn() },
    };

    await expect(
      commandService(prisma).create(
        'org-1',
        {
          id: 'admin-1',
          email: 'admin@example.com',
          organizationId: 'org-1',
          role: 'ADMIN',
          permissions: [],
        },
        {
          supplierId: 'supplier-store',
          siteId: 'site-1',
          lines: [{ productId: 'product-1', quantity: 1 }],
        },
      ),
    ).rejects.toThrow('achats sur place');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('builds an order line from a Stocks product without a Purchasing offer', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            name: 'Farine',
            sku: 'FAR-01',
            unitId: 'unit-1',
            primarySupplierId: 'supplier-1',
            unit: { symbol: 'kg' },
            averagePrice: 2.5,
          },
        ]),
      },
    };

    const purchasing = commandService(prisma);
    const result = await purchasing.buildOrderLines('org-1', 'supplier-1', [
      { productId: 'product-1', quantity: 3, unitPrice: 999 },
    ]);

    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        productId: 'product-1',
        supplierReferenceSnapshot: 'FAR-01',
        productNameSnapshot: 'Farine',
      }),
    );
    expect(Number(result.totals.totalIncludingTax)).toBe(7.5);
  });

  it('orders supplier packs while valuing and receiving their full base-unit content', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'milk-1',
            name: 'Pirkka laktoositon maitojuoma 1l 3%',
            sku: '21913615',
            gtin: '6410405216182',
            unitId: 'unit-litre',
            primarySupplierId: 'supplier-kespro',
            unit: { symbol: 'L' },
            packageLabel: 'Carton de 20 × 1 L',
            unitsPerPackage: 20,
            averagePrice: 1.1959,
          },
        ]),
      },
    };

    const result = await commandService(prisma).buildOrderLines('org-1', 'supplier-kespro', [
      { productId: 'milk-1', quantity: 1 },
    ]);

    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        orderedQuantity: expect.anything(),
        unitsPerOrderUnit: expect.anything(),
        expectedStockQuantity: expect.anything(),
        unitSymbolSnapshot: 'Carton de 20 × 1 L',
      }),
    );
    expect(Number(result.lines[0].orderedQuantity)).toBe(1);
    expect(Number(result.lines[0].unitsPerOrderUnit)).toBe(20);
    expect(Number(result.lines[0].expectedStockQuantity)).toBe(20);
    expect(Number(result.lines[0].unitPrice)).toBeCloseTo(23.918, 4);
    expect(Number(result.totals.totalIncludingTax)).toBeCloseTo(23.918, 4);
  });

  it('does not carry the historical price when duplicating an order', async () => {
    const prisma = {
      purchaseOrderEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const source = {
      id: 'order-1',
      number: 'CA-2026-00001',
      supplierId: 'supplier-1',
      siteId: 'site-1',
      currency: 'EUR',
      notes: null,
      supplierMessage: null,
      lines: [
        {
          productId: 'product-1',
          unitId: 'unit-1',
          supplierReferenceSnapshot: 'OLD-REF',
          supplierLabelSnapshot: 'Ancien libellé',
          orderedQuantity: 2,
          unitsPerOrderUnit: 1,
          unitPrice: 999,
          vatRate: 14,
        },
      ],
    };
    const database = prisma as unknown as PrismaService;
    const purchasing = new PurchaseOrderCommandService(
      database,
      new PurchasingContextService(database),
      new PurchaseOrderPolicy(),
      new PurchasingDeliveryService(),
      {} as never,
      { detail: jest.fn().mockResolvedValue(source) } as never,
    );
    const create = jest
      .spyOn(purchasing, 'create')
      .mockResolvedValue({ id: 'order-2', number: 'CA-2026-00002' } as never);

    await purchasing.duplicate(
      'org-1',
      {
        id: 'user-1',
        email: 'user@example.com',
        organizationId: 'org-1',
        role: 'Utilisateur',
        permissions: ['purchasing.draft'],
      },
      'order-1',
    );

    expect(create).toHaveBeenCalledWith(
      'org-1',
      expect.any(Object),
      expect.objectContaining({
        lines: [expect.not.objectContaining({ unitPrice: expect.anything() })],
      }),
    );
  });

  it('returns an explicit optimistic-lock conflict without deleting existing lines', async () => {
    const tx = {
      purchaseOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      purchaseOrderLine: { deleteMany: jest.fn() },
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: new Date(),
          purchasingInstalledAt: new Date(),
        }),
      },
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          createdById: 'user-1',
          status: 'DRAFT',
          version: 3,
        }),
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'supplier-1',
          name: 'Fournisseur',
          purchasingProfile: { deliveryFee: 0 },
        }),
      },
      site: {
        findFirst: jest.fn().mockResolvedValue({ id: 'site-1', address: 'Helsinki' }),
      },
      purchasingSettings: {
        upsert: jest.fn().mockResolvedValue({ defaultCurrency: 'EUR' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            name: 'Farine',
            sku: 'FAR-01',
            unitId: 'unit-1',
            primarySupplierId: 'supplier-1',
            unit: { symbol: 'kg' },
            averagePrice: 2.5,
          },
        ]),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await expect(
      commandService(prisma).update(
        'org-1',
        {
          id: 'user-1',
          email: 'user@example.com',
          organizationId: 'org-1',
          role: 'Utilisateur',
          permissions: ['purchasing.draft'],
        },
        'order-1',
        {
          supplierId: 'supplier-1',
          siteId: 'site-1',
          expectedVersion: 2,
          lines: [{ productId: 'product-1', quantity: 1 }],
        },
      ),
    ).rejects.toThrow('modifié ailleurs');
    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', version: 2 }),
      }),
    );
    expect(tx.purchaseOrderLine.deleteMany).not.toHaveBeenCalled();
  });
});
