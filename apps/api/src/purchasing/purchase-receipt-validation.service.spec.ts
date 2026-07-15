import { Prisma, PurchaseOrderStatus, PurchaseReceiptStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StocksReceptionInventoryService } from '../stocks/stocks-reception-inventory.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchaseReceiptValidationService } from './purchase-receipt-validation.service';
import { PurchasingContextService } from './purchasing-context.service';

const actor = {
  id: 'user-1',
  email: 'user@example.com',
  organizationId: 'org-1',
  role: 'Utilisateur',
  permissions: ['purchasing.receive'],
};

function receipt(status: PurchaseReceiptStatus) {
  return {
    id: 'receipt-1',
    organizationId: 'org-1',
    status,
    lines: [
      {
        id: 'receipt-line-1',
        productId: 'product-1',
        unitId: 'unit-1',
        status: 'MATCHED',
        deliveredQuantity: new Prisma.Decimal(2),
        acceptedQuantity: new Prisma.Decimal(2),
        unitsPerOrderUnit: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(3),
      },
    ],
    order: { id: 'order-1', status: PurchaseOrderStatus.ACKNOWLEDGED },
  };
}

describe('PurchaseReceiptValidationService idempotence', () => {
  it('returns an already validated receipt without creating another Stocks reception', async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: new Date(),
          purchasingInstalledAt: new Date(),
        }),
      },
      purchaseReceipt: {
        findFirst: jest.fn().mockResolvedValue(receipt(PurchaseReceiptStatus.VALIDATED)),
      },
      $transaction: jest.fn(),
    };
    const inventory = { applyValidatedLineTx: jest.fn() };
    const database = prisma as unknown as PrismaService;
    const service = new PurchaseReceiptValidationService(
      database,
      new PurchasingContextService(database),
      new PurchaseOrderPolicy(),
      inventory as unknown as StocksReceptionInventoryService,
    );

    const result = await service.validate('org-1', actor, 'receipt-1');

    expect(result.status).toBe(PurchaseReceiptStatus.VALIDATED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(inventory.applyValidatedLineTx).not.toHaveBeenCalled();
  });

  it('uses the transaction lock and existing unique Stocks reception on a concurrent retry', async () => {
    const unlocked = receipt(PurchaseReceiptStatus.DRAFT);
    const locked = receipt(PurchaseReceiptStatus.VALIDATED);
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      purchaseReceipt: { findFirst: jest.fn().mockResolvedValue(locked) },
      stockReception: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stock-reception-1' }),
        create: jest.fn(),
      },
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: new Date(),
          purchasingInstalledAt: new Date(),
        }),
      },
      purchaseReceipt: { findFirst: jest.fn().mockResolvedValue(unlocked) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const inventory = { applyValidatedLineTx: jest.fn() };
    const database = prisma as unknown as PrismaService;
    const service = new PurchaseReceiptValidationService(
      database,
      new PurchasingContextService(database),
      new PurchaseOrderPolicy(),
      inventory as unknown as StocksReceptionInventoryService,
    );

    const result = await service.validate('org-1', actor, 'receipt-1');

    expect(result.status).toBe(PurchaseReceiptStatus.VALIDATED);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.stockReception.findFirst).toHaveBeenCalledWith({
      where: { purchaseReceiptId: 'receipt-1', organizationId: 'org-1' },
    });
    expect(tx.stockReception.create).not.toHaveBeenCalled();
    expect(inventory.applyValidatedLineTx).not.toHaveBeenCalled();
  });
});
