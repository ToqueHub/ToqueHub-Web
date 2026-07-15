import type { Prisma } from '@prisma/client';
import { PurchaseOrderNumberService } from './purchase-order-number.service';

describe('PurchaseOrderNumberService', () => {
  it('uses an atomic increment instead of count() + 1', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });
    const tx = { purchaseNumberSequence: { upsert } } as unknown as Prisma.TransactionClient;
    const numbers = await Promise.all([
      new PurchaseOrderNumberService().next(tx, 'org-1', new Date('2026-07-15T10:00:00Z')),
      new PurchaseOrderNumberService().next(tx, 'org-1', new Date('2026-07-15T10:00:00Z')),
    ]);

    expect(numbers).toEqual(['CA-2026-00001', 'CA-2026-00002']);
    expect(upsert).toHaveBeenCalledWith({
      where: { organizationId_year: { organizationId: 'org-1', year: 2026 } },
      update: { value: { increment: 1 } },
      create: { organizationId: 'org-1', year: 2026, value: 1 },
    });
  });
});
