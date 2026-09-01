import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

describe('DashboardService preferences', () => {
  const userId = '00000000-0000-0000-0000-000000000001';
  const organizationId = '00000000-0000-0000-0000-000000000002';

  function createService(existingPreference: Record<string, unknown> | null = null) {
    const prisma = {
      dashboardPreference: {
        findUnique: jest.fn().mockResolvedValue(existingPreference),
        upsert: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new DashboardService(prisma as never, {} as never);
    jest.spyOn(service, 'getDashboard').mockResolvedValue({ preferences: {} } as never);
    return { service, prisma };
  }

  it('uses a fixed sidebar by default', () => {
    const { service } = createService();

    const preferences = (
      service as unknown as { defaultPreferences: () => unknown }
    ).defaultPreferences() as { autoHideSidebar: boolean };

    expect(preferences.autoHideSidebar).toBe(false);
  });

  it('hides optional dashboard widgets by default while keeping them customizable', () => {
    const { service } = createService();

    const preferences = (
      service as unknown as { defaultPreferences: () => unknown }
    ).defaultPreferences() as { hiddenWidgetIds: string[] };

    expect(preferences.hiddenWidgetIds).toEqual([
      'technical-sheets.recipes',
      'hr.latest-employees',
      'technical-sheets.latest',
      'technical-sheets.top-products',
      'planning.coverage',
    ]);
  });

  it('allows a default-hidden widget to be activated', async () => {
    const hiddenWidgetIds = [
      'technical-sheets.recipes',
      'hr.latest-employees',
      'technical-sheets.latest',
      'technical-sheets.top-products',
      'planning.coverage',
    ];
    const { service, prisma } = createService({
      layout: {},
      hiddenWidgetIds,
      pinnedWidgetIds: [],
      autoHideSidebar: false,
    });

    await service.updatePreferences(userId, organizationId, {
      hiddenWidgetIds: hiddenWidgetIds.filter((id) => id !== 'technical-sheets.recipes'),
    });

    expect(prisma.dashboardPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          hiddenWidgetIds: hiddenWidgetIds.filter((id) => id !== 'technical-sheets.recipes'),
        }),
      }),
    );
  });

  it('persists the dynamic sidebar preference for the user and organization', async () => {
    const { service, prisma } = createService({
      layout: {},
      hiddenWidgetIds: [],
      pinnedWidgetIds: [],
      autoHideSidebar: false,
    });

    await service.updatePreferences(userId, organizationId, { autoHideSidebar: true });

    expect(prisma.dashboardPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_organizationId: { userId, organizationId } },
        update: expect.objectContaining({ autoHideSidebar: true }),
        create: expect.objectContaining({ userId, organizationId, autoHideSidebar: true }),
      }),
    );
  });

  it('rejects a non-boolean dynamic sidebar preference', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updatePreferences(userId, organizationId, { autoHideSidebar: 'yes' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dashboardPreference.upsert).not.toHaveBeenCalled();
  });

  it('resets the preference row so defaults are restored', async () => {
    const { service, prisma } = createService();

    await service.resetPreferences(userId, organizationId);

    expect(prisma.dashboardPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId, organizationId },
    });
    expect(service.getDashboard).toHaveBeenCalledWith(userId, organizationId);
  });
});

