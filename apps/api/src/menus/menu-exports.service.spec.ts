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
