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
  it('uses only the principal POS and builds the four daily checkpoints', async () => {
    const prisma = {
      financeDataSource: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'flatpay-main',
            provider: 'FLATPAY',
            name: 'Flatpay',
            isPrimaryPos: true,
            isPrimarySales: true,
            lastSyncedAt: new Date('2026-08-03T19:05:00.000Z'),
          },
          {
            id: 'paypal-secondary',
            provider: 'PAYPAL_POS',
            name: 'PayPal POS',
            isPrimaryPos: false,
            isPrimarySales: true,
            lastSyncedAt: new Date('2026-08-03T20:00:00.000Z'),
          },
        ]),
      },
      financeDailySales: {
        findMany: jest.fn().mockResolvedValue([
          {
            saleDate: new Date(2026, 7, 3, 6),
            grossAmount: 100,
            transactionCount: 1,
            createdAt: new Date('2026-08-03T07:05:00.000Z'),
          },
          {
            saleDate: new Date(2026, 7, 3, 14),
            grossAmount: 200,
            transactionCount: 2,
            createdAt: new Date('2026-08-03T15:05:00.000Z'),
          },
          {
            saleDate: new Date(2026, 7, 3, 18),
            grossAmount: 300,
            transactionCount: 3,
            createdAt: new Date('2026-08-03T19:05:00.000Z'),
          },
          {
            saleDate: new Date(2026, 7, 3, 22),
            grossAmount: 400,
            transactionCount: 4,
            createdAt: new Date('2026-08-03T23:05:00.000Z'),
          },
        ]),
      },
    };
    const service = new DashboardService(prisma as never, {} as never);

    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 22, 30));
    try {
      const result = await (
        service as unknown as {
          financeTodayRevenue: (organizationId: string) => Promise<{
            grossAmount: number | null;
            transactions: number;
            trend: number[];
            providerLabel: string;
          } | null>;
        }
      ).financeTodayRevenue('organization-1');

      expect(result).toEqual(
        expect.objectContaining({
          grossAmount: 1_000,
          transactions: 10,
          trend: [100, 300, 600, 1_000],
          providerLabel: 'Flatpay',
        }),
      );
      expect(prisma.financeDailySales.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceId: 'flatpay-main' }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
