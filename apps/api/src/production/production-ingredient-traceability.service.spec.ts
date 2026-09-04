import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductionIngredientTraceabilityService } from './production-ingredient-traceability.service';

const organizationId = '22222222-2222-2222-2222-222222222222';
const batchId = 'batch-1';
const actor = { id: '11111111-1111-1111-1111-111111111111' };

const photo = (documentId: string) => ({
  documentId,
  path: `/uploads/haccp/${documentId}.jpg`,
  storagePath: `${organizationId}/production-ingredients/${batchId}/${documentId}.jpg`,
  originalName: `${documentId}.jpg`,
  mimeType: 'image/jpeg',
  size: 1200,
  uploadedAt: '2026-07-30T08:00:00.000Z',
});

function batch(overrides: Record<string, any> = {}) {
  return {
    id: batchId,
    organizationId,
    reference: 'FAB-2026-001',
    status: 'PREPARING',
    plannedQuantity: new Prisma.Decimal(20),
    actualQuantity: null,
    unit: { id: 'kg', symbol: 'kg' },
    plannedStartAt: new Date('2026-07-30T06:00:00.000Z'),
    startedAt: new Date('2026-07-30T06:02:00.000Z'),
    completedAt: null,
    recipeVersion: {
      version: 4,
      referenceYield: new Prisma.Decimal(10),
      snapshot: {
        name: 'Croissants',
        yieldMode: 'PORTIONS',
        referencePortions: 10,
        ingredients: [
          { id: 'flour', productId: 'product-flour', productName: 'Farine', quantity: 1, unitSymbol: 'kg', order: 1 },
          { id: 'butter', productId: 'product-butter', productName: 'Beurre', quantity: 0.5, unitSymbol: 'kg', order: 2 },
        ],
      },
    },
    operations: [
      { id: 'op-1', title: 'Pétrissage', position: 1, status: 'COMPLETED', notes: null, activeMinutes: 15 },
      { id: 'op-2', title: 'Tourage', position: 2, status: 'PENDING', notes: null, activeMinutes: null },
    ],
    operationalTasks: [
      {
        id: 'task-1',
        title: 'Croissants · Pétrissage',
        startsAt: new Date('2026-07-30T06:00:00.000Z'),
        endsAt: new Date('2026-07-30T06:30:00.000Z'),
        status: 'DONE',
        assignedEmployee: { id: 'employee-1', firstName: 'Alice', lastName: 'Martin' },
      },
      {
        id: 'task-2',
        title: 'Croissants · Tourage',
        startsAt: new Date('2026-07-30T06:30:00.000Z'),
        endsAt: new Date('2026-07-30T07:15:00.000Z'),
        status: 'IN_PROGRESS',
        assignedEmployee: { id: 'employee-1', firstName: 'Alice', lastName: 'Martin' },
      },
    ],
    haccpIngredientTraceability: [
      {
        id: 'trace-flour',
        ingredientKey: 'flour',
        ingredientNameSnapshot: 'Farine',
        unitSnapshot: 'kg',
        lotNumber: 'F-2048',
        barcode: '376000000001',
        photos: [photo('document-flour')],
        completedAt: new Date('2026-07-30T06:10:00.000Z'),
      },
    ],
    order: {
      site: { id: 'site-1', name: 'Laboratoire principal' },
      technicalSheetId: 'recipe-1',
      technicalSheet: {
        name: 'Croissants',
        yieldMode: 'PORTIONS',
        referencePortions: 10,
        totalMassGrams: null,
        ingredients: [],
      },
    },
    ...overrides,
  };
}

function prismaMock(currentBatch: any = batch()) {
  return {
    productionBatch: {
      findFirst: jest.fn().mockResolvedValue(currentBatch),
      findMany: jest.fn().mockResolvedValue([currentBatch]),
    },
    haccpProductionIngredientTraceability: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    document: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
  } as any;
}

