import { BadRequestException } from '@nestjs/common';
import { MenuExportFormat } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { MenuExportsService } from './menu-exports.service';

describe('MenuExportsService', () => {
  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ menusInstalledAt: new Date() }),
    },
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
