import { EquipmentAcquisitionMode, Prisma } from '@prisma/client';
import { EquipmentFinancingService } from './equipment-financing.service';

describe('EquipmentFinancingService', () => {
  it('uses the Fennoa payment as the displayed source and keeps one monthly contract amount', async () => {
    const prisma: any = {
      equipmentFinancingContract: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'contract-1',
            organizationId: 'org-1',
            supplierId: null,
            acquisitionMode: EquipmentAcquisitionMode.LEASING,
            contractNumber: '096-59401',
            financingProvider: 'GRENKE',
            termMonths: 36,
            installmentAmount: new Prisma.Decimal(555.76),
            paymentFrequency: 'QUARTERLY',
            monthlyPayment: new Prisma.Decimal(185.25),
            financingStart: null,
            financingEnd: null,
            financedAmount: null,
            buyoutValue: new Prisma.Decimal(300),
            currency: 'EUR',
            source: 'TOQUEHUB',
            sourceConfidence: new Prisma.Decimal(0.94),
            notes: null,
            createdAt: new Date('2026-08-30T00:00:00Z'),
            updatedAt: new Date('2026-08-30T00:00:00Z'),
            supplier: null,
            documents: [],
            equipmentProfiles: [
              { product: { id: 'machine-1', name: 'La Marzocco GB5', sku: null } },
              { product: { id: 'machine-2', name: 'Mazzer grinder', sku: null } },
            ],
          },
        ]),
      },
      equipmentProfile: { findMany: jest.fn().mockResolvedValue([]) },
      financeDataSource: {
        findMany: jest.fn().mockResolvedValue([{ id: 'fennoa-1', name: 'Fennoa' }]),
      },
      financeAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { code: '7330', name: 'Leasingkulut', nameEn: 'Leasing costs', nameSv: null },
          ]),
      },
      financeLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            externalKey: 'entry-1',
            externalStatementId: 'voucher-1',
            accountCode: '7330',
            entryDate: new Date('2026-08-15T00:00:00Z'),
            debit: new Prisma.Decimal(555.76),
            description: 'GRENKE contract 096-59401',
            series: 'AB',
            number: 1,
            sourceEntityId: null,
            sourceUrl: 'https://fennoa.example/entry-1',
          },
        ]),
      },
    };

    const result = await new EquipmentFinancingService(prisma).list('org-1');

    expect(result.summary).toEqual(
      expect.objectContaining({
        activeContractCount: 1,
        monthlyTotal: 185.25,
        fennoaReconciledCount: 1,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        source: 'FENNOA',
        monthlyPayment: 185.25,
        registeredMonthlyPayment: 185.25,
      }),
    );
    expect(result.items[0].equipment).toHaveLength(2);
  });
});
