import { Prisma, ProductKind, UnitType } from '@prisma/client';
import { StocksInventoryImportService } from './stocks-inventory-import.service';

describe('StocksInventoryImportService', () => {
  it('crée uniquement un inventaire brouillon et ne modifie pas le stock avant validation', async () => {
    const unit = {
      id: '10000000-0000-0000-0000-000000000001',
      organizationId: '20000000-0000-0000-0000-000000000001',
      name: 'Kilogramme',
      symbol: 'kg',
      type: UnitType.MASS,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const product = {
      id: '30000000-0000-0000-0000-000000000001',
      organizationId: unit.organizationId,
      name: 'Café test 1 kg',
      unitId: unit.id,
      unit,
      kind: ProductKind.UNSPECIFIED,
      averagePrice: new Prisma.Decimal(10),
      isArchived: false,
    };
    const tx: any = {
      product: { create: jest.fn(), update: jest.fn() },
      category: { findFirst: jest.fn(), create: jest.fn() },
      supplier: { findFirst: jest.fn(), create: jest.fn() },
      productAlias: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      productSite: { upsert: jest.fn().mockResolvedValue({}) },
      stock: {
        findMany: jest.fn().mockResolvedValue([
          { productId: product.id, quantity: new Prisma.Decimal(2) },
        ]),
        update: jest.fn(),
        create: jest.fn(),
      },
      stockMovement: { create: jest.fn() },
      inventory: {
        create: jest.fn().mockResolvedValue({ id: 'inventory-1', name: 'Contrôle importé' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inventory-1',
          name: 'Contrôle importé',
          status: 'DRAFT',
          lines: [],
        }),
      },
      inventoryLine: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      site: {
        findFirst: jest.fn().mockResolvedValue({
          id: '40000000-0000-0000-0000-000000000001',
          name: 'Site test',
        }),
      },
      unit: { findMany: jest.fn().mockResolvedValue([unit]) },
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      $transaction: jest.fn((callback: (client: any) => unknown) => callback(tx)),
    };
    const service = new StocksInventoryImportService(prisma);

    const result = await service.commit(
      unit.organizationId,
      { id: '50000000-0000-0000-0000-000000000001', role: 'SUPER_ADMIN' },
      {
        siteId: '40000000-0000-0000-0000-000000000001',
        name: 'Contrôle importé',
        inventoryDate: '2026-08-05',
        rows: [
          {
            sourceId: 'Feuille:1',
            sourceName: product.name,
            countedQuantity: 3.5,
            unitLabel: 'kg',
            action: 'MATCH',
            productId: product.id,
            unitId: unit.id,
            selected: true,
          },
        ],
      },
    );

    expect(result).toMatchObject({ status: 'DRAFT', stockUpdated: false });
    expect(tx.inventory.create).toHaveBeenCalledTimes(1);
    expect(tx.inventoryLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: product.id,
          countedQuantity: new Prisma.Decimal(3.5),
          theoreticalQuantity: new Prisma.Decimal(2),
          varianceQuantity: new Prisma.Decimal(1.5),
        }),
      ],
    });
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(tx.stock.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
