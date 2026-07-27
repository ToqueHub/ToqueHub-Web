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

  it('recalculates a clickable calendar campaign and keeps its menu objective in sync', async () => {
    const current = {
      id: 'campaign-1',
      organizationId: 'org-1',
      siteId: 'site-1',
      technicalSheetId: 'sheet-1',
      outputProductId: 'product-1',
      outputVariantId: null,
      status: ProductionOrderStatus.PROPOSED,
      batches: [{ id: 'batch-1', status: ProductionBatchStatus.TO_PREPARE }],
    };
    const order = {
      ...current,
      recipeVersionId: 'version-1',
      productionDate: new Date('2026-07-27T00:00:00.000Z'),
      grossRequirement: new Prisma.Decimal(30),
      needAllocations: [],
      menuProductionLinks: [{
        id: 'link-1',
        snapshot: {
          lines: [{
            menuItemId: 'menu-item-1',
            technicalSheetId: 'sheet-1',
            portions: 30,
            targetPortions: 40,
            openingCarryOverPortions: 10,
            plannedTime: '08:00',
          }],
        },
      }],
    };
    const tx = {
      productionOrder: {
        findFirst: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      operationalTask: { count: jest.fn().mockResolvedValue(0) },
      stockReservation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      productionMaterialRequirement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      productionBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      menuProductionLink: { update: jest.fn().mockResolvedValue({}) },
      menuItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      hrDepartment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'department-kitchen' }),
      },
      productionOrder: { findFirst: jest.fn().mockResolvedValue(current) },
      productionProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          siteId: 'site-1',
          technicalSheetId: 'sheet-1',
          outputProductId: 'product-1',
          outputVariantId: null,
          yieldUnitId: 'unit-portion',
          mode: 'FIXED',
          referenceYield: new Prisma.Decimal(10),
          minimumQuantity: null,
          optimalQuantity: null,
          maximumQuantity: null,
          stepQuantity: null,
          allowedFormats: null,
          allowHalfBatch: false,
          allowDoubleBatch: false,
          technicalSheet: { ingredients: [], steps: [] },
        }),
      },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const planning = {
      rulesForProfile: jest.fn().mockReturnValue({
        mode: 'FIXED',
        referenceYield: new Prisma.Decimal(10),
        minimumQuantity: null,
        optimalQuantity: null,
        maximumQuantity: null,
        stepQuantity: null,
        allowedFormats: [],
        allowHalfBatch: false,
        allowDoubleBatch: false,
      }),
    };
    const service = new ProductionExecutionService(
      prisma as never,
      planning as never,
    );
    jest.spyOn(service as any, 'createRequirements').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'createBatchesAndOperations').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'history').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getCampaignTx').mockResolvedValue({ id: 'campaign-1' });

    await service.rescheduleCampaign('org-1', actor, 'campaign-1', {
      grossRequirement: '50',
      targetPortions: '60',
      plannedTime: '09:00',
      serviceId: 'department-kitchen',
    });

    expect(tx.productionOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'campaign-1' },
      data: expect.objectContaining({
        grossRequirement: new Prisma.Decimal(50),
        plannedTime: '09:00',
        serviceId: 'department-kitchen',
        status: ProductionOrderStatus.PROPOSED,
      }),
    }));
    expect(tx.menuProductionLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: {
        snapshot: {
          lines: [expect.objectContaining({
            menuItemId: 'menu-item-1',
            portions: 50,
            targetPortions: 60,
            plannedTime: '09:00',
          })],
        },
      },
    });
    expect(tx.menuItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'menu-item-1', organizationId: 'org-1' },
      data: { portionsOverride: new Prisma.Decimal(60) },
    });
  });

  it('synchronizes linked planning tasks when a batch starts', async () => {
    const tx = {
      productionBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-1',
          reference: 'PROD-2026-001-L01',
          orderId: 'order-1',
          status: ProductionBatchStatus.TO_PREPARE,
          startedAt: null,
          unit: { id: 'portion', symbol: 'portions' },
          plannedQuantity: new Prisma.Decimal(24),
          actualQuantity: null,
          producerUserId: null,
          order: {
            id: 'order-1',
            status: ProductionOrderStatus.VALIDATED,
            outputProduct: { id: 'product-1', name: 'Tarte citron', description: null, unit: { symbol: 'portions' } },
          },
          operations: [{ id: 'operation-1', position: 0, status: 'READY' }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'batch-1', status: ProductionBatchStatus.PREPARING }),
      },
      productionOperation: { update: jest.fn().mockResolvedValue({}) },
      productionOrder: { update: jest.fn().mockResolvedValue({}) },
      operationalTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      organization: { findUnique: jest.fn().mockResolvedValue({ haccpInstalledAt: new Date() }) },
      haccpProduct: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({ id: 'haccp-product-1' }),
        update: jest.fn(),
      },
      haccpProductionSession: { upsert: jest.fn().mockResolvedValue({ id: 'haccp-session-1' }) },
    };
    const prisma = { $transaction: jest.fn().mockImplementation((work) => work(tx)) };
    const service = new ProductionExecutionService(prisma as never, {} as never);

    await service.startBatch('org-1', { ...actor, permissions: [...actor.permissions, 'production.batch.execute'] }, 'batch-1', {});

    expect(tx.operationalTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', productionOperationId: 'operation-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }));
    expect(tx.operationalTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', productionBatchId: 'batch-1', productionOperationId: null },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }));
    expect(tx.haccpProduct.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceProductId: 'product-1', name: 'Tarte citron' }),
    }));
    expect(tx.haccpProductionSession.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { productionBatchId: 'batch-1' },
      create: expect.objectContaining({ source: 'planning', status: 'en_cours', lotNumber: 'PROD-2026-001-L01' }),
    }));
  });

  it('finalizes the same HACCP session with the output lot and traceability data', async () => {
    const tx = {
      organization: { findUnique: jest.fn().mockResolvedValue({ haccpInstalledAt: new Date() }) },
      haccpProduct: { findFirst: jest.fn().mockResolvedValue({ id: 'haccp-product-1' }) },
      haccpProductionSession: {
        upsert: jest.fn().mockResolvedValue({ id: 'haccp-session-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      haccpProcessSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new ProductionExecutionService({} as never, {} as never);
    const startedAt = new Date('2026-07-22T08:00:00.000Z');
    const completedAt = new Date('2026-07-22T09:30:00.000Z');
    const batch = {
      id: 'batch-1', reference: 'PROD-001-L01', producerUserId: 'user-1', startedAt,
      plannedQuantity: new Prisma.Decimal(24), actualQuantity: null,
      unit: { symbol: 'portions' },
      order: { outputProduct: { id: 'product-1', name: 'Tarte citron', unit: { symbol: 'portions' } } },
    };

    await (service as any).syncHaccpProductionCompletionTx(
      tx,
      'org-1',
      'user-1',
      batch,
      { id: 'lot-1', lotNumber: 'LOT-20260722-001' },
      new Prisma.Decimal(22),
      new Prisma.Decimal(2),
      ConservationState.CHILLED,
      new Date('2026-07-25T12:00:00.000Z'),
      completedAt,
      'Rendement ajusté',
    );

    expect(tx.haccpProductionSession.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { productionBatchId: 'batch-1' },
    }));
    expect(tx.haccpProductionSession.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', productionBatchId: 'batch-1' },
      data: expect.objectContaining({
        outputLotId: 'lot-1', lotNumber: 'LOT-20260722-001', status: 'termine',
        conservationState: ConservationState.CHILLED, duration: 90, notes: 'Rendement ajusté',
      }),
    });
    expect(tx.haccpProcessSession.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', productionSessionId: 'haccp-session-1' },
      data: expect.objectContaining({ lotNumber: 'LOT-20260722-001', quantity: new Prisma.Decimal(22), unit: 'portions' }),
    });
  });
});
