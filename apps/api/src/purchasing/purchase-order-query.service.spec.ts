import type { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchaseOrderQueryService } from './purchase-order-query.service';

const actor = {
  id: 'user-1',
  email: 'user@example.com',
  organizationId: 'org-1',
  role: 'Utilisateur',
  permissions: ['purchasing.read', 'purchasing.draft'],
};

describe('PurchaseOrderQueryService', () => {
  it('excludes in-store suppliers from the new-order supplier reference list', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    await queries.suppliers('org-1', actor, { page: 1, pageSize: 30 });

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          AND: expect.arrayContaining([
            {
              OR: [
                { purchasingProfile: { is: null } },
                {
                  purchasingProfile: {
                    is: {
                      orderingEnabled: true,
                      deliveryMode: { not: 'NO_DELIVERY' },
                    },
                  },
                },
              ],
            },
          ]),
        }),
      }),
    );
    expect(prisma.supplier.count).toHaveBeenCalledWith({
      where: prisma.supplier.findMany.mock.calls[0][0].where,
    });
  });

  it('scopes paginated order reads and counts to the organization and owner visibility', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    const result = await queries.list('org-1', actor, {
      page: 2,
      pageSize: 25,
      search: 'CA-2026',
    });

    expect(result).toEqual({ items: [], total: 0, page: 2, pageSize: 25 });
    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          AND: expect.arrayContaining([
            { OR: [{ status: { not: 'DRAFT' } }, { createdById: 'user-1' }] },
          ]),
        }),
        skip: 25,
        take: 25,
      }),
    );
    expect(prisma.purchaseOrder.count.mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('only searches Stocks products for the selected primary supplier and aggregates stock', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            name: 'Farine',
            averagePrice: 2,
            unit: null,
            primarySupplier: { id: 'supplier-1' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      stock: {
        groupBy: jest.fn().mockResolvedValue([{ productId: 'product-1', _sum: { quantity: 12 } }]),
      },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    const result = await queries.products('org-1', actor, {
      supplierId: 'supplier-1',
      categoryId: 'category-1',
      page: 1,
      pageSize: 30,
    });

    expect(result.items[0]).toEqual(expect.objectContaining({ stockQuantity: 12 }));
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        primarySupplierId: 'supplier-1',
        categoryId: 'category-1',
        isArchived: false,
      }),
    );
    expect(prisma.product.findMany.mock.calls[0][0].include).toEqual(
      expect.objectContaining({ category: true, unit: true, primarySupplier: true }),
    );
    expect(prisma.stock.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', productId: { in: ['product-1'] } },
      }),
    );
  });

  it('combines favorite filtering with supplier, site, search, pagination and archived exclusion', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      stock: { groupBy: jest.fn() },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    const result = await queries.products('org-1', actor, {
      supplierId: 'supplier-1',
      siteId: 'site-1',
      favoriteOnly: true,
      search: 'huile',
      page: 3,
      pageSize: 12,
    });

    expect(result).toEqual({ items: [], total: 0, page: 3, pageSize: 12 });
    const query = prisma.product.findMany.mock.calls[0][0];
    expect(query).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          primarySupplierId: 'supplier-1',
          isFavorite: true,
          isArchived: false,
          siteAssignments: { some: { siteId: 'site-1', isActive: true } },
          OR: [
            { name: { contains: 'huile', mode: 'insensitive' } },
            { sku: { contains: 'huile', mode: 'insensitive' } },
            { gtin: { contains: 'huile', mode: 'insensitive' } },
          ],
        }),
        skip: 24,
        take: 12,
      }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({ where: query.where });
    expect(prisma.stock.groupBy).not.toHaveBeenCalled();
  });

  it('does not apply the favorite predicate when favoriteOnly is false', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      stock: { groupBy: jest.fn() },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    await queries.products('org-1', actor, {
      supplierId: 'supplier-1',
      favoriteOnly: false,
    });

    expect(prisma.product.findMany.mock.calls[0][0].where.isFavorite).toBeUndefined();
  });

  it('filters supplier products to direct and recursively expanded primary-card ingredients', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-kespro' }) },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { productId: 'direct-drink', technicalSheetId: null },
          { productId: null, technicalSheetId: 'sheet-card-item' },
        ]),
      },
      technicalSheetIngredient: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { productId: 'raw-flour', sourceTechnicalSheetId: null },
            { productId: 'intermediate-dough', sourceTechnicalSheetId: 'sheet-dough' },
          ])
          .mockResolvedValueOnce([
            { productId: 'raw-salt', sourceTechnicalSheetId: null },
            { productId: 'raw-oil', sourceTechnicalSheetId: null },
          ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      stock: { groupBy: jest.fn() },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    await queries.products('org-1', actor, {
      supplierId: 'supplier-kespro',
      siteId: 'site-1',
      menuOnly: true,
      search: 'huile',
      page: 2,
      pageSize: 12,
    });

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        availabilityEnabled: true,
        menu: {
          organizationId: 'org-1',
          kind: 'CATALOG',
          status: { not: 'ARCHIVED' },
          isPrimary: true,
          OR: [{ siteId: 'site-1' }, { siteId: null }],
        },
      },
      select: { productId: true, technicalSheetId: true },
    });
    expect(prisma.technicalSheetIngredient.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        organizationId: 'org-1',
        technicalSheetId: { in: ['sheet-card-item'] },
      },
      select: { productId: true, sourceTechnicalSheetId: true },
    });
    expect(prisma.technicalSheetIngredient.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: 'org-1',
        technicalSheetId: { in: ['sheet-dough'] },
      },
      select: { productId: true, sourceTechnicalSheetId: true },
    });
    expect(prisma.product.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          id: { in: ['direct-drink', 'raw-flour', 'raw-salt', 'raw-oil'] },
          primarySupplierId: 'supplier-kespro',
          isArchived: false,
          siteAssignments: { some: { siteId: 'site-1', isActive: true } },
          OR: [
            { name: { contains: 'huile', mode: 'insensitive' } },
            { sku: { contains: 'huile', mode: 'insensitive' } },
            { gtin: { contains: 'huile', mode: 'insensitive' } },
          ],
        }),
        skip: 12,
        take: 12,
      }),
    );
  });

  it('does not leak whether a supplier exists in another organization', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    await expect(
      queries.products('org-1', actor, { supplierId: 'supplier-other-org' }),
    ).rejects.toThrow('Fournisseur introuvable');
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-other-org', organizationId: 'org-1', isArchived: false },
      select: { id: true },
    });
  });

  it('filters the lightweight order list to receivable states on demand', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    await queries.list('org-1', actor, { receivable: true, pageSize: 30 });

    expect(prisma.purchaseOrder.findMany.mock.calls[0][0].where.status).toEqual({
      in: ['ACKNOWLEDGED', 'PARTIALLY_RECEIVED'],
    });
  });

  it('returns only Stocks categories containing products of the selected supplier', async () => {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      category: { findMany: jest.fn().mockResolvedValue([{ id: 'category-1', name: 'Frais' }]) },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    await expect(queries.categories('org-1', actor, { supplierId: 'supplier-1' })).resolves.toEqual(
      [{ id: 'category-1', name: 'Frais' }],
    );
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          isArchived: false,
          products: {
            some: {
              organizationId: 'org-1',
              primarySupplierId: 'supplier-1',
              isArchived: false,
            },
          },
        },
      }),
    );
  });

  it('builds recent and frequent products from organization-scoped sent order history', async () => {
    const recentAt = new Date('2026-07-14T10:00:00.000Z');
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      purchaseOrderLine: {
        groupBy: jest.fn().mockResolvedValue([
          {
            productId: 'product-1',
            _count: { _all: 4 },
            _max: { createdAt: recentAt },
          },
        ]),
      },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'product-1', name: 'Farine', category: { id: 'category-1', name: 'Sec' } },
          ]),
      },
      stock: {
        groupBy: jest.fn().mockResolvedValue([{ productId: 'product-1', _sum: { quantity: 7 } }]),
      },
    };
    const queries = new PurchaseOrderQueryService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    );

    const result = await queries.productHighlights('org-1', actor, {
      supplierId: 'supplier-1',
    });

    expect(result.recent[0]).toEqual(
      expect.objectContaining({
        id: 'product-1',
        stockQuantity: 7,
        orderCount: 4,
        lastOrderedAt: recentAt,
      }),
    );
    expect(result.frequent[0]?.id).toBe('product-1');
    expect(prisma.purchaseOrderLine.groupBy.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        product: {
          organizationId: 'org-1',
          primarySupplierId: 'supplier-1',
          isArchived: false,
        },
        order: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
  });
});
