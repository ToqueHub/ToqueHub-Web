import { BadRequestException } from '@nestjs/common';
import { MenuExportFormat } from '@prisma/client';
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
    await expect(service.prepare('org-1', { id: 'user-1', role: 'Manager' }, {
      menuId: 'menu-1',
      audience: 'RESIDENTS' as any,
      format: MenuExportFormat.PDF,
    })).rejects.toBeInstanceOf(BadRequestException);
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
});
