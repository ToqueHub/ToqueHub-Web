import {
  ConservationState,
  Prisma,
  ProductionBatchStatus,
  ProductionMaterialStatus,
  ProductionOrderStatus,
  StockReservationStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { ProductionExecutionService } from './production-execution.service';

describe('ProductionExecutionService', () => {
  const actor = {
    id: 'user-1',
    role: 'Chef',
    permissions: ['production.campaign.validate', 'production.stock.adjust'],
  };

  function fixture(required = '8') {
    const tx = {
      productionOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          organizationId: 'org-1',
          siteId: 'site-1',
          productionDate: new Date('2026-07-20T12:00:00.000Z'),
          status: ProductionOrderStatus.PROPOSED,
          requirements: [
            {
              id: 'requirement-1',
              productId: 'flour',
              productNameSnapshot: 'Farine',
              unitId: 'kg',
              requiredQuantity: new Prisma.Decimal(required),
              product: { id: 'flour', unitId: 'kg', unit: { id: 'kg', symbol: 'kg' } },
              unit: { id: 'kg', symbol: 'kg' },
            },
          ],
          stockReservations: [],
        }),
        update: jest.fn().mockResolvedValue({}),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'campaign-1' }),
      },
      stockReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: `reservation-${data.stockId}`, ...data }),
        ),
      },
      stock: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'stock-first',
            quantity: new Prisma.Decimal(3),
            lotId: 'lot-first',
            locationId: 'cold-room',
            lot: {
              conservationState: ConservationState.CHILLED,
              expiresAt: new Date('2026-07-21T00:00:00.000Z'),
              availableAt: null,
            },
            reservations: [],
          },
          {
            id: 'stock-second',
            quantity: new Prisma.Decimal(10),
            lotId: 'lot-second',
            locationId: 'cold-room',
            lot: {
              conservationState: ConservationState.CHILLED,
              expiresAt: new Date('2026-07-25T00:00:00.000Z'),
              availableAt: null,
            },
            reservations: [],
          },
        ]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      productionMaterialRequirement: { update: jest.fn().mockResolvedValue({}) },
      productionAlert: { create: jest.fn().mockResolvedValue({}) },
      productionHistory: { create: jest.fn().mockResolvedValue({}) },
      unitConversion: { findFirst: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const service = new ProductionExecutionService(prisma as never, {} as never);
    return { service, prisma, tx };
  }

  it('reserves components in FEFO order without decrementing physical stock', async () => {
    const { service, tx } = fixture('8');
    await service.validateCampaign('org-1', actor, 'campaign-1', {
      idempotencyKey: 'request-1',
    });

    expect(tx.stockReservation.create).toHaveBeenCalledTimes(2);
    expect(tx.stockReservation.create.mock.calls.map(([call]) => call.data.quantity.toFixed(3))).toEqual([
      '3.000',
      '5.000',
    ]);
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(tx.stock.updateMany).not.toHaveBeenCalled();
    expect(tx.productionMaterialRequirement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ProductionMaterialStatus.OK }),
      }),
    );
  });

  it('refuses validation when free stock cannot cover the components', async () => {
    const { service, tx } = fixture('20');
    await expect(
      service.validateCampaign('org-1', actor, 'campaign-1', {
        idempotencyKey: 'request-shortage',
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PRODUCTION_COMPONENT_SHORTAGE' }) });
    expect(tx.productionOrder.update).not.toHaveBeenCalled();
  });

  it('does not allow a conservation transition to consume reserved quantity', async () => {
    const { service, tx } = fixture();
    tx.stockMovement = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } as never;
    tx.stock.findFirst = jest.fn().mockResolvedValue({
      id: 'stock-finished',
      organizationId: 'org-1',
      productId: 'cake',
      variantId: null,
      lotId: 'lot-cake',
      siteId: 'site-1',
      locationId: 'freezer',
      quantity: new Prisma.Decimal(10),
      lot: {
        id: 'lot-cake',
        conservationState: ConservationState.CHILLED,
        expiresAt: null,
        availableAt: null,
      },
      product: { id: 'cake', unitId: 'unit', unit: { symbol: 'u' } },
      reservations: [
        { quantity: new Prisma.Decimal(8), status: StockReservationStatus.ACTIVE },
      ],
    });

    await expect(
      service.transitionStock('org-1', actor, 'stock-finished', {
        quantity: '3',
        destinationState: ConservationState.FROZEN,
        idempotencyKey: 'freeze-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stock.updateMany).not.toHaveBeenCalled();
  });

  it('separates the total quantity produced from the quantity currently stored', async () => {
    const stock = {
      id: 'stock-cake',
      productId: 'cake',
      variantId: null,
      quantity: new Prisma.Decimal(4),
      product: { id: 'cake', name: 'Biscuit Joconde', unit: { symbol: 'pc' } },
      variant: null,
      lot: { id: 'lot-cake', lotNumber: 'LOT-1', conservationState: ConservationState.CHILLED },
      site: { id: 'site-1', name: 'Cuisine' },
      location: null,
      reservations: [{ quantity: new Prisma.Decimal(1) }],
    };
    const completedAt = new Date('2026-07-20T10:00:00.000Z');
    const prisma = {
      stock: {
        findMany: jest.fn().mockResolvedValue([stock]),
        count: jest.fn().mockResolvedValue(1),
      },
      productionProfile: {
        findMany: jest.fn().mockResolvedValue([{
          technicalSheetId: 'recipe-cake',
          outputProductId: 'cake',
          outputVariantId: null,
          technicalSheet: { id: 'recipe-cake', name: 'Biscuit Joconde', mode: 'PRODUCTION' },
          outputProduct: { id: 'cake', name: 'Biscuit Joconde', unit: { symbol: 'pc' } },
          outputVariant: null,
        }]),
      },
      productionBatch: {
        findMany: jest.fn().mockResolvedValue([{
          actualQuantity: new Prisma.Decimal(10),
          completedAt,
          status: ProductionBatchStatus.COMPLETED,
          order: {
            technicalSheetId: 'recipe-cake',
            outputProductId: 'cake',
            outputVariantId: null,
            technicalSheet: { id: 'recipe-cake', name: 'Biscuit Joconde', mode: 'PRODUCTION' },
            outputProduct: { id: 'cake', name: 'Biscuit Joconde', unit: { symbol: 'pc' } },
            outputVariant: null,
          },
        }]),
      },
    };
    const service = new ProductionExecutionService(prisma as never, {} as never);

    const result = await service.listProductionStock('org-1', { pageSize: 25 });

    expect(result.summary).toEqual([expect.objectContaining({
      technicalSheetName: 'Biscuit Joconde',
      producedQuantity: '10.000',
      storedQuantity: '4.000',
      reservedQuantity: '1.000',
      availableQuantity: '3.000',
      batchCount: 1,
      lastProducedAt: completedAt,
    })]);
  });
});
