import type { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchasingSuggestionService } from './purchasing-suggestion.service';

describe('PurchasingSuggestionService supplier packs', () => {
  it('rounds the base-unit need to complete supplier packs and values every unit in the pack', async () => {
    const prisma = {
      site: { findMany: jest.fn().mockResolvedValue([{ id: 'site-1' }]) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'milk-1',
            name: 'Pirkka laktoositon maitojuoma 1l 3%',
            averagePrice: 1.1959,
            minimumStock: 21,
            unitsPerPackage: 20,
            stocks: [],
            siteAssignments: [{ siteId: 'site-1', minimumStock: 21 }],
          },
        ]),
      },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const context = {
      assertInstalled: jest.fn().mockResolvedValue(undefined),
      ensureSettings: jest.fn().mockResolvedValue({
        consumptionWindowDays: 30,
        replenishmentDays: 7,
      }),
    };
    const service = new PurchasingSuggestionService(
      prisma as unknown as PrismaService,
      context as never,
      new PurchaseOrderPolicy(),
    );

    const result = await service.list(
      'org-1',
      {
        id: 'user-1',
        email: 'user@example.com',
        organizationId: 'org-1',
        role: 'Utilisateur',
        permissions: ['purchasing.draft'],
      },
      'supplier-kespro',
      'site-1',
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        targetStock: 21,
        recommendedQuantity: 2,
        estimatedAmount: 47.836,
      }),
    );
  });
});
