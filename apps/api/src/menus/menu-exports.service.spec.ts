import { BadRequestException } from '@nestjs/common';
import { MenuExportAudience, MenuExportFormat } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { MenuExportsService } from './menu-exports.service';

describe('MenuExportsService', () => {
  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }),
    },
    menu: { findFirst: jest.fn() },
    technicalSheet: { findMany: jest.fn() },
    unitConversion: { findMany: jest.fn() },
  };
  const mistral = { ocrMarkdown: jest.fn() };
  const service = new MenuExportsService(prisma as any, mistral as any);

  beforeEach(() => jest.clearAllMocks());

  it('refuses legacy resident, patient and Excel exports', async () => {
    await expect(
      service.prepare(
        'org-1',
        { id: 'user-1', role: 'Manager' },
        {
          menuId: 'menu-1',
          audience: 'RESIDENTS' as any,
          format: MenuExportFormat.PDF,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps separate title and content backgrounds returned by OCR', () => {
    const layout = (service as any).layoutFromOcr({
      document_annotation: JSON.stringify({
        titleZone: { x: 0.1, y: 0.05, width: 0.8, height: 0.08 },
        contentZone: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
        style: {
          backgroundColor: '#ffffff',
          titleBackgroundColor: '#081a2d',
          contentBackgroundColor: '#ffffff',
          textColor: '#0f172a',
          accentColor: '#10b981',
          titleAlignment: 'center',
          itemAlignment: 'left',
        },
        detectedTitle: 'Ancienne carte',
        confidence: 0.96,
      }),
    });

    expect(layout.style.titleBackgroundColor).toBe('#081a2d');
    expect(layout.style.contentBackgroundColor).toBe('#ffffff');
    expect(layout.confidence).toBe(0.96);
  });

  it('normalizes punctuation unsupported by standard PDF fonts', () => {
    expect((service as any).editableText('Menu — “Été”…')).toBe('Menu - "Été"...');
  });

  it('calculates dining-room allergens, traces and nutrition for one portion', () => {
    const gram = { id: 'unit-g', name: 'Gramme', symbol: 'g', type: 'MASS' };
    const milk = {
      id: 'product-milk',
      name: 'Lait entier',
      unitId: gram.id,
      unit: gram,
      allergensPresent: ['Maito'],
      possibleTraces: ['Sinappi', 'Maito'],
      energyKj: 250,
      energyKcal: 60,
      fatGrams: 3.5,
      saturatedFatGrams: 2.3,
      carbohydratesGrams: 4.7,
      sugarsGrams: 4.7,
      fiberGrams: 0,
      proteinGrams: 3.2,
      saltGrams: 0.1,
    };
    const sheet = {
      id: 'sheet-custard',
      name: 'Crème',
      referencePortions: 4,
      yieldUnitId: gram.id,
      ingredients: [
        {
          product: milk,
          productId: milk.id,
          unitId: gram.id,
          unit: gram,
          quantity: 200,
          allergens: [],
        },
      ],
    };
    const composition = (service as any).itemComposition(
      { compositionSheets: [sheet], unitConversions: [] },
      { technicalSheetId: sheet.id, technicalSheet: sheet, servingQuantity: 1 },
    );

    expect(composition.allergens.present.map((entry: any) => entry.name)).toEqual(['Maito']);
    expect(composition.allergens.traces.map((entry: any) => entry.name)).toEqual(['Sinappi']);
    expect(composition.nutrition.referencePortions).toBe(1);
    expect(composition.nutrition.perPortion.energyKcal).toBe(30);
    expect(composition.nutrition.perPortion.proteinGrams).toBe(1.6);
    expect((service as any).allergenLabel('Maito', 'fr')).toBe('Lait');
    expect((service as any).allergenLabel('Maito', 'en')).toBe('Milk');
  });

  it('loads only the technical-sheet tree used by the dining-room export', async () => {
    const grandchild = { id: 'sheet-grandchild', ingredients: [] };
    const child = {
      id: 'sheet-child',
      ingredients: [{ sourceTechnicalSheetId: grandchild.id }],
    };
    const root = {
      id: 'sheet-root',
      isArchived: false,
      ingredients: [{ sourceTechnicalSheetId: child.id }],
    };
    prisma.menu.findFirst.mockResolvedValue({
      id: 'menu-1',
      items: [{ technicalSheetId: root.id, technicalSheet: root }],
    });
    prisma.technicalSheet.findMany
      .mockResolvedValueOnce([child])
      .mockResolvedValueOnce([grandchild]);
    prisma.unitConversion.findMany.mockResolvedValue([]);

    const menu = await (service as any).exportMenu(
      'org-1',
      'menu-1',
      MenuExportAudience.DINING_ROOM,
    );

    expect(prisma.technicalSheet.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.technicalSheet.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      isArchived: false,
      id: { in: ['sheet-child'] },
    });
    expect(prisma.technicalSheet.findMany.mock.calls[1][0].where.id).toEqual({
      in: ['sheet-grandchild'],
    });
    expect(menu.compositionSheets.map((sheet: any) => sheet.id)).toEqual([
      'sheet-root',
      'sheet-child',
      'sheet-grandchild',
    ]);
  });

  it('skips composition queries for exports that do not use the dining-room data', async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', items: [] });

    const menu = await (service as any).exportMenu(
      'org-1',
      'menu-1',
      MenuExportAudience.KITCHEN,
    );

    expect(menu).toEqual({ id: 'menu-1', items: [] });
    expect(prisma.technicalSheet.findMany).not.toHaveBeenCalled();
    expect(prisma.unitConversion.findMany).not.toHaveBeenCalled();
  });

  it('skips recipe composition queries for a product-only dining-room menu', async () => {
    prisma.menu.findFirst.mockResolvedValue({
      id: 'menu-products',
      items: [{ productId: 'product-1', product: { id: 'product-1' } }],
    });

    const menu = await (service as any).exportMenu(
      'org-1',
      'menu-products',
      MenuExportAudience.DINING_ROOM,
    );

    expect(menu).toMatchObject({ compositionSheets: [], unitConversions: [] });
    expect(prisma.technicalSheet.findMany).not.toHaveBeenCalled();
    expect(prisma.unitConversion.findMany).not.toHaveBeenCalled();
  });

  it('reuses composition and supplier indexes across dining-room items', () => {
    const gram = { id: 'unit-g', name: 'Gramme', symbol: 'g', type: 'MASS' };
    const sheet = {
      id: 'sheet-shared',
      name: 'Sauce',
      referencePortions: 1,
      yieldUnitId: gram.id,
      ingredients: [
        {
          quantity: 100,
          unitId: gram.id,
          product: {
            id: 'product-1',
            name: 'Crème',
            unitId: gram.id,
            unit: gram,
            primarySupplier: { name: 'Fournisseur A' },
          },
          allergens: [],
        },
      ],
    };
    const menu = { compositionSheets: [sheet], unitConversions: [] };
    const item = { technicalSheetId: sheet.id, technicalSheet: sheet, servingQuantity: 1 };
    const context = (service as any).menuCompositionContext(menu);

    const first = (service as any).itemComposition(menu, item, context);
    const second = (service as any).itemComposition(menu, item, context);
    expect(second).toBe(first);
    expect(context.compositions.size).toBe(1);

    expect((service as any).itemSuppliers(item, menu, context)).toEqual(['Fournisseur A']);
    expect((service as any).itemSuppliers(item, menu, context)).toEqual(['Fournisseur A']);
    expect(context.suppliersBySheetId.size).toBe(1);
  });

  it('localizes known categories and dining-room PDF metadata in English', async () => {
    const menu = {
      id: 'menu-en',
      name: 'Summer menu',
      date: '2026-08-30T00:00:00.000Z',
      service: 'LUNCH',
      items: [
        {
          section: 'MAIN',
          menuCategory: { name: 'Plats' },
          servingQuantity: 1,
          product: {
            name: 'Salad',
            unit: { id: 'unit-g', name: 'Gramme', symbol: 'g', type: 'MASS' },
            allergensPresent: [],
            possibleTraces: [],
          },
        },
      ],
    };
    const groups = (service as any).publicGroups(menu, 'en');
    const buffer = await (service as any).diningRoomPdf(
      menu,
      { name: 'The French Café' },
      'en',
    );
    const pdf = await PDFDocument.load(buffer);

    expect(groups[0].name).toBe('Main courses');
    expect(pdf.getTitle()).toBe('Dining room brief - Summer menu');
    expect(pdf.getAuthor()).toBe('The French Café');
  });

  it('renders compact restaurant dossier and client menu with the caterer document titles', async () => {
    const menu = {
      id: 'menu-1',
      name: 'Menu du marché',
      date: '2026-07-28T00:00:00.000Z',
      service: 'LUNCH',
      expectedGuests: 40,
      description: 'Cuisine de saison.',
      site: { name: 'Café Central', address: '1 rue du Marché' },
      items: [
        {
          section: 'STARTER',
          portionsOverride: 40,
          technicalSheet: {
            name: 'Velouté de potimarron',
            description: 'Noisettes torréfiées',
            ingredients: [{ allergens: [{ allergen: { name: 'Fruits à coque' } }] }],
          },
        },
        {
          section: 'MAIN',
          portionsOverride: 40,
          technicalSheet: {
            name: 'Croissant salé',
            description: 'Légumes rôtis',
            ingredients: [],
          },
        },
      ],
    };
    const organization = { name: 'The French Café', mainSiteName: 'Café Central' };

    const [kitchenBuffer, clientBuffer] = await Promise.all([
      (service as any).kitchenPdf(menu, organization),
      (service as any).publicToqueHubPdf(menu, organization),
    ]);
    const [kitchen, client] = await Promise.all([
      PDFDocument.load(kitchenBuffer),
      PDFDocument.load(clientBuffer),
    ]);

    expect(kitchen.getTitle()).toBe('Dossier cuisine — Menu du marché');
    expect(client.getTitle()).toBe('Menu client — Menu du marché');
    expect(kitchen.getPageCount()).toBe(1);
    expect(client.getPageCount()).toBe(1);
  });
});
