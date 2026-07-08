import { MobilePushService } from './mobile-push.service';

const orgId = '11111111-1111-1111-1111-111111111111';

function createPrismaMock() {
  return {
    mobilePushToken: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;
}

describe('MobilePushService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('deactivates Expo tokens rejected as DeviceNotRegistered', async () => {
    const prisma = createPrismaMock();
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { token: 'ExpoPushToken[valid-1]' },
      { token: 'ExpoPushToken[invalid-1]' },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [
          { status: 'ok' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    }) as any;

    const service = new MobilePushService(prisma);
    const result = await service.sendToOrganization(orgId, { title: 'Alerte', body: 'Température critique' });

    expect(result).toEqual({ sent: 1 });
    expect(prisma.mobilePushToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: orgId, token: { in: ['ExpoPushToken[invalid-1]'] } },
      data: expect.objectContaining({ isActive: false }),
    }));
  });

  it('swallows Expo network errors without throwing', async () => {
    const prisma = createPrismaMock();
    prisma.mobilePushToken.findMany.mockResolvedValue([{ token: 'ExpoPushToken[valid-1]' }]);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const service = new MobilePushService(prisma);
    await expect(service.sendToOrganization(orgId, { title: 'Alerte', body: 'Température critique' })).resolves.toEqual({ sent: 0 });
  });
});

