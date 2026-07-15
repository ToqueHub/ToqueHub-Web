import { Prisma } from '@prisma/client';
import { StocksReceptionInventoryService } from './stocks-reception-inventory.service';

describe('StocksReceptionInventoryService', () => {
  it('uses one shared path for stock, reception line, valuation and movement writes', async () => {
    const stocksService = { recalculateTechnicalSheetsForProductTx: jest.fn().mockResolvedValue(undefined) };
    const service = new StocksReceptionInventoryService(stocksService as any);
    const tx: any = {
      stock: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: new Prisma.Decimal(4) }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: new Prisma.Decimal(6) } }),
      },
      stockReceptionLine: { create: jest.fn().mockResolvedValue({ id: 'reception-line-1' }) },
      product: { update: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
    };

    await service.applyValidatedLineTx(tx, {
      organizationId: 'org-1', receptionId: 'reception-1', product: { id: 'product-1', averagePrice: new Prisma.Decimal(2) },
      unit: { id: 'unit-1', symbol: 'kg' }, supplierId: 'supplier-1', siteId: 'site-1', locationId: 'location-1',
      stockQuantity: new Prisma.Decimal(2), inputQuantity: new Prisma.Decimal(1), baseUnitPrice: new Prisma.Decimal(3), unitPrice: new Prisma.Decimal(6),
      lineTotal: new Prisma.Decimal(6), label: 'Farine', reference: 'REF-1', userCorrection: { source: 'PURCHASING' }, movementReason: 'Réception commande CA-1',
      movementDate: new Date('2026-07-14T12:00:00Z'), actorId: 'user-1', priceMode: 'weighted-average',
    });

    expect(tx.stock.update).toHaveBeenCalledWith({ where: { id: 'stock-1' }, data: { quantity: new Prisma.Decimal(6) } });
    expect(tx.stockReceptionLine.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(Number(tx.product.update.mock.calls[0][0].data.averagePrice)).toBeCloseTo(2.333333, 5);
    expect(stocksService.recalculateTechnicalSheetsForProductTx).toHaveBeenCalledWith(tx, 'org-1', 'product-1', 'user-1');
  });
});
