import { ConservationState, Prisma, ProductionProfileMode } from '@prisma/client';
import { ProductionPlanningService } from './production-planning.service';

describe('ProductionPlanningService', () => {
  function serviceWith(prisma: Record<string, unknown>) {
    return new ProductionPlanningService(prisma as never);
  }

  it('calculates usable stock after active reservations for the requested site', async () => {
    const prisma = {
      productionProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          organizationId: 'org-1',
          siteId: 'site-a',
          technicalSheetId: 'sheet-1',
          outputProductId: 'product-1',
          outputVariantId: null,
          yieldUnitId: 'unit-1',
          mode: ProductionProfileMode.FIXED,
          referenceYield: new Prisma.Decimal(12),
          minimumQuantity: null,
          optimalQuantity: null,
          maximumQuantity: null,
          stepQuantity: null,
          allowedFormats: null,
          allowHalfBatch: false,
          allowDoubleBatch: false,
          outputProduct: { id: 'product-1' },
          outputVariant: null,
          site: { id: 'site-a' },
          yieldUnit: { id: 'unit-1' },
          technicalSheet: { ingredients: [] },
        }),
      },
      stock: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantity: new Prisma.Decimal(20),
            lot: {
              conservationState: ConservationState.AMBIENT,
              expiresAt: null,
              availableAt: null,
            },
            reservations: [{ quantity: new Prisma.Decimal(12) }],
          },
        ]),
      },
      productionOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = serviceWith(prisma);
    const result = await service.simulateSuggestion('org-1', {
      profileId: 'profile-1',
      grossRequirement: '12',
      neededAt: '2026-07-20T12:00:00.000Z',
    });

    expect(prisma.stock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', siteId: 'site-a' }),
      }),
    );
    expect(result.availability).toEqual({
      physical: '20.000',
      reserved: '12.000',
      usable: '8.000',
      confirmedProduction: '0.000',
    });
    expect(result.scenarios[0]).toMatchObject({ quantity: '12.000', surplusQuantity: '8.000' });
  });

  it('reuses the immutable recipe version when the sheet has not changed', async () => {
    const existing = { id: 'version-2', version: 2 };
    const prisma = {
      technicalSheet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sheet-1',
          updatedAt: new Date('2026-07-18T10:00:00.000Z'),
          referencePortions: new Prisma.Decimal(12),
          ingredients: [],
          steps: [],
        }),
      },
      technicalSheetVersion: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const result = await serviceWith({}).snapshotRecipeTx(prisma as never, 'org-1', 'sheet-1');
    expect(result).toBe(existing);
    expect(prisma.technicalSheetVersion.create).not.toHaveBeenCalled();
  });

  it('creates the next immutable recipe version with decimal snapshots', async () => {
    const prisma = {
      technicalSheet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sheet-1',
          name: 'Biscuit',
          description: null,
          updatedAt: new Date('2026-07-18T10:00:00.000Z'),
          referencePortions: new Prisma.Decimal('12.000'),
          preparationTimeMinutes: 20,
          cookingTimeMinutes: 12,
          totalTimeMinutes: 32,
          ingredients: [
            {
              id: 'ingredient-1',
              productId: 'flour',
              unitId: 'g',
              quantity: new Prisma.Decimal('250.125'),
              comment: null,
              order: 0,
            },
          ],
          steps: [
            {
              id: 'step-1',
              order: 0,
              title: 'Mélanger',
              description: 'Mélanger.',
              estimatedMinutes: 5,
            },
          ],
        }),
      },
      technicalSheetVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ version: 2 }),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'version-3', ...data })),
      },
    };
    const result = await serviceWith({}).snapshotRecipeTx(prisma as never, 'org-1', 'sheet-1');
    expect(result.version).toBe(3);
    expect(result.snapshot).toEqual(
      expect.objectContaining({
        referencePortions: '12',
        ingredients: [expect.objectContaining({ quantity: '250.125' })],
      }),
    );
  });
});
