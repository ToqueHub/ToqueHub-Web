import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { MenusService } from './menus.service';

describe('MenusService card availability', () => {
  const installedOrganization = {
    technicalSheetsInstalledAt: new Date(),
    productionInstalledAt: new Date(),
    menusInstalledAt: new Date(),
    primarySiteId: 'site-1',
  };

  it('combines finished stock, work in progress and missing sub-recipes', async () => {
    const unit = { id: 'unit-piece', symbol: 'pc' };
    const rootProduct = { id: 'product-snicker', name: 'Snicker', unitId: unit.id, unit };
    const childProduct = { id: 'product-ganache', name: 'Ganache', unitId: unit.id, unit };
    const rawProduct = {
      id: 'product-chocolate',
      name: 'Chocolat',
      unitId: unit.id,
      unit,
      averagePrice: 2,
    };
    const rootSheet = {
      id: 'sheet-snicker',
      name: 'Snicker',
      outputProductId: rootProduct.id,
      outputProduct: rootProduct,
      yieldUnitId: unit.id,
      yieldUnit: unit,
      referencePortions: 10,
      totalCost: 20,
      costPerPortion: 2,
      ingredients: [
        {
          id: 'line-ganache',
          productId: childProduct.id,
          product: childProduct,
          unitId: unit.id,
          unit,
          quantity: 5,
          cost: 5,
          unitPriceSnapshot: 1,
          sourceTechnicalSheetId: 'sheet-ganache',
        },
      ],
    };
    const childSheet = {
      id: 'sheet-ganache',
      name: 'Ganache',
      outputProductId: childProduct.id,
      outputProduct: childProduct,
      yieldUnitId: unit.id,
      yieldUnit: unit,
      referencePortions: 5,
      totalCost: 4,
      costPerPortion: 0.8,
      ingredients: [
        {
          id: 'line-chocolate',
          productId: rawProduct.id,
          product: rawProduct,
          unitId: unit.id,
          unit,
          quantity: 2,
          cost: 4,
          unitPriceSnapshot: 2,
          sourceTechnicalSheetId: null,
        },
      ],
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      menu: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Carte principale',
          kind: 'CATALOG',
          siteId: 'site-1',
          site: { id: 'site-1', name: 'Café' },
          expectedGuests: 0,
          guestForecasts: [],
          items: [
            {
              id: 'item-1',
              technicalSheetId: rootSheet.id,
              technicalSheet: rootSheet,
              menuCategory: { id: 'cat-1', name: 'Sucré' },
              servingQuantity: 1,
              targetReadyQuantity: 10,
              portionsOverride: null,
              availabilityEnabled: true,
            },
          ],
        }),
      },
      technicalSheet: { findMany: jest.fn().mockResolvedValue([rootSheet, childSheet]) },
      stock: {
        groupBy: jest.fn().mockResolvedValue([
          { productId: rootProduct.id, _sum: { quantity: 3 } },
          { productId: childProduct.id, _sum: { quantity: 1 } },
          { productId: rawProduct.id, _sum: { quantity: 10 } },
        ]),
      },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      productionOrder: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              outputProductId: rootProduct.id,
              plannedPortions: 2,
              proposedQuantity: 0,
              validatedQuantity: 0,
              realizedPortions: 0,
              status: 'PLANNED',
            },
          ]),
      },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    const report = await service.availability('org-1', 'menu-1');

    expect(report.summary).toEqual({ total: 1, ready: 0, lowStock: 0, toProduce: 1, blocked: 0 });
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        status: 'COMPONENT_MISSING',
        availablePortions: 3,
        projectedPortions: 5,
        toProducePortions: 5,
        recipeCost: 20,
        costPerPortion: 2,
      }),
    );
    expect(report.items[0].components[0]).toEqual(
      expect.objectContaining({
        name: 'Ganache',
        requiredQuantity: 5,
        availableQuantity: 1,
        missingQuantity: 4,
        unitPrice: 1,
        estimatedCost: 5,
        recipeCost: 4,
        costPerPortion: 0.8,
        status: 'TO_PRODUCE',
      }),
    );
    expect(report.items[0].components[0].children[0]).toEqual(
      expect.objectContaining({
        name: 'Chocolat',
        unitPrice: 2,
        estimatedCost: 3.2,
      }),
    );
  });

  it('creates draft Production needs instead of immediately launching orders', async () => {
    const createNeed = jest.fn().mockResolvedValue({ id: 'need-1', status: 'DRAFT' });
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      productionProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'profile-1', yieldUnitId: 'unit-piece' }),
      },
      productionNeed: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      menuHistory: { create: jest.fn() },
    };
    const service = new MenusService(prisma as any, { createNeed } as any, {} as any);
    jest.spyOn(service, 'availability').mockResolvedValue({
      menu: { id: 'menu-1', name: 'Carte principale', kind: 'CATALOG', siteId: 'site-1' },
      generatedAt: new Date(),
      summary: { total: 1, ready: 0, lowStock: 0, toProduce: 1, blocked: 0 },
      items: [
        {
          id: 'item-1',
          technicalSheetId: 'sheet-snicker',
          name: 'Snicker',
          outputProduct: { id: 'product-snicker', name: 'Snicker', unit: { id: 'unit-piece' } },
          servingQuantity: 1,
          targetPortions: 10,
          toProduceQuantity: 5,
          toProducePortions: 5,
          status: 'TO_PRODUCE',
          components: [],
        },
      ],
    } as any);

    const result = await service.planShortages(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      'menu-1',
      {},
    );

    expect(result.created).toBe(1);
    expect(createNeed).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      expect.objectContaining({
        source: 'MENU',
        sourceReferenceType: 'MenuAvailabilityItem',
        quantity: '5.000',
        status: 'DRAFT',
      }),
    );
    expect(prisma.menuHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AVAILABILITY_PLANNED' }),
      }),
    );
  });

  it('plans only the selected menu products with their customized quantities and service', async () => {
    const sheet = {
      id: 'sheet-snicker',
      name: 'Snicker',
      status: 'ACTIVE',
      isArchived: false,
      outputProductId: 'product-snicker',
      ingredients: [],
    };
    const menu = {
      id: 'menu-1',
      organizationId: 'org-1',
      name: 'Menu du mardi',
      status: 'VALIDATED',
      activity: 'RESTAURANT_CAFE',
      siteId: 'site-1',
      date: new Date('2026-07-28T00:00:00.000Z'),
      expectedGuests: 50,
      guestForecasts: [],
      productionGeneratedAt: null,
      productionDirtySince: null,
      productionLinks: [],
      items: [
        {
          id: 'item-snicker',
          technicalSheetId: sheet.id,
          technicalSheet: sheet,
          section: 'DESSERT',
          portionsOverride: null,
          servingQuantity: 1,
        },
      ],
    };
    const tx = {
      menu: { update: jest.fn().mockResolvedValue({}) },
      menuHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      menu: {
        findFirst: jest.fn().mockResolvedValue(menu),
        update: jest.fn(),
      },
      productionProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-snicker',
          outputProductId: 'product-snicker',
          outputVariantId: null,
          yieldUnitId: 'unit-piece',
          outputProduct: { id: 'product-snicker' },
          outputVariant: null,
          yieldUnit: { id: 'unit-piece' },
        }),
      },
      productionNeed: { findFirst: jest.fn().mockResolvedValue(null) },
      menuProductionLink: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const createNeed = jest.fn().mockResolvedValue({ id: 'need-1' });
    const createCampaign = jest.fn().mockResolvedValue({
      id: 'campaign-1',
      recipeVersionId: 'recipe-version-1',
    });
    const ensureProductionProfile = jest.fn().mockResolvedValue({
      id: 'profile-snicker',
      technicalSheetId: 'sheet-snicker',
      outputProductId: 'product-snicker',
      outputVariantId: null,
      yieldUnitId: 'unit-piece',
      referenceYield: new Prisma.Decimal(24),
    });
    const service = new MenusService(
      prisma as any,
      { createNeed } as any,
      { createCampaign } as any,
      { ensureProductionProfile } as any,
    );

    const result = await service.generateProductions(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      'menu-1',
      {
        mode: 'DETAILED',
        serviceId: 'department-kitchen',
        plannedTime: '07:30',
        lines: [{ menuItemId: 'item-snicker', portions: 45 }],
      },
    );

    expect(createCampaign).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      expect.objectContaining({
        grossRequirement: '45.000',
        plannedTime: '07:30',
        serviceId: 'department-kitchen',
      }),
    );
    expect(ensureProductionProfile).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      'sheet-snicker',
      'site-1',
    );
    expect(prisma.menuProductionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        menuId: 'menu-1',
        snapshot: expect.objectContaining({
          lines: [
            expect.objectContaining({
              menuItemId: 'item-snicker',
              portions: 45,
              plannedTime: '07:30',
            }),
          ],
        }),
      }),
    });
    expect(tx.menu.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productionGeneratedAt: expect.any(Date) }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        created: 1,
        allMenuProductsPlanned: true,
      }),
    );
  });

  it('links a menu product to the validated fabrication that already covers it', async () => {
    const sheet = {
      id: 'sheet-moonan',
      name: 'Moonan mustikkapiirakka',
      status: 'ACTIVE',
      isArchived: false,
      outputProductId: 'product-moonan',
      ingredients: [],
    };
    const menu = {
      id: 'menu-1',
      organizationId: 'org-1',
      name: 'Production du lundi',
      status: 'VALIDATED',
      activity: 'RESTAURANT_CAFE',
      siteId: 'site-1',
      date: new Date('2026-08-03T00:00:00.000Z'),
      expectedGuests: 0,
      guestForecasts: [],
      productionGeneratedAt: null,
      productionDirtySince: null,
      productionLinks: [],
      items: [
        {
          id: 'item-moonan',
          technicalSheetId: sheet.id,
          technicalSheet: sheet,
          section: 'DESSERT',
          portionsOverride: new Prisma.Decimal(10),
          servingQuantity: 1,
        },
      ],
    };
    const tx = {
      menu: { update: jest.fn().mockResolvedValue({}) },
      menuHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      menu: {
        findFirst: jest.fn().mockResolvedValue(menu),
        update: jest.fn(),
      },
      productionNeed: { findFirst: jest.fn().mockResolvedValue(null) },
      menuProductionLink: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const createNeed = jest.fn().mockResolvedValue({ id: 'need-moonan' });
    const createCampaign = jest.fn().mockRejectedValue(
      new ConflictException({
        code: 'PRODUCTION_NEED_COVERED_BY_CONFIRMED_FUTURE_OUTPUT',
      }),
    );
    const attachNeedToCompatibleCampaign = jest.fn().mockResolvedValue({
      id: 'campaign-existing',
      recipeVersionId: 'recipe-version-existing',
    });
    const ensureProductionProfile = jest.fn().mockResolvedValue({
      id: 'profile-moonan',
      technicalSheetId: sheet.id,
      outputProductId: sheet.outputProductId,
      outputVariantId: null,
      yieldUnitId: 'unit-piece',
      referenceYield: new Prisma.Decimal(1),
    });
    const service = new MenusService(
      prisma as any,
      { createNeed } as any,
      { createCampaign, attachNeedToCompatibleCampaign } as any,
      { ensureProductionProfile } as any,
    );

    const result = await service.generateProductions(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      'menu-1',
      {
        mode: 'DETAILED',
        serviceId: 'department-kitchen',
        plannedTime: '08:00',
        lines: [{ menuItemId: 'item-moonan', portions: 10 }],
      },
    );

    expect(attachNeedToCompatibleCampaign).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      'need-moonan',
    );
    expect(prisma.menuProductionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        menuId: 'menu-1',
        productionOrderId: 'campaign-existing',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        created: 0,
        reused: 1,
        orders: [expect.objectContaining({ id: 'campaign-existing' })],
        allMenuProductsPlanned: true,
      }),
    );
  });

  it('creates a dated production plan from the permanent card using the requested portions', async () => {
    const sourceItem = {
      id: 'catalog-item-snickers',
      section: 'DESSERT',
      menuCategoryId: 'category-desserts',
      dietId: null,
      position: 0,
      servingQuantity: new Prisma.Decimal(1),
      availabilityEnabled: true,
      technicalSheetId: 'sheet-snickers',
      technicalSheet: {
        id: 'sheet-snickers',
        name: 'Snickers',
        outputProductId: 'product-snickers',
      },
    };
    const catalog = {
      id: 'catalog-food',
      name: 'Carte nourriture',
      kind: 'CATALOG',
      service: 'SNACK',
      items: [sourceItem],
    };
    const tx = {
      menu: {
        create: jest.fn().mockResolvedValue({ id: 'daily-menu-1' }),
      },
      menuItem: {
        create: jest.fn().mockResolvedValue({
          id: 'daily-item-snickers',
          technicalSheetId: 'sheet-snickers',
        }),
      },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      site: { findFirst: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Café' }) },
      menu: {
        findFirst: jest.fn().mockResolvedValueOnce(catalog).mockResolvedValueOnce(null),
      },
      productionProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            technicalSheetId: 'sheet-snickers',
            outputProductId: 'product-snickers',
            outputProduct: { id: 'product-snickers' },
          },
        ]),
      },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);
    const generate = jest.spyOn(service, 'generateProductions').mockResolvedValue({
      created: 1,
      orders: [{ id: 'order-1' }],
    } as any);
    jest.spyOn(service, 'getMenu').mockResolvedValue({
      id: 'daily-menu-1',
      name: 'Production',
    } as any);

    const result = await service.planCatalogProductionDay(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      'catalog-food',
      {
        siteId: 'site-1',
        date: '2026-07-28',
        serviceId: 'department-kitchen',
        plannedTime: '08:00',
        lines: [
          {
            menuItemId: 'catalog-item-snickers',
            targetPortions: 50,
          },
        ],
      },
    );

    expect(generate).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      'daily-menu-1',
      expect.objectContaining({
        serviceId: 'department-kitchen',
        lines: [
          {
            menuItemId: 'daily-item-snickers',
            portions: 50,
            targetPortions: 50,
            openingCarryOverPortions: 0,
            plannedTime: '08:00',
          },
        ],
      }),
    );
    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        targetPortions: 50,
        openingCarryOverPortions: 0,
        portions: 50,
      }),
    );
  });

  it('updates the objective of an existing planned card product instead of creating a duplicate', async () => {
    const sourceItem = {
      id: 'catalog-item-veloute',
      section: 'STARTER',
      menuCategoryId: 'category-starters',
      dietId: null,
      position: 0,
      servingQuantity: new Prisma.Decimal(1),
      availabilityEnabled: true,
      technicalSheetId: 'sheet-veloute',
      technicalSheet: {
        id: 'sheet-veloute',
        name: 'Velouté de potimarron',
        outputProductId: 'product-veloute',
      },
    };
    const catalog = {
      id: 'catalog-food',
      name: 'Carte nourriture',
      kind: 'CATALOG',
      service: 'SNACK',
      items: [sourceItem],
    };
    const existingDailyMenu = {
      id: 'daily-menu-1',
      productionGeneratedAt: new Date('2026-07-27T08:00:00.000Z'),
      productionDirtySince: null,
      items: [
        {
          id: 'daily-item-veloute',
          technicalSheetId: 'sheet-veloute',
          dietId: null,
          portionsOverride: new Prisma.Decimal(50),
        },
      ],
      productionLinks: [
        {
          id: 'link-1',
          productionOrderId: 'order-1',
          productionOrder: {
            id: 'order-1',
            technicalSheetId: 'sheet-veloute',
            status: 'PROPOSED',
          },
          snapshot: {
            lines: [
              {
                menuItemId: 'daily-item-veloute',
                technicalSheetId: 'sheet-veloute',
                portions: 50,
                targetPortions: 50,
                openingCarryOverPortions: 0,
                plannedTime: '08:00',
              },
            ],
          },
        },
      ],
    };
    const tx = {
      menu: {
        update: jest.fn().mockResolvedValue(existingDailyMenu),
      },
      menuItem: {
        update: jest.fn().mockResolvedValue(existingDailyMenu.items[0]),
      },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      site: { findFirst: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Café' }) },
      menu: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(catalog)
          .mockResolvedValueOnce(existingDailyMenu),
        update: jest.fn().mockResolvedValue({}),
      },
      productionDayClosure: { findFirst: jest.fn().mockResolvedValue(null) },
      productionProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            technicalSheetId: 'sheet-veloute',
            outputProductId: 'product-veloute',
            outputProduct: { id: 'product-veloute' },
          },
        ]),
      },
      menuProductionLink: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const rescheduleCampaign = jest.fn().mockResolvedValue({
      id: 'order-1',
      grossRequirement: '500.000',
    });
    const service = new MenusService(prisma as any, {} as any, { rescheduleCampaign } as any);
    const generate = jest.spyOn(service, 'generateProductions');
    jest.spyOn(service, 'getMenu').mockResolvedValue({
      id: 'daily-menu-1',
      name: 'Vitrine',
    } as any);

    const result = await service.planCatalogProductionDay(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      'catalog-food',
      {
        siteId: 'site-1',
        date: '2026-07-27',
        serviceId: 'department-kitchen',
        plannedTime: '09:00',
        lines: [
          {
            menuItemId: 'catalog-item-veloute',
            targetPortions: 500,
          },
        ],
      },
    );

    expect(rescheduleCampaign).toHaveBeenCalledWith('org-1', expect.anything(), 'order-1', {
      grossRequirement: '500.000',
      plannedTime: '09:00',
      serviceId: 'department-kitchen',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(prisma.menuProductionLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: {
        snapshot: expect.objectContaining({
          lines: [
            expect.objectContaining({
              targetPortions: 500,
              portions: 500,
              plannedTime: '09:00',
            }),
          ],
        }),
      },
    });
    expect(result.generation).toEqual(
      expect.objectContaining({
        created: 0,
        updated: 1,
        orders: [expect.objectContaining({ id: 'order-1' })],
      }),
    );
  });

  it('accepts every active stock-tracked technical sheet as a menu item', async () => {
    const prisma = {
      technicalSheet: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'sheet-biscuit',
            name: 'Biscuit Joconde',
            mode: 'PRODUCTION',
            status: 'ACTIVE',
            outputProductId: 'product-biscuit',
          })
          .mockResolvedValueOnce({
            id: 'sheet-snicker',
            name: 'Snicker',
            mode: 'ASSEMBLY',
            status: 'ACTIVE',
            outputProductId: 'product-snicker',
          }),
      },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    await expect(
      (service as any).ensureRefs('org-1', { items: [{ technicalSheetId: 'sheet-biscuit' }] }),
    ).resolves.toBeUndefined();
    await expect(
      (service as any).ensureRefs('org-1', { items: [{ technicalSheetId: 'sheet-snicker' }] }),
    ).resolves.toBeUndefined();
  });

  it('tracks a card item coming directly from Stocks without proposing production', async () => {
    const unit = { id: 'unit-bottle', symbol: 'bt' };
    const product = { id: 'product-wine', name: 'Vin rouge maison', unitId: unit.id, unit };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      menu: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-drinks',
          name: 'Carte des boissons',
          kind: 'CATALOG',
          siteId: 'site-1',
          site: { id: 'site-1' },
          expectedGuests: 0,
          guestForecasts: [],
          items: [
            {
              id: 'item-wine',
              productId: product.id,
              product,
              technicalSheetId: null,
              menuCategory: { id: 'cat-wine', name: 'Vins rouges' },
              servingQuantity: 1,
              targetReadyQuantity: 12,
              availabilityEnabled: true,
            },
          ],
        }),
      },
      technicalSheet: { findMany: jest.fn().mockResolvedValue([]) },
      stock: {
        groupBy: jest.fn().mockResolvedValue([{ productId: product.id, _sum: { quantity: 8 } }]),
      },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      productionOrder: { findMany: jest.fn().mockResolvedValue([]) },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    const report = await service.availability('org-1', 'menu-drinks');

    expect(report.summary).toEqual({ total: 1, ready: 0, lowStock: 0, toProduce: 0, blocked: 1 });
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        sourceType: 'PRODUCT',
        productId: product.id,
        availablePortions: 8,
        missingStockQuantity: 4,
        toProduceQuantity: 0,
        status: 'BLOCKED',
      }),
    );
  });

  it('accepts exactly one card source and validates direct stock products', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'product-wine', name: 'Vin rouge' }),
      },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    await expect(
      (service as any).ensureRefs('org-1', { items: [{ productId: 'product-wine' }] }),
    ).resolves.toBeUndefined();
    await expect((service as any).ensureRefs('org-1', { items: [{}] })).rejects.toThrow(
      'soit un produit Stocks, soit une fiche',
    );
    await expect(
      (service as any).ensureRefs('org-1', {
        items: [{ productId: 'product-wine', technicalSheetId: 'sheet-1' }],
      }),
    ).rejects.toThrow('soit un produit Stocks, soit une fiche');
  });

  it('commits a new card before reading it back', async () => {
    let insideTransaction = false;
    const tx = {
      menu: { updateMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'menu-new' }) },
      menuItem: { createMany: jest.fn() },
      menuHistory: { create: jest.fn() },
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      $transaction: jest.fn(async (callback) => {
        insideTransaction = true;
        const result = await callback(tx);
        insideTransaction = false;
        return result;
      }),
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);
    const getMenu = jest.spyOn(service, 'getMenu').mockImplementation(async () => {
      expect(insideTransaction).toBe(false);
      return { id: 'menu-new', name: 'Carte nourriture' } as any;
    });

    const result = await service.createMenu(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      {
        name: 'Carte nourriture',
        service: 'SNACK',
        kind: 'CATALOG',
        catalogType: 'FOOD',
        items: [],
      },
    );

    expect(result.id).toBe('menu-new');
    expect(tx.menu.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ siteId: 'site-1' }),
      }),
    );
    expect(getMenu).toHaveBeenCalledWith('org-1', 'menu-new');
  });

  it('keeps the restaurant quantity rule unchanged and applies per-guest coefficients to business workflows', () => {
    const service = new MenusService({} as any, {} as any, {} as any);
    const technicalSheet = { id: 'sheet-1', name: 'Pièce cocktail' };
    const restaurant = (service as any).effectiveProductionLines({
      activity: 'RESTAURANT_CAFE',
      expectedGuests: 20,
      guestForecasts: [],
      items: [
        {
          technicalSheetId: technicalSheet.id,
          technicalSheet,
          section: 'OTHER',
          servingQuantity: 3,
        },
      ],
    });
    const caterer = (service as any).effectiveProductionLines({
      activity: 'CATERER',
      expectedGuests: 20,
      guestForecasts: [],
      items: [
        {
          technicalSheetId: technicalSheet.id,
          technicalSheet,
          section: 'OTHER',
          servingQuantity: 3,
        },
      ],
    });

    expect(restaurant[0].portions).toBe(20);
    expect(caterer[0].portions).toBe(60);
  });

  it('aggregates central-kitchen recipes only for the matching diet', () => {
    const service = new MenusService({} as any, {} as any, {} as any);
    const technicalSheet = { id: 'sheet-vegetarian', name: 'Plat végétarien' };
    const lines = (service as any).effectiveProductionLines({
      activity: 'CENTRAL_KITCHEN',
      expectedGuests: 30,
      guestForecasts: [
        { dietId: null, count: 24 },
        { dietId: 'diet-vegetarian', count: 6 },
      ],
      items: [
        {
          technicalSheetId: technicalSheet.id,
          technicalSheet,
          dietId: 'diet-vegetarian',
          section: 'MAIN',
          servingQuantity: 1,
        },
      ],
    });

    expect(lines[0].portions).toBe(6);
  });
});
