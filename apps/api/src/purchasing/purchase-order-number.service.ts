import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class PurchaseOrderNumberService {
  async next(
    tx: Prisma.TransactionClient,
    organizationId: string,
    now = new Date(),
  ) {
    const year = now.getFullYear();
    const sequence = await tx.purchaseNumberSequence.upsert({
      where: { organizationId_year: { organizationId, year } },
      update: { value: { increment: 1 } },
      create: { organizationId, year, value: 1 },
    });
    return `CA-${year}-${String(sequence.value).padStart(5, '0')}`;
  }
}
