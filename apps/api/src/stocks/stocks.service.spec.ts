import { Prisma, ProductKind, StockMovementType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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
      product: { findMany: jest.fn().mockResolvedValue(products) },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StocksService(prisma as any);

    const result = await service.listArticles('org-1', { page: 2, pageSize: 25, status: 'NO_STOCK' });

    expect(result.items).toHaveLength(5);
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 30, pages: 2 });
    expect(result.summary).toEqual(expect.objectContaining({ articleCount: 30, articlesWithoutStock: 30 }));
  });

  it('passes category and supplier filters to the product query before pagination', async () => {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: { findMany: jest.fn() },
    };
    const service = new StocksService(prisma as any);

    await service.listArticles('org-1', { categoryId: '11111111-1111-4111-8111-111111111111', supplierId: '22222222-2222-4222-8222-222222222222' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        categoryId: '11111111-1111-4111-8111-111111111111',
        primarySupplierId: '22222222-2222-4222-8222-222222222222',
        kind: {
          in: [ProductKind.UNSPECIFIED, ProductKind.RAW_MATERIAL, ProductKind.PACKAGED],
        },
      }),
    }));
  });

  it('never exposes recipe outputs in the Stocks product catalogue', async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new StocksService(prisma as any);

    await service.listProducts('org-1');

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        kind: {
          in: [ProductKind.UNSPECIFIED, ProductKind.RAW_MATERIAL, ProductKind.PACKAGED],
        },
      }),
    }));
  });
});

describe('CreateStockMovementDto manual movement types', () => {
  const payload = {
    productId: '11111111-1111-4111-8111-111111111111',
    quantity: 1,
  };

  it.each([StockMovementType.IN, StockMovementType.OUT, StockMovementType.LOSS, StockMovementType.TRANSFER])('accepts %s', async (type) => {
    const errors = await validate(plainToInstance(CreateStockMovementDto, { ...payload, type }));
    expect(errors).toHaveLength(0);
  });

  it.each([StockMovementType.RECEPTION, StockMovementType.PRODUCTION, StockMovementType.CORRECTION, StockMovementType.INVENTORY])('rejects manual %s', async (type) => {
    const errors = await validate(plainToInstance(CreateStockMovementDto, { ...payload, type }));
    expect(errors.some((error) => Boolean(error.constraints?.isIn))).toBe(true);
  });
});
