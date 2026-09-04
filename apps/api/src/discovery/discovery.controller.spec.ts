import { DiscoveryController } from './discovery.controller';

describe('DiscoveryController', () => {
  it('returns discovery metadata from the service', async () => {
    const info = {
      instanceId: 'instance-1',
      instanceName: 'Cuisine Centrale',
      organization: 'Cuisine Centrale',
      version: '0.1.0',
      apiVersion: 1,
      serverTime: '2026-06-29T12:00:00.000Z',
      supportsMobile: true as const,
    };
    const service = { getDiscoveryInfo: jest.fn().mockResolvedValue(info) };
    const controller = new DiscoveryController(service as any);

    await expect(controller.getDiscoveryInfo()).resolves.toEqual(info);
    expect(service.getDiscoveryInfo).toHaveBeenCalledTimes(1);
  });
});
