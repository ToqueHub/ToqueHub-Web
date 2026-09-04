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

  it('blocks confirmation when ready, handoff and service times are not chronological', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }) },
    };
    const service = new CatererMenusService(prisma as any, {} as any);
    jest.spyOn(service, 'getEvent').mockResolvedValue({
      id: 'event-1',
      status: 'DRAFT',
      clientId: 'client-1',
      needsReview: false,
      productionSiteId: 'site-1',
      startsAt: '2026-08-01T18:00:00.000Z',
      address: '1 rue du Test',
      fulfillmentMode: 'DELIVERY',
      prestations: [
        {
          id: 'prest-1',
          name: 'Dîner',
          readyAt: '2026-08-01T11:00:00.000Z',
          handoffAt: '2026-08-01T10:00:00.000Z',
          serviceAt: '2026-08-01T12:00:00.000Z',
          expectedGuests: 20,
          menu: { items: [{ technicalSheetId: 'sheet-1' }] },
        },
      ],
    } as any);

    const readiness = await service.readiness('org-1', 'event-1', false);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PRESTATION_TIMES_ORDER_INVALID' }),
      ]),
    );
  });

  it('preloads recipe quantities and logistics without fabricating stock-only products', async () => {
    const prisma = {
      operationalTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CatererMenusService(prisma as any, {} as any);
    jest.spyOn(service, 'getEvent').mockResolvedValue({
      id: 'event-1',
      reference: 'EVT-2026-0042',
      name: 'Mariage Martin',
      fulfillmentMode: 'DELIVERY',
      productionSiteId: 'site-1',
      startsAt: '2026-08-01T18:00:00.000Z',
      address: '1 rue du Test',
      prestations: [
        {
          id: 'prest-1',
          name: 'Cocktail',
          menuId: 'menu-1',
          expectedGuests: 50,
          readyAt: '2026-08-01T08:00:00.000Z',
          handoffAt: '2026-08-01T10:00:00.000Z',
          serviceAt: '2026-08-01T12:00:00.000Z',
          menu: {
            productionLinks: [],
            items: [
              {
                id: 'item-recipe',
                section: 'MAIN',
                technicalSheetId: 'sheet-1',
                technicalSheet: { id: 'sheet-1', name: 'Bouchées' },
                servingQuantity: 0.2,
              },
              {
                id: 'item-stock',
                section: 'DRINK',
                productId: 'product-1',
                product: { id: 'product-1', name: 'Jus de pomme' },
                servingQuantity: 1,
              },
            ],
          },
        },
      ],
    } as any);

    const plan = await service.productionPlan('org-1', 'event-1');

    expect(plan.lines).toEqual([
      expect.objectContaining({
        menuItemId: 'item-recipe',
        portions: 10,
        productionDate: '2026-08-01T08:00:00.000Z',
      }),
    ]);
    expect(plan.stockProducts).toEqual([
      expect.objectContaining({ menuItemId: 'item-stock', quantity: 50 }),
    ]);
    expect(plan.logistics).toHaveLength(2);
  });

  it('preserves MenuItem identifiers when an event is edited', async () => {
    const existing = {
      id: 'event-1',
      reference: 'EVT-2026-0042',
      status: 'DRAFT',
      productionSiteId: null,
      prestations: [
        {
          id: 'prest-1',
          menuId: 'menu-1',
          menu: {
            productionGeneratedAt: null,
            productionLinks: [],
            items: [
              {
                id: 'item-1',
                technicalSheetId: 'sheet-1',
                productId: null,
              },
            ],
          },
        },
      ],
    };
    const tx = {
      catererEvent: { update: jest.fn().mockResolvedValue(existing) },
      menu: { update: jest.fn() },
      menuItem: {
        update: jest.fn().mockResolvedValue({ id: 'item-1' }),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      catererPrestation: { update: jest.fn().mockResolvedValue({ id: 'prest-1' }) },
      menuHistory: { create: jest.fn() },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }) },
      catererEvent: { findFirst: jest.fn().mockResolvedValue(existing) },
      technicalSheet: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sheet-1', name: 'Bouchées', outputProductId: 'product-1' }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new CatererMenusService(prisma as any, {} as any);
    jest.spyOn(service, 'getEvent').mockResolvedValue({ id: 'event-1' } as any);

    await service.upsertEvent(
      'org-1',
      actor,
      {
        name: 'Mariage Martin',
        startsAt: '2026-08-01T18:00:00.000Z',
        fulfillmentMode: 'PICKUP',
        prestations: [
          {
            id: 'prest-1',
            name: 'Cocktail',
            service: 'EVENT',
            expectedGuests: 50,
            items: [
              {
                id: 'item-1',
                section: 'MAIN',
                technicalSheetId: 'sheet-1',
                servingQuantity: 1,
              },
            ],
          },
        ],
      },
      'event-1',
    );

    expect(tx.menuItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'item-1' } }),
    );
    expect(tx.menuItem.create).not.toHaveBeenCalled();
  });

  it('keeps the production day distinct from the caterer ready deadline', async () => {
    const generateProductions = jest.fn().mockResolvedValue({ orders: [{ id: 'order-1' }] });
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }) },
      hrDepartment: { findFirst: jest.fn().mockResolvedValue({ id: 'kitchen-1' }) },
    };
    const execution = {
      rescheduleCampaign: jest.fn(),
      cancelCampaign: jest.fn(),
    };
    const service = new CatererMenusService(
      prisma as any,
      { generateProductions } as any,
      execution as any,
    );
    const plan = {
      event: {
        id: 'event-1',
        reference: 'EVT-2026-0042',
        status: 'CONFIRMED',
        prestations: [],
      },
      lines: [
        {
          menuItemId: 'item-1',
          menuId: 'menu-1',
          technicalSheetName: 'Bouchées',
          readyAt: '2026-08-01T10:00:00.000Z',
          productionOrderId: null,
        },
      ],
      logistics: [],
      stockProducts: [],
      focusDate: '2026-07-30T08:00:00.000Z',
    };
    jest.spyOn(service, 'productionPlan').mockResolvedValue(plan as any);
    jest
      .spyOn(service as any, 'decorateEventProductionLinks')
      .mockResolvedValue(undefined);

    await service.saveProductionPlan('org-1', actor, 'event-1', {
      serviceId: 'kitchen-1',
      lines: [
        {
          menuItemId: 'item-1',
          portions: 120,
          productionDate: '2026-07-30T00:00:00.000Z',
          plannedTime: '08:00',
        },
      ],
      logistics: [],
    });

    expect(generateProductions).toHaveBeenCalledWith(
      'org-1',
      actor,
      'menu-1',
      expect.objectContaining({
        neededAt: '2026-08-01T10:00:00.000Z',
        lines: [
          expect.objectContaining({
            productionDate: expect.stringContaining('2026-07-30'),
            plannedTime: '08:00',
          }),
        ],
      }),
    );
  });

  it('rejects a logistics-only service as the fabrication owner', async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }),
      },
      hrDepartment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'logistics-1',
          name: 'Logistique',
          positions: [
            {
              name: 'Chauffeur-livreur',
              department: { name: 'Logistique' },
            },
          ],
        }),
      },
    };
    const service = new CatererMenusService(
      prisma as any,
      {} as any,
      { rescheduleCampaign: jest.fn() } as any,
    );
    jest.spyOn(service, 'productionPlan').mockResolvedValue({
      event: { id: 'event-1', status: 'CONFIRMED' },
      lines: [],
      logistics: [],
    } as any);

    await expect(
      service.saveProductionPlan('org-1', actor, 'event-1', {
        serviceId: 'logistics-1',
        lines: [],
        logistics: [],
      }),
    ).rejects.toThrow(
      'Le service responsable doit comporter au moins un métier autorisé à réaliser une fiche technique.',
    );
  });

  it('creates caterer logistics as unplaced operational tasks', async () => {
    const upsert = jest.fn().mockImplementation(({ create }) => ({
      id: 'task-logistics-1',
      ...create,
    }));
    const prisma = {
      hrDepartment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'logistics-1' }),
      },
      operationalTask: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
    };
    const service = new CatererMenusService(prisma as any, {} as any);
    const plan = {
      event: {
        id: 'event-1',
        reference: 'EVT-2026-0042',
        productionSiteId: 'site-1',
      },
      logistics: [
        {
          key: 'CATERER:event-1:prest-1:PACKING',
          title: 'Conditionnement & chargement · Cocktail',
          description: 'Préparer la remise.',
          menuId: 'menu-1',
        },
      ],
    };

    await (service as any).saveLogisticsPlan(
      'org-1',
      actor,
      plan,
      'logistics-1',
      [
        {
          key: 'CATERER:event-1:prest-1:PACKING',
          enabled: true,
          startsAt: '2026-08-01T08:00:00.000Z',
          endsAt: '2026-08-01T10:00:00.000Z',
        },
      ],
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceKey: 'CATERER:event-1:prest-1:PACKING',
          source: 'MENU',
          category: 'LOGISTICS',
          isTimeScheduled: false,
        }),
      }),
    );
  });
});