describe('DashboardService finance cockpit KPI', () => {
  it('agrège les mensualités actives en base sans charger les contrats', async () => {
    const prisma = {
      equipmentFinancingContract: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { monthlyPayment: 1250.255 },
          _count: 3,
        }),
      },
      equipmentProfile: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { monthlyPayment: 249.745 },
          _count: 2,
        }),
      },
    };
    const service = new DashboardService(prisma as never, {} as never);

    const result = await (
      service as unknown as {
        equipmentFinancingSummary: (organizationId: string) => Promise<{
          monthlyTotal: number;
          activeContractCount: number;
        }>;
      }
    ).equipmentFinancingSummary('organization-1');

    expect(result).toEqual({ monthlyTotal: 1500, activeContractCount: 5 });
    expect(prisma.equipmentFinancingContract.aggregate).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        OR: [{ financingEnd: null }, { financingEnd: { gte: expect.any(Date) } }],
      },
      _sum: { monthlyPayment: true },
      _count: true,
    });
    expect(prisma.equipmentProfile.aggregate).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        financingContractId: null,
        acquisitionMode: { not: 'CASH' },
        OR: [{ financingEnd: null }, { financingEnd: { gte: expect.any(Date) } }],
      },
      _sum: { monthlyPayment: true },
      _count: true,
    });
  });

  it('sépare les établissements, additionne leurs POS et déduplique une source renommée', async () => {
    const prisma = {
      site: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'kuusamo', name: 'Kuusamo' },
          { id: 'oulu', name: 'Oulu' },
        ]),
      },
      financeDataSource: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'flatpay-main',
            provider: 'FLATPAY',
            name: 'Flatpay',
            siteId: 'kuusamo',
            isPrimaryPos: true,
            isPrimarySales: true,
            lastSyncedAt: new Date('2026-08-03T19:05:00.000Z'),
          },
          {
            id: 'flatpay-renamed',
            provider: 'FLATPAY',
            name: 'FlatPay POS · Kuusamo',
            siteId: 'kuusamo',
            isPrimaryPos: false,
            isPrimarySales: false,
            lastSyncedAt: new Date('2026-08-03T19:06:00.000Z'),
          },
          {
            id: 'paypal-kuusamo',
            provider: 'PAYPAL_POS',
            name: 'PayPal POS',
            siteId: 'kuusamo',
            isPrimaryPos: false,
            isPrimarySales: true,
            lastSyncedAt: new Date('2026-08-03T20:00:00.000Z'),
          },
          {
            id: 'flatpay-oulu',
            provider: 'FLATPAY',
            name: 'FlatPay POS · Oulu',
            siteId: 'oulu',
            isPrimaryPos: true,
            isPrimarySales: true,
            lastSyncedAt: new Date('2026-08-03T23:00:00.000Z'),
          },
          {
            id: 'loyverse-disabled',
            provider: 'LOYVERSE',
            name: 'Loyverse · Oulu',
            siteId: 'oulu',
            isPrimaryPos: false,
            isPrimarySales: false,
            lastSyncedAt: null,
          },
        ]),
      },
      financeDailySales: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceId: 'flatpay-main',
            saleDate: new Date(2026, 7, 3, 6),
            grossAmount: 100,
            transactionCount: 1,
            paymentMethod: 'Card',
            metadata: { receiptNumber: '100' },
            createdAt: new Date('2026-08-03T07:05:00.000Z'),
            source: {
              provider: 'FLATPAY',
              siteId: 'kuusamo',
              isPrimaryPos: true,
            },
          },
          {
            sourceId: 'flatpay-renamed',
            saleDate: new Date(2026, 7, 3, 6),
            grossAmount: 100,
            transactionCount: 1,
            paymentMethod: 'Card',
            metadata: { receiptNumber: '100' },
            createdAt: new Date('2026-08-03T07:06:00.000Z'),
            source: {
              provider: 'FLATPAY',
              siteId: 'kuusamo',
              isPrimaryPos: false,
            },
          },
          {
            sourceId: 'flatpay-renamed',
            saleDate: new Date(2026, 7, 3, 14),
            grossAmount: 200,
            transactionCount: 2,
            paymentMethod: 'Card',
            metadata: { receiptNumber: '101' },
            createdAt: new Date('2026-08-03T15:05:00.000Z'),
            source: {
              provider: 'FLATPAY',
              siteId: 'kuusamo',
              isPrimaryPos: false,
            },
          },
          {
            sourceId: 'paypal-kuusamo',
            saleDate: new Date(2026, 7, 3, 18),
            grossAmount: 50,
            transactionCount: 1,
            paymentMethod: 'Card',
            metadata: { receiptNumber: 'P-1' },
            createdAt: new Date('2026-08-03T19:05:00.000Z'),
            source: {
              provider: 'PAYPAL_POS',
              siteId: 'kuusamo',
              isPrimaryPos: false,
            },
          },
          {
            sourceId: 'flatpay-oulu',
            saleDate: new Date(2026, 7, 3, 22),
            grossAmount: 400,
            transactionCount: 4,
            paymentMethod: 'Card',
            metadata: { receiptNumber: 'O-1' },
            createdAt: new Date('2026-08-03T23:05:00.000Z'),
            source: {
              provider: 'FLATPAY',
              siteId: 'oulu',
              isPrimaryPos: true,
            },
          },
        ]),
      },
    };
    const service = new DashboardService(prisma as never, {} as never);

    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 22, 30));
    try {
      const result = await (
        service as unknown as {
          financeTodayRevenues: (organizationId: string) => Promise<{
            sites: Array<{
              siteId: string;
              grossAmount: number | null;
              transactions: number;
              trend: number[];
              providerLabel: string;
            }>;
            total: { grossAmount: number; transactions: number; trend: number[] } | null;
          } | null>;
        }
      ).financeTodayRevenues('organization-1');

      expect(result?.sites).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            siteId: 'kuusamo',
            grossAmount: 350,
            transactions: 4,
            trend: [100, 300, 350, 350],
            providerLabel: 'FlatPay + PayPal POS',
          }),
          expect.objectContaining({
            siteId: 'oulu',
            grossAmount: 400,
            transactions: 4,
            trend: [0, 0, 0, 400],
            providerLabel: 'FlatPay',
          }),
        ]),
      );
      expect(result?.total).toEqual(
        expect.objectContaining({
          grossAmount: 750,
          transactions: 8,
          trend: [100, 300, 350, 750],
        }),
      );
      expect(prisma.financeDailySales.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: {
              in: ['flatpay-main', 'flatpay-renamed', 'paypal-kuusamo', 'flatpay-oulu'],
            },
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
