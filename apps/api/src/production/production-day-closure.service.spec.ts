import { BadRequestException } from '@nestjs/common';
import { Prisma, ProductionDayClosureStatus, ProductionOrderStatus } from '@prisma/client';
import { ProductionDayClosureService } from './production-day-closure.service';

describe('ProductionDayClosureService', () => {
  const site = { id: 'site-1', organizationId: 'org-1', name: 'The French Café' };

  it('prepares the end-of-day quantities with the previous carry-over', async () => {
    const prisma = {
      site: { findFirst: jest.fn().mockResolvedValue(site) },
      productionDayClosure: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({
          date: new Date('2026-07-27T00:00:00.000Z'),
          items: [{
            outputProductId: 'product-snickers',
            carryOverNextPortions: new Prisma.Decimal(5),
          }],
        }),
      },
      productionOrder: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'order-1',
          number: 'OF-001',
          name: 'Snickers',
          outputProductId: 'product-snickers',
          outputProduct: { id: 'product-snickers', name: 'Snickers' },
          technicalSheet: { id: 'sheet-1', name: 'Snickers' },
          site,
          plannedTime: '08:00',
          status: ProductionOrderStatus.IN_PROGRESS,
          grossRequirement: new Prisma.Decimal(50),
          plannedPortions: new Prisma.Decimal(45),
          realizedPortions: null,
          batches: [{ actualQuantity: new Prisma.Decimal(45) }],
        }]),
      },
    };
    const service = new ProductionDayClosureService(prisma as never);

    const result = await service.preview('org-1', {
      siteId: 'site-1',
      date: '2026-07-28',
    });

    expect(result.items).toEqual([expect.objectContaining({
      productName: 'Snickers',
      targetPortions: 50,
      openingCarryOverPortions: 5,
      producedPortions: 45,
      totalAvailablePortions: 50,
      estimatedOutPortions: 50,
    })]);
  });

  it('requires a reason whenever a quantity is discarded', async () => {
    const prisma = {
      productionDayClosure: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProductionDayClosureService(prisma as never);
    jest.spyOn(service, 'preview').mockResolvedValue({
      items: [{
        orderId: 'order-1',
        outputProductId: 'product-snickers',
        productName: 'Snickers',
        targetPortions: 50,
        openingCarryOverPortions: 5,
        producedPortions: 45,
        totalAvailablePortions: 50,
      }],
    } as never);

    await expect(service.close('org-1', { id: 'user-1', role: 'Chef' }, {
      siteId: 'site-1',
      date: '2026-07-28',
      items: [{
        orderId: 'order-1',
        remainingPortions: 5,
        discardedPortions: 2,
        carryOverNextPortions: 5,
      }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the closure and calculates the estimated quantity sold', async () => {
    const tx = {
      productionDayClosure: {
        upsert: jest.fn().mockResolvedValue({ id: 'closure-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'closure-1',
          site,
          status: ProductionDayClosureStatus.CLOSED,
          items: [{
            productNameSnapshot: 'Snickers',
            targetPortions: new Prisma.Decimal(50),
            openingCarryOverPortions: new Prisma.Decimal(5),
            producedPortions: new Prisma.Decimal(45),
            totalAvailablePortions: new Prisma.Decimal(50),
            remainingPortions: new Prisma.Decimal(5),
            discardedPortions: new Prisma.Decimal(2),
            estimatedOutPortions: new Prisma.Decimal(43),
            carryOverNextPortions: new Prisma.Decimal(5),
          }],
        }),
      },
      productionDayClosureItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productionOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      productionDayClosure: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const service = new ProductionDayClosureService(prisma as never);
    jest.spyOn(service, 'preview').mockResolvedValue({
      items: [{
        orderId: 'order-1',
        outputProductId: 'product-snickers',
        productName: 'Snickers',
        targetPortions: 50,
        openingCarryOverPortions: 5,
        producedPortions: 45,
        totalAvailablePortions: 50,
      }],
    } as never);

    const result = await service.close('org-1', { id: 'user-1', role: 'Chef' }, {
      siteId: 'site-1',
      date: '2026-07-28',
      items: [{
        orderId: 'order-1',
        remainingPortions: 5,
        discardedPortions: 2,
        carryOverNextPortions: 5,
        lossReason: 'Produit abîmé',
      }],
    });

    expect(tx.productionDayClosureItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        closureId: 'closure-1',
        estimatedOutPortions: new Prisma.Decimal(43),
        lossReason: 'Produit abîmé',
      })],
    });
    expect(result.items[0]).toEqual(expect.objectContaining({
      productName: 'Snickers',
      estimatedOutPortions: 43,
    }));
  });

  it('returns the remaining portions proposed for the next production day', async () => {
    const prisma = {
      site: { findFirst: jest.fn().mockResolvedValue(site) },
      productionDayClosure: {
        findFirst: jest.fn().mockResolvedValue({
          date: new Date('2026-07-27T00:00:00.000Z'),
          items: [
            {
              outputProductId: 'product-snickers',
              productNameSnapshot: 'Snickers',
              carryOverNextPortions: new Prisma.Decimal(4),
            },
            {
              outputProductId: 'product-snickers',
              productNameSnapshot: 'Snickers',
              carryOverNextPortions: new Prisma.Decimal(2),
            },
          ],
        }),
      },
    };
    const service = new ProductionDayClosureService(prisma as never);

    const result = await service.carryOver('org-1', {
      siteId: 'site-1',
      date: '2026-07-28',
    });

    expect(result.items).toEqual([
      {
        outputProductId: 'product-snickers',
        productName: 'Snickers',
        portions: 6,
      },
    ]);
  });

  it('reduces the next pending production with the carry-over from the closure', async () => {
    const tx = {
      productionOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-next',
            outputProductId: 'product-snickers',
            plannedPortions: new Prisma.Decimal(50),
            status: ProductionOrderStatus.PROPOSED,
            source: 'NEEDS',
            completedAt: null,
            completedById: null,
            requirements: [
              {
                id: 'requirement-1',
                requiredQuantity: new Prisma.Decimal(10),
                stockAvailable: new Prisma.Decimal(20),
                estimatedCost: new Prisma.Decimal(5),
              },
            ],
            batches: [
              { id: 'batch-1', plannedQuantity: new Prisma.Decimal(50) },
            ],
            needAllocations: [],
            menuProductionLinks: [
              {
                id: 'link-1',
                snapshot: {
                  lines: [
                    {
                      menuItemId: 'menu-item-1',
                      targetPortions: 50,
                      portions: 50,
                    },
                  ],
                },
              },
            ],
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      productionMaterialRequirement: {
        update: jest.fn().mockResolvedValue({}),
      },
      productionBatch: { update: jest.fn().mockResolvedValue({}) },
      productionNeedAllocation: { update: jest.fn() },
      productionNeed: { update: jest.fn() },
      menuProductionLink: { update: jest.fn().mockResolvedValue({}) },
      productionHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ProductionDayClosureService({} as never);

    await (service as any).rebaseNextProductionDay(
      tx,
      'org-1',
      'user-1',
      'site-1',
      new Date('2026-07-27T00:00:00.000Z'),
      [
        {
          outputProductId: 'product-snickers',
          carryOverNextPortions: new Prisma.Decimal(10),
        },
      ],
    );

    expect(tx.productionOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-next' },
      data: expect.objectContaining({
        plannedPortions: new Prisma.Decimal(40),
        grossRequirement: new Prisma.Decimal(40),
        status: ProductionOrderStatus.PROPOSED,
      }),
    });
    expect(tx.productionBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { plannedQuantity: new Prisma.Decimal(40) },
    });
    expect(tx.menuProductionLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: {
        snapshot: expect.objectContaining({
          lines: [
            expect.objectContaining({
              openingCarryOverPortions: 10,
              plannedProductionPortions: 40,
            }),
          ],
        }),
      },
    });
  });
});
