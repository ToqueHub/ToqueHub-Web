import {
  EquipmentAcquisitionMode,
  EquipmentCondition,
  Prisma,
  ProductKind,
  PurchasingDeliveryMode,
  StockMovementType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdjustProductStockDto } from './dto/adjust-product-stock.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StocksService } from './stocks.service';

describe('StocksService articles pagination', () => {
  it('returns at most 25 products per page after applying server filters', async () => {
    const products = Array.from({ length: 30 }, (_, index) => ({
      id: `product-${index + 1}`,
      name: `Produit ${String(index + 1).padStart(2, '0')}`,
      averagePrice: new Prisma.Decimal(1),
      minimumStock: new Prisma.Decimal(0),
      category: null,
      unit: { id: 'unit-1', symbol: 'kg' },
      primarySupplier: null,
      stocks: [],
    }));
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue(products),
        count: jest.fn().mockResolvedValue(0),
      },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StocksService(prisma as any);

    const result = await service.listArticles('org-1', {
      page: 2,
      pageSize: 25,
      status: 'NO_STOCK',
    });

    expect(result.items).toHaveLength(5);
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 30, pages: 2 });
    expect(result.summary).toEqual(
      expect.objectContaining({ articleCount: 30, articlesWithoutStock: 30 }),
    );
  });

  it('passes category and supplier filters to the product query before pagination', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      stockMovement: { findMany: jest.fn() },
    };
    const service = new StocksService(prisma as any);

    await service.listArticles('org-1', {
      categoryId: '11111111-1111-4111-8111-111111111111',
      supplierId: '22222222-2222-4222-8222-222222222222',
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: '11111111-1111-4111-8111-111111111111',
          primarySupplierId: '22222222-2222-4222-8222-222222222222',
          kind: {
            in: [ProductKind.UNSPECIFIED, ProductKind.RAW_MATERIAL, ProductKind.PACKAGED],
          },
        }),
      }),
    );
  });

  it('never exposes recipe outputs in the Stocks product catalogue', async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new StocksService(prisma as any);

    await service.listProducts('org-1');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: {
            in: [ProductKind.UNSPECIFIED, ProductKind.RAW_MATERIAL, ProductKind.PACKAGED],
          },
        }),
      }),
    );
  });

  it('uses the same articles projection for equipment without mixing it into food products', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      stockMovement: { findMany: jest.fn() },
    };
    const service = new StocksService(prisma as any);

    await service.listArticles('org-1', { kind: ProductKind.EQUIPMENT });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: { in: [ProductKind.EQUIPMENT] } }),
        include: expect.objectContaining({ equipmentProfile: true, stocks: expect.any(Object) }),
      }),
    );
  });
});

describe('StocksService category scopes', () => {
  it('keeps equipment categories out of the product catalogue by default', async () => {
    const prisma = { category: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new StocksService(prisma as any);

    await service.listCategories('org-1');

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: { not: ProductKind.EQUIPMENT } }),
      }),
    );
  });

  it('returns only equipment categories for the material catalogue', async () => {
    const prisma = { category: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new StocksService(prisma as any);

    await service.listCategories('org-1', { kind: ProductKind.EQUIPMENT });

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: ProductKind.EQUIPMENT }),
      }),
    );
  });
});

describe('StocksService equipment profile', () => {
  it('normalizes the simple acquisition and financing fields', () => {
    const service = new StocksService({} as any);

    const profile = (service as any).equipmentProfileData({
      brand: 'Rational',
      model: 'iCombi Pro',
      condition: EquipmentCondition.IN_SERVICE,
      acquisitionMode: EquipmentAcquisitionMode.LEASING,
      financingStart: '2026-08-01',
      financingEnd: '2030-08-01',
      monthlyPayment: 650,
      targetQuantity: 1,
    });

    expect(profile).toEqual(
      expect.objectContaining({
        brand: 'Rational',
        acquisitionMode: EquipmentAcquisitionMode.LEASING,
        monthlyPayment: 650,
        targetQuantity: 1,
      }),
    );
    expect(profile.financingStart).toEqual(new Date('2026-08-01'));
    expect(profile.financingEnd).toEqual(new Date('2030-08-01'));
  });

  it('rejects a financing ending before it starts', () => {
    const service = new StocksService({} as any);

    expect(() =>
      (service as any).equipmentProfileData({
        financingStart: '2030-08-01',
        financingEnd: '2026-08-01',
      }),
    ).toThrow('La fin du financement doit être postérieure');
  });
});

