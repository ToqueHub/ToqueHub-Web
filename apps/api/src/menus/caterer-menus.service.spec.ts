import { CatererEventStatus } from '@prisma/client';
import { CatererMenusService } from './caterer-menus.service';

describe('CatererMenusService', () => {
  const actor = { id: 'user-1', role: 'Manager' };

  it('reports all confirmation blockers without mutating the draft', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }) },
      productionProfile: { findFirst: jest.fn() },
    };
    const service = new CatererMenusService(prisma as any, {} as any);
    jest.spyOn(service, 'getEvent').mockResolvedValue({
      id: 'event-1',
      status: 'DRAFT',
      clientId: null,
      needsReview: false,
      productionSiteId: null,
      startsAt: null,
      address: null,
      fulfillmentMode: 'DELIVERY',
      prestations: [],
    } as any);

    const readiness = await service.readiness('org-1', 'event-1');

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((item) => item.code)).toEqual(expect.arrayContaining([
      'CLIENT_REQUIRED',
      'PRODUCTION_SITE_REQUIRED',
      'EVENT_DATE_REQUIRED',
      'ADDRESS_REQUIRED',
      'PRESTATION_REQUIRED',
    ]));
  });

  it('skips productions already current and regenerates only dirty prestations', async () => {
    const generateProductions = jest.fn().mockResolvedValue({ created: 2, orders: [{ id: 'order-1' }, { id: 'order-2' }] });
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }) },
      productionProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
    };
    const service = new CatererMenusService(prisma as any, { generateProductions } as any);
    jest.spyOn(service, 'readiness').mockResolvedValue({
      ready: true,
      blockers: [],
      event: {
        id: 'event-1',
        status: CatererEventStatus.CONFIRMED,
        prestations: [
          { id: 'prest-1', readyAt: '2026-08-01T08:00:00.000Z', menuId: 'menu-1', menu: { productionGeneratedAt: '2026-07-30T08:00:00.000Z', productionDirtySince: null } },
          { id: 'prest-2', readyAt: '2026-08-01T09:00:00.000Z', menuId: 'menu-2', menu: { productionGeneratedAt: '2026-07-30T08:00:00.000Z', productionDirtySince: '2026-07-31T08:00:00.000Z' } },
        ],
      },
    } as any);

    const result = await service.generateProductions('org-1', actor, 'event-1', {});

    expect(result.skipped).toEqual([{ prestationId: 'prest-1', reason: 'Production déjà à jour' }]);
    expect(generateProductions).toHaveBeenCalledTimes(1);
    expect(generateProductions).toHaveBeenCalledWith('org-1', actor, 'menu-2', expect.objectContaining({ force: true }));
    expect(result.created).toBe(2);
  });

  it('allocates a stable yearly event reference inside the write transaction', async () => {
    const tx = {
      catererEventSequence: { upsert: jest.fn().mockResolvedValue({ value: 42 }) },
      catererEvent: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'event-42', ...data })) },
      menuHistory: { create: jest.fn() },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new CatererMenusService(prisma as any, {} as any);
    jest.spyOn(service, 'getEvent').mockResolvedValue({ id: 'event-42' } as any);

    await service.upsertEvent('org-1', actor, {
      name: 'Mariage Martin',
      startsAt: '2026-08-01T18:00:00.000Z',
      fulfillmentMode: 'DELIVERY',
      prestations: [],
    });

    expect(tx.catererEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reference: 'EVT-2026-0042', name: 'Mariage Martin' }),
    }));
  });
});