describe('ProductionIngredientTraceabilityService', () => {
  it('isolates batch reads by organization', async () => {
    const prisma = prismaMock(null);
    const service = new ProductionIngredientTraceabilityService(prisma);

    await expect(service.get(organizationId, batchId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productionBatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: batchId, organizationId },
    }));
  });

  it('shares one global ingredient evidence set across every task of the production batch', async () => {
    const prisma = prismaMock();
    const service = new ProductionIngredientTraceabilityService(prisma);

    const detail = await service.get(organizationId, batchId);

    expect(detail.tasks).toHaveLength(2);
    expect(detail.ingredients).toEqual([
      expect.objectContaining({ key: 'flour', quantity: '2.000', completed: true }),
      expect.objectContaining({ key: 'butter', quantity: '1.000', completed: false }),
    ]);
    expect(detail.summary).toEqual({ expected: 2, completed: 1, missing: 1, isComplete: false });
  });

  it('rejects invalid images and more than three retained/new proofs', async () => {
    const prisma = prismaMock();
    const service = new ProductionIngredientTraceabilityService(prisma);

    await expect(service.save(organizationId, actor, batchId, 'flour', {}, [{
      buffer: Buffer.from('not-an-image'),
      mimetype: 'text/plain',
      originalname: 'proof.txt',
      size: 12,
    }])).rejects.toBeInstanceOf(BadRequestException);

    const threePhotos = [photo('one'), photo('two'), photo('three')];
    prisma.productionBatch.findFirst.mockResolvedValue(batch({
      haccpIngredientTraceability: [{
        id: 'trace-flour',
        ingredientKey: 'flour',
        photos: threePhotos,
      }],
    }));
    await expect(service.save(
      organizationId,
      actor,
      batchId,
      'flour',
      { retainedPhotoIds: threePhotos.map((item) => item.documentId) },
      [{ buffer: Buffer.from('image'), mimetype: 'image/jpeg', originalname: 'four.jpg', size: 5 }],
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRODUCTION_TRACEABILITY_PHOTO_LIMIT', maximum: 3 }),
    });
  });

  it('returns an idempotent response without writing the same mutation twice', async () => {
    const currentBatch: any = batch();
    const prisma = prismaMock(currentBatch);
    prisma.haccpProductionIngredientTraceability.findFirst.mockResolvedValue({
      id: 'trace-flour',
      organizationId,
      productionBatchId: batchId,
      ingredientKey: 'flour',
      idempotencyKey: 'mobile-request-1',
    });
    const service = new ProductionIngredientTraceabilityService(prisma);

    const detail = await service.save(
      organizationId,
      actor,
      batchId,
      'flour',
      { retainedPhotoIds: ['document-flour'], idempotencyKey: 'mobile-request-1' },
    );

    expect(detail.summary.completed).toBe(1);
    expect(prisma.haccpProductionIngredientTraceability.upsert).not.toHaveBeenCalled();
  });

  it('blocks completion until every ingredient has a photo, then accepts it', async () => {
    const currentBatch: any = batch();
    const prisma = prismaMock(currentBatch);
    const service = new ProductionIngredientTraceabilityService(prisma);

    await expect(
      service.assertCompleteTx(prisma as any, organizationId, batchId),
    ).rejects.toMatchObject({
      response: {
        code: 'PRODUCTION_TRACEABILITY_INCOMPLETE',
        missingIngredients: [{ key: 'butter', name: 'Beurre' }],
      },
    });

    currentBatch.haccpIngredientTraceability.push({
      id: 'trace-butter',
      ingredientKey: 'butter',
      ingredientNameSnapshot: 'Beurre',
      unitSnapshot: 'kg',
      lotNumber: null,
      barcode: null,
      photos: [photo('document-butter')],
      completedAt: new Date(),
    });

    await expect(
      service.assertCompleteTx(prisma as any, organizationId, batchId),
    ).resolves.toBeUndefined();
  });
});