describe('StocksService supplier purchasing modes', () => {
  it('turns an in-store supplier into a non-orderable profile', () => {
    const service = new StocksService({} as any);

    const profile = (service as any).normalizeSupplierPurchasing({
      orderEmail: 'orders@example.com',
      deliveryMode: PurchasingDeliveryMode.NO_DELIVERY,
      deliveryWeekdays: [1, 2],
      minimumOrder: 100,
      deliveryFee: 15,
      timezone: 'Europe/Helsinki',
      leadTimeDays: 3,
    });

    expect(profile).toEqual(
      expect.objectContaining({
        orderEmail: null,
        deliveryMode: PurchasingDeliveryMode.NO_DELIVERY,
        deliveryWeekdays: [],
        leadTimeDays: 0,
        orderingEnabled: false,
      }),
    );
    expect(Number(profile.minimumOrder)).toBe(0);
    expect(Number(profile.deliveryFee)).toBe(0);
  });
});

describe('CreateStockMovementDto manual movement types', () => {
  const payload = {
    productId: '11111111-1111-4111-8111-111111111111',
    quantity: 1,
  };

  it.each([
    StockMovementType.IN,
    StockMovementType.OUT,
    StockMovementType.LOSS,
    StockMovementType.TRANSFER,
  ])('accepts %s', async (type) => {
    const errors = await validate(plainToInstance(CreateStockMovementDto, { ...payload, type }));
    expect(errors).toHaveLength(0);
  });

  it.each([
    StockMovementType.RECEPTION,
    StockMovementType.PRODUCTION,
    StockMovementType.CORRECTION,
    StockMovementType.INVENTORY,
  ])('rejects manual %s', async (type) => {
    const errors = await validate(plainToInstance(CreateStockMovementDto, { ...payload, type }));
    expect(errors.some((error) => Boolean(error.constraints?.isIn))).toBe(true);
  });
});

describe('StocksService manual product stock adjustment', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  const stockId = '33333333-3333-4333-8333-333333333333';
  const siteId = '44444444-4444-4444-8444-444444444444';
  const actor = { id: '55555555-5555-4555-8555-555555555555', role: 'Chef' };

  it('sets the counted quantity and records the signed variance as an inventory movement', async () => {
    const stock = {
      id: stockId,
      organizationId,
      productId,
      siteId,
      locationId: null,
      quantity: new Prisma.Decimal(200000),
    };
    const tx = {
      stock: {
        update: jest.fn().mockResolvedValue({
          ...stock,
          quantity: new Prisma.Decimal(180000),
        }),
        create: jest.fn(),
      },
      stockMovement: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'movement-1', ...data })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      productSite: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: productId,
          unitId: 'unit-g',
          unit: { id: 'unit-g', symbol: 'g' },
          name: 'Rose noire',
          minimumStock: new Prisma.Decimal(0),
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ primarySiteId: siteId }),
      },
      stock: { findFirst: jest.fn().mockResolvedValue(stock) },
      location: { findFirst: jest.fn() },
      site: {
        findFirst: jest.fn().mockResolvedValue({ id: siteId }),
        findMany: jest.fn().mockResolvedValue([{ id: siteId, name: 'Cuisine' }]),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new StocksService(prisma as any);

    await service.adjustProductStock(organizationId, actor, productId, {
      stockId,
      quantity: 180000,
      reason: 'Comptage initial',
    });

    expect(tx.stock.update).toHaveBeenCalledWith({
      where: { id: stockId },
      data: { quantity: new Prisma.Decimal(180000) },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.INVENTORY,
          quantity: new Prisma.Decimal(-20000),
          inputQuantity: new Prisma.Decimal(180000),
          sourceSiteId: siteId,
          destinationSiteId: null,
          reason: 'Comptage initial',
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('rejects a quantity identical to the current projection', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: productId,
          unitId: 'unit-g',
          unit: { id: 'unit-g', symbol: 'g' },
          name: 'Rose noire',
          minimumStock: new Prisma.Decimal(0),
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ primarySiteId: siteId }),
      },
      stock: {
        findFirst: jest.fn().mockResolvedValue({
          id: stockId,
          productId,
          siteId,
          locationId: null,
          quantity: new Prisma.Decimal(200000),
        }),
      },
      location: { findFirst: jest.fn() },
      site: {
        findFirst: jest.fn().mockResolvedValue({ id: siteId }),
        findMany: jest.fn().mockResolvedValue([{ id: siteId, name: 'Cuisine' }]),
      },
      $transaction: jest.fn(),
    };
    const service = new StocksService(prisma as any);

    await expect(
      service.adjustProductStock(organizationId, actor, productId, {
        stockId,
        quantity: 200000,
      }),
    ).rejects.toThrow('La quantité saisie est identique au stock actuel');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AdjustProductStockDto', () => {
  it('rejects a negative counted quantity', async () => {
    const errors = await validate(plainToInstance(AdjustProductStockDto, { quantity: -1 }));
    expect(errors.some((error) => Boolean(error.constraints?.min))).toBe(true);
  });
});
