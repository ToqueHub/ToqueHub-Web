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
