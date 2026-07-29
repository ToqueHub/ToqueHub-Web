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
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
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
    expect(
      tx.stockReservation.create.mock.calls.map(([call]) => call.data.quantity.toFixed(3)),
    ).toEqual(['3.000', '5.000']);
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(tx.stock.updateMany).not.toHaveBeenCalled();
    expect(tx.productionMaterialRequirement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ProductionMaterialStatus.OK }),
      }),
    );
  });

  it('publishes one complete-recipe task while keeping recipe operations in the background', async () => {
    const tx = {
      productionOperation: { update: jest.fn().mockResolvedValue({}) },
      operationalTask: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'task-whole' }),
      },
      operationalTaskAssignment: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new ProductionExecutionService({} as never, {} as never);

    await (service as any).createOperationalTasksTx(tx, 'org-1', 'user-1', {
      id: 'order-1',
      number: 'CP-1',
      name: 'Velouté de potimarron',
      serviceId: 'kitchen',
      siteId: 'site-1',
      technicalSheetId: 'sheet-1',
      technicalSheet: { name: 'Velouté de potimarron' },
      assignments: [
        {
          employeeId: 'chef-1',
          isLead: true,
          planningAssignmentId: 'shift-1',
        },
      ],
      batches: [
        {
          id: 'batch-1',
          plannedStartAt: new Date('2026-07-20T07:00:00.000Z'),
          plannedQuantity: new Prisma.Decimal(40),
          unit: { symbol: 'portions' },
          operations: [
            { id: 'op-1', position: 0, title: 'Tailler', activeMinutes: 20 },
            { id: 'op-2', position: 1, title: 'Cuire', activeMinutes: 40 },
          ],
        },
        {
          id: 'batch-2',
          plannedStartAt: new Date('2026-07-20T07:00:00.000Z'),
          plannedQuantity: new Prisma.Decimal(10),
          unit: { symbol: 'portions' },
          operations: [
            { id: 'op-3', position: 0, title: 'Tailler', activeMinutes: 20 },
            { id: 'op-4', position: 1, title: 'Cuire', activeMinutes: 40 },
          ],
        },
      ],
      validatedQuantity: new Prisma.Decimal(50),
    });

    expect(tx.productionOperation.update).toHaveBeenCalledTimes(4);
    expect(tx.operationalTask.create).toHaveBeenCalledTimes(1);
    expect(tx.operationalTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Recette complète · Velouté de potimarron',
        productionBatchId: 'batch-1',
        productionOperationId: null,
        technicalSheetStepId: null,
        assignedEmployeeId: 'chef-1',
        isTimeScheduled: false,
        quantity: new Prisma.Decimal(50),
      }),
    });
  });

  it('converts a requested total mass into the native production yield', () => {
    const service = new ProductionExecutionService({} as never, {} as never);
    const outputQuantity = (service as any).productionTargetToOutputQuantity(
      {
        referenceYield: new Prisma.Decimal(10),
        technicalSheet: {
          yieldMode: 'PORTIONS',
          referencePortions: new Prisma.Decimal(10),
          totalMassGrams: new Prisma.Decimal(2500),
        },
      },
      '10',
      'MASS',
      new Prisma.Decimal(5000),
    );

    expect(outputQuantity.toFixed(3)).toBe('20.000');
  });

  it('creates the full quantity requested for a manual fabrication even when output is already available', async () => {
    const profile = {
      id: 'profile-moonan',
      siteId: 'site-1',
      technicalSheetId: 'sheet-moonan',
      outputProductId: 'product-moonan',
      outputVariantId: null,
      yieldUnitId: 'portion',
      referenceYield: new Prisma.Decimal(10),
      site: { id: 'site-1' },
      outputProduct: {
        id: 'product-moonan',
        unitId: 'portion',
        unit: { id: 'portion', symbol: 'portions' },
      },
      outputVariant: null,
      yieldUnit: { id: 'portion', symbol: 'portions' },
      technicalSheet: {
        id: 'sheet-moonan',
        name: 'Moonan mustikkapiirakka',
        yieldMode: 'PORTIONS',
        referencePortions: new Prisma.Decimal(10),
        totalMassGrams: new Prisma.Decimal(1000),
        ingredients: [],
        steps: [],
      },
    };
    const tx = {
      productionOrder: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'campaign-manual',
          ...data,
        })),
      },
      productionHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      productionProfile: {
        findFirst: jest.fn().mockResolvedValue(profile),
      },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const planning = {
      getAvailability: jest.fn().mockResolvedValue({
        usable: new Prisma.Decimal(20),
        confirmedProduction: new Prisma.Decimal(30),
      }),
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
      snapshotRecipeTx: jest.fn().mockResolvedValue({ id: 'recipe-version-1' }),
    };
    const service = new ProductionExecutionService(prisma as never, planning as never);
    jest.spyOn(service as any, 'nextCampaignNumber').mockResolvedValue('CP-2026-00001');
    jest.spyOn(service as any, 'createRequirements').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'createBatchesAndOperations').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'createSubRecipeNeeds').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getCampaignTx').mockResolvedValue({ id: 'campaign-manual' });
    const reserveExistingOutput = jest
      .spyOn(service as any, 'reserveExistingOutputForCoverage')
      .mockResolvedValue(new Prisma.Decimal(0));

    await service.createCampaign('org-1', actor, {
      profileId: 'profile-moonan',
      grossRequirement: '10',
      neededAt: '2026-07-31T10:00:00.000Z',
      plannedTime: '10:00',
    });

    expect(tx.productionOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'MANUAL_REACTIVE',
        status: ProductionOrderStatus.PROPOSED,
        plannedPortions: new Prisma.Decimal(10),
        grossRequirement: new Prisma.Decimal(10),
        netRequirement: new Prisma.Decimal(10),
        proposedQuantity: new Prisma.Decimal(10),
      }),
    });
    expect(reserveExistingOutput).not.toHaveBeenCalled();
    expect((service as any).createBatchesAndOperations).toHaveBeenCalled();
  });

  it('attaches a menu need to the free quantity of an existing validated fabrication', async () => {
    const existingCampaign = {
      id: 'campaign-existing',
      status: ProductionOrderStatus.VALIDATED,
      productionDate: new Date('2026-08-03T08:00:00.000Z'),
      validatedQuantity: new Prisma.Decimal(30),
      plannedPortions: new Prisma.Decimal(30),
      needAllocations: [{ plannedQuantity: new Prisma.Decimal(10) }],
    };
    const tx = {
      productionNeed: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'need-menu-moonan',
          siteId: 'site-1',
          productId: 'product-moonan',
          variantId: null,
          quantity: new Prisma.Decimal(10),
          coveredQuantity: new Prisma.Decimal(0),
          neededAt: new Date('2026-08-03T10:00:00.000Z'),
          allocations: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      productionOrder: {
        findMany: jest.fn().mockResolvedValue([existingCampaign]),
        findFirstOrThrow: jest
          .fn()
          .mockResolvedValue({ id: existingCampaign.id }),
      },
      productionNeedAllocation: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      productionHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const service = new ProductionExecutionService(prisma as never, {} as never);

    const result = await service.attachNeedToCompatibleCampaign(
      'org-1',
      actor,
      'need-menu-moonan',
    );

    expect(tx.productionNeedAllocation.upsert).toHaveBeenCalledWith({
      where: {
        needId_orderId: {
          needId: 'need-menu-moonan',
          orderId: 'campaign-existing',
        },
      },
      create: expect.objectContaining({
        organizationId: 'org-1',
        needId: 'need-menu-moonan',
        orderId: 'campaign-existing',
        plannedQuantity: new Prisma.Decimal(10),
      }),
      update: {
        plannedQuantity: { increment: new Prisma.Decimal(10) },
      },
    });
    expect(tx.productionNeed.update).toHaveBeenCalledWith({
      where: { id: 'need-menu-moonan' },
      data: { status: 'PARTIALLY_COVERED' },
    });
    expect(result).toEqual({ id: 'campaign-existing' });
  });

  it('cancels a past fabrication left entirely unplaced and releases its stock reservations', async () => {
    const pastTask = {
      status: 'TODO',
      endsAt: new Date('2026-07-28T18:00:00.000Z'),
      isTimeScheduled: false,
      assignedEmployeeId: 'employee-1',
      assignments: [{ id: 'assignment-1' }],
    };
    const pastUnassignedTask = {
      status: 'TODO',
      endsAt: new Date('2026-07-28T18:30:00.000Z'),
      isTimeScheduled: true,
      assignedEmployeeId: null,
      assignments: [],
    };
    const tx = {
      productionOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'campaign-expired',
            number: 'CP-2026-00001',
            name: 'Moonan mustikkapiirakka',
            needAllocations: [],
            batches: [{ operationalTasks: [pastTask, pastUnassignedTask] }],
          },
          {
            id: 'campaign-assigned',
            number: 'CP-2026-00002',
            name: 'Velouté',
            needAllocations: [],
            batches: [
              {
                operationalTasks: [
                  {
                    ...pastTask,
                    isTimeScheduled: true,
                    assignedEmployeeId: 'employee-1',
                  },
                ],
              },
            ],
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockReservation: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      productionOperation: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      productionBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      operationalTask: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      productionNeed: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      productionNeedAllocation: { count: jest.fn().mockResolvedValue(0) },
      productionHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const service = new ProductionExecutionService(prisma as never, {} as never);

    const result = await service.cancelExpiredUnassignedCampaigns(
      'org-1',
      actor,
      new Date('2026-07-29T12:00:00.000Z'),
    );

    expect(result).toMatchObject({
      cancelledCount: 1,
      cancelled: [
        {
          id: 'campaign-expired',
          number: 'CP-2026-00001',
          name: 'Moonan mustikkapiirakka',
        },
      ],
    });
    expect(tx.productionOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.productionOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'campaign-expired' }),
        data: expect.objectContaining({ status: ProductionOrderStatus.CANCELLED }),
      }),
    );
    expect(tx.stockReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: 'campaign-expired',
          status: StockReservationStatus.ACTIVE,
        }),
        data: expect.objectContaining({ status: StockReservationStatus.RELEASED }),
      }),
    );
    expect(tx.operationalTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(tx.productionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'campaign-expired',
          action: 'CANCELLED',
        }),
      }),
    );
  });

  it('refuses validation when free stock cannot cover the components', async () => {
    const { service, tx } = fixture('20');
    await expect(
      service.validateCampaign('org-1', actor, 'campaign-1', {
        idempotencyKey: 'request-shortage',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRODUCTION_COMPONENT_SHORTAGE' }),
    });
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
      reservations: [{ quantity: new Prisma.Decimal(8), status: StockReservationStatus.ACTIVE }],
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
        findMany: jest.fn().mockResolvedValue([
          {
            technicalSheetId: 'recipe-cake',
            outputProductId: 'cake',
            outputVariantId: null,
            technicalSheet: { id: 'recipe-cake', name: 'Biscuit Joconde', mode: 'PRODUCTION' },
            outputProduct: { id: 'cake', name: 'Biscuit Joconde', unit: { symbol: 'pc' } },
            outputVariant: null,
          },
        ]),
      },
      productionBatch: {
        findMany: jest.fn().mockResolvedValue([
          {
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
          },
        ]),
      },
    };
    const service = new ProductionExecutionService(prisma as never, {} as never);

    const result = await service.listProductionStock('org-1', { pageSize: 25 });

    expect(result.summary).toEqual([
      expect.objectContaining({
        technicalSheetName: 'Biscuit Joconde',
        producedQuantity: '10.000',
        storedQuantity: '4.000',
        reservedQuantity: '1.000',
        availableQuantity: '3.000',
        batchCount: 1,
        lastProducedAt: completedAt,
      }),
    ]);
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
      menuProductionLinks: [
        {
          id: 'link-1',
          snapshot: {
            lines: [
              {
                menuItemId: 'menu-item-1',
                technicalSheetId: 'sheet-1',
                portions: 30,
                targetPortions: 40,
                openingCarryOverPortions: 10,
                plannedTime: '08:00',
              },
            ],
          },
        },
      ],
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
    const service = new ProductionExecutionService(prisma as never, planning as never);
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

    expect(tx.productionOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'campaign-1' },
        data: expect.objectContaining({
          grossRequirement: new Prisma.Decimal(50),
          plannedTime: '09:00',
          serviceId: 'department-kitchen',
          status: ProductionOrderStatus.PROPOSED,
        }),
      }),
    );
    expect(tx.menuProductionLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: {
        snapshot: {
          lines: [
            expect.objectContaining({
              menuItemId: 'menu-item-1',
              portions: 50,
              targetPortions: 60,
              plannedTime: '09:00',
            }),
          ],
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
            outputProduct: {
              id: 'product-1',
              name: 'Tarte citron',
              description: null,
              unit: { symbol: 'portions' },
            },
          },
          operations: [{ id: 'operation-1', position: 0, status: 'READY' }],
        }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'batch-1', status: ProductionBatchStatus.PREPARING }),
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

    await service.startBatch(
      'org-1',
      { ...actor, permissions: [...actor.permissions, 'production.batch.execute'] },
      'batch-1',
      {},
    );

    expect(tx.operationalTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', productionOperationId: 'operation-1' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }),
    );
    expect(tx.operationalTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          productionBatchId: 'batch-1',
          productionOperationId: null,
        },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }),
    );
    expect(tx.haccpProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceProductId: 'product-1', name: 'Tarte citron' }),
      }),
    );
    expect(tx.haccpProductionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productionBatchId: 'batch-1' },
        create: expect.objectContaining({
          source: 'planning',
          status: 'en_cours',
          lotNumber: 'PROD-2026-001-L01',
        }),
      }),
    );
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
      id: 'batch-1',
      reference: 'PROD-001-L01',
      producerUserId: 'user-1',
      startedAt,
      plannedQuantity: new Prisma.Decimal(24),
      actualQuantity: null,
      unit: { symbol: 'portions' },
      order: {
        outputProduct: { id: 'product-1', name: 'Tarte citron', unit: { symbol: 'portions' } },
      },
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

    expect(tx.haccpProductionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productionBatchId: 'batch-1' },
      }),
    );
    expect(tx.haccpProductionSession.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', productionBatchId: 'batch-1' },
      data: expect.objectContaining({
        outputLotId: 'lot-1',
        lotNumber: 'LOT-20260722-001',
        status: 'termine',
        conservationState: ConservationState.CHILLED,
        duration: 90,
        notes: 'Rendement ajusté',
      }),
    });
    expect(tx.haccpProcessSession.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', productionSessionId: 'haccp-session-1' },
      data: expect.objectContaining({
        lotNumber: 'LOT-20260722-001',
        quantity: new Prisma.Decimal(22),
        unit: 'portions',
      }),
    });
  });

  it('previews a production day with recipe multipliers and reserved ingredient quantities', async () => {
    const tx = {
      site: {
        findFirst: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Cuisine centrale' }),
      },
      productionOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-1',
            number: 'CP-2026-00001',
            name: 'Croissants',
            siteId: 'site-1',
            serviceId: 'service-kitchen',
            productionDate: new Date('2026-07-28T00:00:00.000Z'),
            plannedTime: '06:00',
            status: ProductionOrderStatus.VALIDATED,
            grossRequirement: new Prisma.Decimal(40),
            plannedPortions: new Prisma.Decimal(40),
            service: { id: 'service-kitchen', name: 'Boulangerie' },
            technicalSheet: {
              id: 'sheet-croissant',
              name: 'Croissants',
              referencePortions: new Prisma.Decimal(10),
            },
            requirements: [
              {
                id: 'requirement-flour',
                productId: 'flour',
                productNameSnapshot: 'Farine',
                unitId: 'kg',
                requiredQuantity: new Prisma.Decimal(8),
                product: {
                  id: 'flour',
                  unitId: 'kg',
                  unit: { id: 'kg', symbol: 'kg' },
                },
                unit: { id: 'kg', symbol: 'kg' },
              },
            ],
            assignments: [
              {
                employeeId: 'employee-1',
                isLead: true,
                employee: {
                  id: 'employee-1',
                  firstName: 'Alice',
                  lastName: 'Martin',
                  email: 'alice@example.com',
                },
                planningAssignment: {
                  id: 'shift-1',
                  status: 'PUBLISHED',
                  startTime: new Date('2026-07-28T05:00:00.000Z'),
                  endTime: new Date('2026-07-28T14:00:00.000Z'),
                },
              },
            ],
            stockReservations: [
              {
                productId: 'flour',
                quantity: new Prisma.Decimal(8),
              },
            ],
            batches: [
              {
                id: 'batch-1',
                reference: 'CP-2026-00001-L01',
                status: ProductionBatchStatus.TO_PREPARE,
                plannedQuantity: new Prisma.Decimal(40),
                unit: { id: 'portion', symbol: 'portions' },
                consumptions: [],
              },
            ],
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const service = new ProductionExecutionService(prisma as never, {} as never);

    const result = await service.previewProductionDay('org-1', actor, {
      siteId: 'site-1',
      date: '2026-07-28',
    });

    expect(result).toMatchObject({
      ready: true,
      completed: false,
      pendingBatchCount: 1,
      blockingIssues: [],
      totals: [
        expect.objectContaining({
          productName: 'Farine',
          quantity: '8.000',
          unitSymbol: 'kg',
        }),
      ],
      orders: [
        expect.objectContaining({
          requestedPortions: '40.000',
          referencePortions: '10.000',
          recipeMultiplier: '4.000',
          team: [
            expect.objectContaining({
              name: 'Alice Martin',
              worksDuringProduction: true,
            }),
          ],
        }),
      ],
    });

    const [order] = await tx.productionOrder.findMany.mock.results[0].value;
    order.batches[0].operationalTasks = [
      {
        id: 'task-next-day',
        title: 'Façonner les croissants',
        status: 'TODO',
        productionOperationId: 'operation-2',
        startsAt: new Date('2026-07-29T05:00:00.000Z'),
        endsAt: new Date('2026-07-29T06:00:00.000Z'),
      },
    ];
    const deferred = await service.previewProductionDay('org-1', actor, {
      siteId: 'site-1',
      date: '2026-07-28',
    });

    expect(deferred.ready).toBe(false);
    expect(deferred.blockingIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PRODUCTION_STEPS_DEFERRED' })]),
    );
  });

  it('completes every remaining batch when the production day is confirmed', async () => {
    const service = new ProductionExecutionService({} as never, {} as never);
    const ready = {
      site: { id: 'site-1', name: 'Cuisine' },
      date: '2026-07-28',
      ready: true,
      completed: false,
      pendingBatchCount: 1,
      blockingIssues: [],
      totals: [],
      orders: [
        {
          id: 'order-1',
          batches: [
            {
              id: 'batch-1',
              status: ProductionBatchStatus.TO_PREPARE,
              plannedQuantity: '40.000',
            },
          ],
        },
      ],
    };
    const completed = {
      ...ready,
      ready: false,
      completed: true,
      pendingBatchCount: 0,
      orders: [],
    };
    jest
      .spyOn(service as any, 'productionDaySnapshot')
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce(completed);
    const start = jest.spyOn(service, 'startBatch').mockResolvedValue({} as never);
    const complete = jest.spyOn(service, 'completeBatch').mockResolvedValue({} as never);

    const result = await service.validateProductionDay(
      'org-1',
      { ...actor, permissions: [...actor.permissions, 'production.batch.execute'] },
      {
        siteId: 'site-1',
        date: '2026-07-28',
        idempotencyKey: 'day-validation-1',
      },
    );

    expect(start).toHaveBeenCalledWith('org-1', expect.anything(), 'batch-1', {
      idempotencyKey: 'day-validation-1',
    });
    expect(complete).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      'batch-1',
      expect.objectContaining({
        actualQuantity: '40.000',
        lostQuantity: '0',
      }),
    );
    expect(result).toBe(completed);
  });
});
