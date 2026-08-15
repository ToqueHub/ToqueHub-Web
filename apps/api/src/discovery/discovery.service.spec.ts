import { DiscoveryService } from './discovery.service';

describe('DiscoveryService', () => {
  const createService = (overrides: Record<string, string | undefined> = {}) => {
    const settings = new Map<string, { key: string; value: string }>();
    const config = {
      get: jest.fn((key: string) => overrides[key]),
    } as any;
    const prisma = {
      systemSetting: {
        findUnique: jest.fn(async ({ where }: any) => settings.get(where.key) ?? null),
        create: jest.fn(async ({ data }: any) => {
          settings.set(data.key, data);
          return data;
        }),
      },
      organization: {
        count: jest.fn(async () => 1),
        findFirst: jest.fn(async () => ({ name: 'Cuisine Centrale' })),
      },
      user: {
        count: jest.fn(async () => 1),
        findFirst: jest.fn(async () => null),
      },
    } as any;
    const publisher = { publish: jest.fn(), stop: jest.fn() };
    const service = new DiscoveryService(config, prisma, publisher as any);

    return { service, prisma, publisher };
  };

  it('returns public discovery metadata with a stable persisted instance id', async () => {
    const { service, prisma } = createService();

    const first = await service.getDiscoveryInfo();
    const second = await service.getDiscoveryInfo();

    expect(first.instanceId).toEqual(second.instanceId);
    expect(first).toEqual(expect.objectContaining({
      instanceName: 'Cuisine Centrale',
      organization: 'Cuisine Centrale',
      apiVersion: 1,
      supportsMobile: true,
      localUrl: 'http://toquehub-pi.local:3000',
    }));
    expect(prisma.systemSetting.create).toHaveBeenCalledTimes(1);
  });

  it('advertises distinct local and Tailscale URLs to mobile clients', async () => {
    const { service } = createService({
      TOQUEHUB_WEB_URL: 'http://toquehub.local:8080',
      TOQUEHUB_TAILSCALE_DNS_NAME: 'toquehub.example.ts.net.',
      TOQUEHUB_TAILSCALE_IP: '100.101.102.103',
      TOQUEHUB_REMOTE_ACCESS_URL: 'http://toquehub.example.ts.net:8080',
      TOQUEHUB_HTTP_PORT: '8080',
    });

    await expect(service.getDiscoveryInfo()).resolves.toEqual(expect.objectContaining({
      localUrl: 'http://toquehub.local:8080',
      remoteUrl: 'http://100.101.102.103:8080',
      recommendedUrl: 'http://100.101.102.103:8080',
    }));
  });

  it('publishes _toquehub._tcp with TXT records', async () => {
    const { service, publisher } = createService({
      TOQUEHUB_DISCOVERY_NAME: 'Restaurant Les Pins',
      TOQUEHUB_DISCOVERY_HTTPS: 'true',
      PORT: '3000',
      npm_package_version: '0.1.0',
    });

    await service.publish();

    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      name: expect.stringMatching(/^Restaurant Les Pins \([a-f0-9]{8}\)$/),
      port: 3000,
      txt: expect.objectContaining({
        instanceName: 'Restaurant Les Pins',
        version: '0.1.0',
        apiVersion: '1',
        https: 'true',
      }),
    }));
  });

  it('uses the configured ToqueHub version before npm package metadata', async () => {
    const { service } = createService({
      TOQUEHUB_VERSION: 'v1.4.2',
      TOQUEHUB_IMAGE_TAG: 'latest',
      npm_package_version: '0.1.0',
    });

    await expect(service.getDiscoveryInfo()).resolves.toEqual(expect.objectContaining({
      version: '1.4.2',
    }));
  });

  it('stops publication on shutdown', () => {
    const { service, publisher } = createService();

    service.onApplicationShutdown();

    expect(publisher.stop).toHaveBeenCalledTimes(1);
  });
});
