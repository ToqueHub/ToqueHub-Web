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
    const rawProduct = { id: 'product-chocolate', name: 'Chocolat', unitId: unit.id, unit };
    const rootSheet = {
      id: 'sheet-snicker', name: 'Snicker', outputProductId: rootProduct.id, outputProduct: rootProduct,
      yieldUnitId: unit.id, yieldUnit: unit, referencePortions: 10,
      ingredients: [{ id: 'line-ganache', productId: childProduct.id, product: childProduct, unitId: unit.id, unit, quantity: 5, sourceTechnicalSheetId: 'sheet-ganache' }],
    };
    const childSheet = {
      id: 'sheet-ganache', name: 'Ganache', outputProductId: childProduct.id, outputProduct: childProduct,
      yieldUnitId: unit.id, yieldUnit: unit, referencePortions: 5,
      ingredients: [{ id: 'line-chocolate', productId: rawProduct.id, product: rawProduct, unitId: unit.id, unit, quantity: 2, sourceTechnicalSheetId: null }],
    };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      menu: { findFirst: jest.fn().mockResolvedValue({
        id: 'menu-1', name: 'Carte principale', kind: 'CATALOG', siteId: 'site-1', site: { id: 'site-1', name: 'Café' }, expectedGuests: 0, guestForecasts: [],
        items: [{ id: 'item-1', technicalSheetId: rootSheet.id, technicalSheet: rootSheet, menuCategory: { id: 'cat-1', name: 'Sucré' }, servingQuantity: 1, targetReadyQuantity: 10, portionsOverride: null, availabilityEnabled: true }],
      }) },
      technicalSheet: { findMany: jest.fn().mockResolvedValue([rootSheet, childSheet]) },
      stock: { groupBy: jest.fn().mockResolvedValue([
        { productId: rootProduct.id, _sum: { quantity: 3 } },
        { productId: childProduct.id, _sum: { quantity: 1 } },
        { productId: rawProduct.id, _sum: { quantity: 10 } },
      ]) },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      productionOrder: { findMany: jest.fn().mockResolvedValue([{ outputProductId: rootProduct.id, plannedPortions: 2, proposedQuantity: 0, validatedQuantity: 0, realizedPortions: 0, status: 'PLANNED' }]) },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    const report = await service.availability('org-1', 'menu-1');

    expect(report.summary).toEqual({ total: 1, ready: 0, lowStock: 0, toProduce: 1, blocked: 0 });
    expect(report.items[0]).toEqual(expect.objectContaining({
      status: 'COMPONENT_MISSING',
      availablePortions: 3,
      projectedPortions: 5,
      toProducePortions: 5,
    }));
    expect(report.items[0].components[0]).toEqual(expect.objectContaining({
      name: 'Ganache',
      requiredQuantity: 2.5,
      availableQuantity: 1,
      missingQuantity: 1.5,
      status: 'TO_PRODUCE',
    }));
  });

  it('creates draft Production needs instead of immediately launching orders', async () => {
    const createNeed = jest.fn().mockResolvedValue({ id: 'need-1', status: 'DRAFT' });
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      productionProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'profile-1', yieldUnitId: 'unit-piece' }) },
      productionNeed: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      menuHistory: { create: jest.fn() },
    };
    const service = new MenusService(prisma as any, { createNeed } as any, {} as any);
    jest.spyOn(service, 'availability').mockResolvedValue({
      menu: { id: 'menu-1', name: 'Carte principale', kind: 'CATALOG', siteId: 'site-1' },
      generatedAt: new Date(),
      summary: { total: 1, ready: 0, lowStock: 0, toProduce: 1, blocked: 0 },
      items: [{ id: 'item-1', technicalSheetId: 'sheet-snicker', name: 'Snicker', outputProduct: { id: 'product-snicker', name: 'Snicker', unit: { id: 'unit-piece' } }, servingQuantity: 1, targetPortions: 10, toProduceQuantity: 5, toProducePortions: 5, status: 'TO_PRODUCE', components: [] }],
    } as any);

    const result = await service.planShortages('org-1', { id: 'user-1', role: 'Manager' }, 'menu-1', {});

    expect(result.created).toBe(1);
    expect(createNeed).toHaveBeenCalledWith('org-1', expect.anything(), expect.objectContaining({
      source: 'MENU',
      sourceReferenceType: 'MenuAvailabilityItem',
      quantity: '5.000',
      status: 'DRAFT',
    }));
    expect(prisma.menuHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'AVAILABILITY_PLANNED' }) }));
  });

  it('accepts every active stock-tracked technical sheet as a menu item', async () => {
    const prisma = {
      technicalSheet: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'sheet-biscuit', name: 'Biscuit Joconde', mode: 'PRODUCTION', status: 'ACTIVE', outputProductId: 'product-biscuit' })
          .mockResolvedValueOnce({ id: 'sheet-snicker', name: 'Snicker', mode: 'ASSEMBLY', status: 'ACTIVE', outputProductId: 'product-snicker' }),
      },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    await expect((service as any).ensureRefs('org-1', { items: [{ technicalSheetId: 'sheet-biscuit' }] }))
      .resolves.toBeUndefined();
    await expect((service as any).ensureRefs('org-1', { items: [{ technicalSheetId: 'sheet-snicker' }] }))
      .resolves.toBeUndefined();
  });

  it('tracks a card item coming directly from Stocks without proposing production', async () => {
    const unit = { id: 'unit-bottle', symbol: 'bt' };
    const product = { id: 'product-wine', name: 'Vin rouge maison', unitId: unit.id, unit };
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(installedOrganization) },
      menu: { findFirst: jest.fn().mockResolvedValue({
        id: 'menu-drinks', name: 'Carte des boissons', kind: 'CATALOG', siteId: 'site-1', site: { id: 'site-1' }, expectedGuests: 0, guestForecasts: [],
        items: [{ id: 'item-wine', productId: product.id, product, technicalSheetId: null, menuCategory: { id: 'cat-wine', name: 'Vins rouges' }, servingQuantity: 1, targetReadyQuantity: 12, availabilityEnabled: true }],
      }) },
      technicalSheet: { findMany: jest.fn().mockResolvedValue([]) },
      stock: { groupBy: jest.fn().mockResolvedValue([{ productId: product.id, _sum: { quantity: 8 } }]) },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      productionOrder: { findMany: jest.fn().mockResolvedValue([]) },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    const report = await service.availability('org-1', 'menu-drinks');

    expect(report.summary).toEqual({ total: 1, ready: 0, lowStock: 0, toProduce: 0, blocked: 1 });
    expect(report.items[0]).toEqual(expect.objectContaining({
      sourceType: 'PRODUCT',
      productId: product.id,
      availablePortions: 8,
      missingStockQuantity: 4,
      toProduceQuantity: 0,
      status: 'BLOCKED',
    }));
  });

  it('accepts exactly one card source and validates direct stock products', async () => {
    const prisma = { product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-wine', name: 'Vin rouge' }) } };
    const service = new MenusService(prisma as any, {} as any, {} as any);

    await expect((service as any).ensureRefs('org-1', { items: [{ productId: 'product-wine' }] })).resolves.toBeUndefined();
    await expect((service as any).ensureRefs('org-1', { items: [{}] })).rejects.toThrow('soit un produit Stocks, soit une fiche');
    await expect((service as any).ensureRefs('org-1', { items: [{ productId: 'product-wine', technicalSheetId: 'sheet-1' }] })).rejects.toThrow('soit un produit Stocks, soit une fiche');
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

    const result = await service.createMenu('org-1', { id: 'user-1', role: 'Manager' }, { name: 'Carte nourriture', service: 'SNACK', kind: 'CATALOG', catalogType: 'FOOD', items: [] });

    expect(result.id).toBe('menu-new');
    expect(tx.menu.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ siteId: 'site-1' }),
    }));
    expect(getMenu).toHaveBeenCalledWith('org-1', 'menu-new');
  });

  it('keeps the restaurant quantity rule unchanged and applies per-guest coefficients to business workflows', () => {
    const service = new MenusService({} as any, {} as any, {} as any);
    const technicalSheet = { id: 'sheet-1', name: 'Pièce cocktail' };
    const restaurant = (service as any).effectiveProductionLines({
      activity: 'RESTAURANT_CAFE',
      expectedGuests: 20,
      guestForecasts: [],
      items: [{ technicalSheetId: technicalSheet.id, technicalSheet, section: 'OTHER', servingQuantity: 3 }],
    });
    const caterer = (service as any).effectiveProductionLines({
      activity: 'CATERER',
      expectedGuests: 20,
      guestForecasts: [],
      items: [{ technicalSheetId: technicalSheet.id, technicalSheet, section: 'OTHER', servingQuantity: 3 }],
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
      items: [{ technicalSheetId: technicalSheet.id, technicalSheet, dietId: 'diet-vegetarian', section: 'MAIN', servingQuantity: 1 }],
    });

    expect(lines[0].portions).toBe(6);
  });
});
