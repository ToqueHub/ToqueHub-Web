import ExcelJS from 'exceljs';
import { CatererClientImportService } from './caterer-client-import.service';

const actor = { id: 'user-1', role: 'Manager' };

async function xlsxFile(rows: string[][], originalname = 'clients.xlsx') {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Clients').addRows(rows);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

function prismaForAnalyze(existing: Array<any> = []) {
  return {
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ clientsInstalledAt: new Date(), menusInstalledAt: null }),
    },
    catererClient: { findMany: jest.fn().mockResolvedValue(existing) },
  };
}

describe('CatererClientImportService', () => {
  it('reads French customer columns locally and flags an existing e-mail as a duplicate', async () => {
    const prisma = prismaForAnalyze([
      { id: 'client-1', name: 'Client existant', email: 'known@example.com', phone: null },
    ]);
    const mistral = { ocrMarkdown: jest.fn(), chatJson: jest.fn() };
    const service = new CatererClientImportService(prisma as any, mistral as any);

    const preview = await service.analyze(
      'org-1',
      actor,
      await xlsxFile([
        ['Prénom', 'Nom', 'E-mail', 'Téléphone', 'Allergies'],
        ['Aino', 'Test', 'aino@example.com', '+358 40 123 4567', 'Gluten'],
        ['Elli', 'Connue', 'known@example.com', '', ''],
      ]),
    );

    expect(preview.sourceLanguage).toBe('fr');
    expect(preview.rows[0]).toEqual(
      expect.objectContaining({
        name: 'Aino Test',
        selected: true,
        fields: expect.objectContaining({ allergies: 'Gluten' }),
      }),
    );
    expect(preview.rows[1]).toEqual(
      expect.objectContaining({ status: 'duplicate', selected: false }),
    );
    expect(mistral.ocrMarkdown).not.toHaveBeenCalled();
  });

  it('recognizes Finnish headers in an OCR markdown table without a second AI call', async () => {
    const prisma = prismaForAnalyze();
    const mistral = {
      ocrMarkdown: jest.fn().mockResolvedValue({
        markdown:
          '| Etunimi | Sukunimi | Sähköposti | Puhelin | Allergiat |\n|---|---|---|---|---|\n| Aino | Testi | aino@example.com | 0401234567 | Pähkinä |',
      }),
      chatJson: jest.fn(),
    };
    const service = new CatererClientImportService(prisma as any, mistral as any);

    const preview = await service.analyze('org-1', actor, {
      originalname: 'clients.png',
      mimetype: 'image/png',
      size: 3,
      buffer: Buffer.from('png'),
    });

    expect(preview.sourceLanguage).toBe('fi');
    expect(preview.rows[0].fields).toEqual({
      firstName: 'Aino',
      lastName: 'Testi',
      email: 'aino@example.com',
      phone: '0401234567',
      allergies: 'Pähkinä',
    });
    expect(mistral.chatJson).not.toHaveBeenCalled();
  });

  it('creates only selected and non-duplicate clients on commit', async () => {
    const createdRows: any[] = [];
    const tx = {
      catererClient: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'existing-1', name: 'Known Client', email: 'known@example.com', phone: null },
          ]),
        create: jest.fn().mockImplementation(({ data }) => {
          const created = { id: `created-${createdRows.length + 1}`, ...data };
          createdRows.push(created);
          return created;
        }),
      },
    };
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ clientsInstalledAt: new Date(), menusInstalledAt: null }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new CatererClientImportService(prisma as any, {} as any);

    const result = await service.commit('org-1', actor, {
      rows: [
        {
          rowNumber: 2,
          selected: true,
          firstName: 'New',
          lastName: 'Client',
          email: 'new@example.com',
          phone: '',
          allergies: 'Milk',
        },
        {
          rowNumber: 3,
          selected: true,
          firstName: 'Known',
          lastName: 'Client',
          email: 'known@example.com',
          phone: '',
          allergies: '',
        },
        {
          rowNumber: 4,
          selected: false,
          firstName: 'Ignored',
          lastName: 'Client',
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ created: 1, skipped: 1 }));
    expect(tx.catererClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Client',
          firstName: 'New',
          lastName: 'Client',
          allergies: 'Milk',
          source: 'CLIENT_IMPORT',
        }),
      }),
    );
  });
});
