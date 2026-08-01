import { StocksProductImportService } from './stocks-product-import.service';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';

const actor = { id: 'user-1', role: 'Manager' };
const KESPRO_SUPPLIER_ID = '11111111-1111-4111-8111-111111111111';

function csvFile(content: string) {
  const buffer = Buffer.from(content, 'utf8');
  return {
    originalname: 'produits.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  };
}

async function xlsxFile(rows: Array<Array<string | number>>, filename = 'produits.xlsx') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');
  rows.forEach((row) => sheet.addRow(row));
  const content = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(content as ArrayBuffer);
  return {
    originalname: filename,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

function minimalNamespacedXlsxFile() {
  const zip = new AdmZip();
  const add = (path: string, content: string) => zip.addFile(path, Buffer.from(content, 'utf8'));
  add(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml" />' +
      '</Types>',
  );
  add(
    '_rels/.rels',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R-workbook" />' +
      '</Relationships>',
  );
  add(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R-sheet" />' +
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="/xl/styles.xml" Id="R-styles" />' +
      '</Relationships>',
  );
  add(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<x:sheets><x:sheet name="Export" sheetId="1" r:id="R-sheet" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets>' +
      '</x:workbook>',
  );
  add(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<x:styleSheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<x:fonts><x:font /></x:fonts>' +
      '<x:fills><x:fill><x:patternFill patternType="none" /></x:fill><x:fill><x:patternFill patternType="gray125" /></x:fill></x:fills>' +
      '<x:borders><x:border /></x:borders><x:cellXfs><x:xf /></x:cellXfs>' +
      '</x:styleSheet>',
  );
  add(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
      '<x:row>' +
      ['nom', 'unite', 'sku', 'gtin', 'fournisseur', 'categorie', 'prix_achat_ht']
        .map((value) => `<x:c t="inlineStr"><x:is><x:t>${value}</x:t></x:is></x:c>`)
        .join('') +
      '</x:row><x:row>' +
      ['Farine T55', 'kg', 'FAR55', '1234567890123', 'Kespro', 'Epicerie']
        .map((value) => `<x:c t="inlineStr"><x:is><x:t>${value}</x:t></x:is></x:c>`)
        .join('') +
      '<x:c><x:v>1.25</x:v></x:c>' +
      '</x:row><x:row />' +
      '</x:sheetData></x:worksheet>',
  );
  const buffer = zip.toBuffer();
  return {
    originalname: 'export-minimal.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

function mockPrisma(options: { products?: any[] } = {}) {
  const existingProducts = options.products ?? [];
  const tx = {
    product: {
      create: jest.fn(async ({ data }: any) => ({
        id: `product-${data.sku ?? data.name}`,
        ...data,
        category: null,
        unit: { id: data.unitId, name: 'Kilogramme', symbol: 'kg' },
        primarySupplier: null,
        stocks: [],
      })),
      findFirst: jest.fn(async ({ where }: any) =>
        existingProducts.find((product) => product.id === where.id)
          ? {
              ...existingProducts.find((product) => product.id === where.id),
              minimumStock: 0,
              category: null,
              unit: { id: 'unit-kg', name: 'Kilogramme', symbol: 'kg' },
              primarySupplier: null,
              stocks: [],
            }
          : null,
      ),
    },
    productSite: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    category: {
      create: jest.fn(async ({ data }: any) => ({ id: `category-${data.name}`, ...data })),
    },
    supplier: {
      create: jest.fn(async ({ data }: any) => ({ id: `supplier-${data.name}`, ...data })),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const prisma: any = {
    unit: {
      findMany: jest.fn(async () => [
        { id: 'unit-kg', name: 'Kilogramme', symbol: 'kg' },
        { id: 'unit-l', name: 'Litre', symbol: 'L' },
        { id: 'unit-piece', name: 'Pièce', symbol: 'pièce' },
      ]),
    },
    category: { findMany: jest.fn(async () => [{ id: 'category-epicerie', name: 'Épicerie' }]) },
    supplier: {
      findMany: jest.fn(async () => [{ id: KESPRO_SUPPLIER_ID, name: 'Kespro' }]),
    },
    product: { findMany: jest.fn(async () => existingProducts) },
    site: {
      findMany: jest.fn(async () => [{ id: 'site-1', name: 'Cuisine' }]),
    },
    organization: { findUnique: jest.fn(async () => ({ mistralApiKey: null })) },
    $transaction: jest.fn(async (handler: any) => handler(tx)),
    __tx: tx,
  };
  return prisma;
}

describe('StocksProductImportService', () => {
  it('analyzes a semicolon CSV and maps supported product fields', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    const result = await service.analyzeProductImport(
      'org-1',
      actor,
      csvFile(
        'nom;unite;sku;gtin;fournisseur;categorie;prix_achat_ht\nFarine T55;kg;FAR55;1234567890123;Kespro;Epicerie;1,25\n',
      ),
    );

    expect(result.mapping.nom).toBe('name');
    expect(result.mapping.unite).toBe('unit');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('ready');
    expect(result.rows[0].fields.name).toBe('Farine T55');
    expect(result.rows[0].fields.unitId).toBe('unit-kg');
    expect(result.rows[0].fields.primarySupplierId).toBe(KESPRO_SUPPLIER_ID);
    expect(result.rows[0].fields.categoryId).toBe('category-epicerie');
    expect(result.rows[0].fields.averagePrice).toBe(1.25);
    expect(result.options).toEqual({ createMissingCategories: true, createMissingSuppliers: true });
  });

  it('reads a regular XLSX product database through the existing preview pipeline', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    const result = await service.analyzeProductImport(
      'org-1',
      actor,
      await xlsxFile([
        ['nom', 'unite', 'sku', 'gtin', 'fournisseur', 'categorie', 'prix_achat_ht'],
        ['Farine T55', 'kg', 'FAR55', '1234567890123', 'Kespro', 'Epicerie', 1.25],
      ]),
    );

    expect(result.sourceKind).toBe('xlsx');
    expect(result.sourceSheet).toBe('Export');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({ status: 'ready', selected: true }));
    expect(result.rows[0].fields).toEqual(
      expect.objectContaining({ name: 'Farine T55', unitId: 'unit-kg', averagePrice: 1.25 }),
    );
    expect(result.processingNotes).toEqual(['Feuille « Export » lue directement, sans OCR.']);
  });

  it('normalizes a minimal namespaced XLSX only after the regular ExcelJS reader rejects it', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    const result = await service.analyzeProductImport('org-1', actor, minimalNamespacedXlsxFile());

    expect(result.sourceKind).toBe('xlsx');
    expect(result.sourceSheet).toBe('Export');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({ status: 'ready', selected: true }));
    expect(result.rows[0].fields).toEqual(
      expect.objectContaining({
        name: 'Farine T55',
        unitId: 'unit-kg',
        averagePrice: 1.25,
      }),
    );
    expect(result.processingNotes).toContain(
      'Format Excel minimal normalisé en mémoire pour assurer sa compatibilité.',
    );
  });

  it('consolidates a supplier purchase-history XLSX without invoking reception OCR', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);
    const headers = [
      'PRODUCT GROUP',
      'SUB PRODUCT GROUP',
      'PRODUCT',
      'PURCHASES VAT 0 % (EXCL. FREIGHT)',
      'PURCHASES, BRUTTO KG',
      'PURCHASES, NET CONTENT',
      'Sisällön mittayksikkö',
      'PURCHASES, MMY',
      'Myyntieräyksikkö',
      'PUCHASES, PMY',
      'Perusmyyntiyksikön mittayksikkö',
      'PURCHASES, INC. VAT',
      'VENDOR',
      'EAN CODE',
      'TAX %',
    ];
    const result = await service.analyzeProductImport(
      'org-1',
      actor,
      await xlsxFile(
        [
          headers,
          [
            'Maitovalmisteet',
            'Maito',
            'Maito 1L',
            100,
            100,
            100,
            'L',
            10,
            'LTK',
            100,
            'TLK',
            114,
            'VALIO OY',
            '6410400000001',
            14,
          ],
          [
            'Maitovalmisteet',
            'Maito',
            'Maito 1L',
            100,
            50,
            50,
            'L',
            5,
            'LTK',
            50,
            'TLK',
            113.5,
            'VALIO OY',
            '6410400000001',
            13.5,
          ],
          [
            'Pantit',
            'Myytävät juomapantit',
            'Palautettava kori',
            -10,
            -2,
            -2,
            'KPL',
            -2,
            'KPL',
            -2,
            'KPL',
            -12.4,
            '',
            '6408640000001',
            24,
          ],
        ],
        'historique-fournisseur.xlsx',
      ),
    );

    expect(result.sourceKind).toBe('supplier_purchase_history');
    expect(result.rows).toHaveLength(2);
    const milk = result.rows.find((row: any) => row.fields.gtin === '6410400000001');
    expect(milk?.fields).toEqual(
      expect.objectContaining({
        name: 'Maito 1L',
        unit: 'L',
        averagePrice: 1.3333,
        unitsPerPackage: 10,
      }),
    );
    expect(milk?.source['Lignes consolidées']).toBe('2');
    const returnable = result.rows.find((row: any) => row.fields.gtin === '6408640000001');
    expect(returnable).toEqual(expect.objectContaining({ status: 'ignored', selected: false }));
    expect(result.processingNotes.join(' ')).toContain(
      'montant total HT acheté ÷ quantité nette commandée',
    );
    expect(result.processingNotes.join(' ')).toContain('prix d’achat initial');
    expect(result.processingNotes.join(' ')).toContain('prochains imports de factures');
    expect(result.processingNotes.join(' ')).toContain(
      'moteur OCR des factures et réceptions n’est pas utilisé',
    );
  });

  it('recognizes the Finnish supplier purchase-history headers used by data.xlsx', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);
    const headers = [
      'TUOTERYHMÄ',
      'ALATUOTERYHMÄ',
      'TUOTE',
      'OSTOT ALV. 0 % (ILMAN RAHTIA)',
      'OSTOT, BRUTTO KG',
      'OSTOT, NETTOSISÄLTÖ',
      'Sisällön mittayksikkö',
      'OSTOT, MMY',
      'Myyntieräyksikkö',
      'OSTOT, PMY',
      'Perusmyyntiyksikön mittayksikkö',
      'OSTOT, SIS ALV.',
      'TOIMITTAJA',
      'EAN KOODI',
      'VERO %',
    ];

    const result = await service.analyzeProductImport(
      'org-1',
      actor,
      await xlsxFile([
        headers,
        [
          'Viljat',
          'Jauhot',
          'Farine T55',
          100,
          100,
          80,
          'KG',
          10,
          'LTK',
          80,
          'KG',
          114,
          'Kespro',
          '1234567890123',
          14,
        ],
      ]),
    );

    expect(result.sourceKind).toBe('supplier_purchase_history');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fields).toEqual(
      expect.objectContaining({
        name: 'Farine T55',
        gtin: '1234567890123',
        unitId: 'unit-kg',
        averagePrice: 1.25,
      }),
    );
  });

  it('marks existing SKU products for site assignment without duplicating them', async () => {
    const prisma = mockPrisma({
      products: [{ id: 'existing-1', name: 'Farine ancienne', sku: 'FAR55', gtin: null }],
    });
    const service = new StocksProductImportService(prisma);

    const result = await service.analyzeProductImport(
      'org-1',
      actor,
      csvFile('nom;unite;sku\nFarine T55;kg;FAR55\n'),
    );

    expect(result.rows[0].status).toBe('needs_review');
    expect(result.rows[0].duplicateOf).toEqual(
      expect.objectContaining({ type: 'existing', field: 'sku', label: 'Farine ancienne' }),
    );
    expect(result.rows[0].selected).toBe(true);
    expect(result.rows[0].fields.existingProductId).toBe('existing-1');
  });

  it('assigns an existing product to the selected site without creating a duplicate', async () => {
    const existingProductId = '22222222-2222-4222-8222-222222222222';
    const prisma = mockPrisma({
      products: [{ id: existingProductId, name: 'Farine T55', sku: 'FAR55', gtin: null }],
    });
    const service = new StocksProductImportService(prisma);
    const preview = await service.analyzeProductImport(
      'org-1',
      actor,
      csvFile('nom;unite;sku\nFarine T55;kg;FAR55\n'),
    );

    const result = await service.commitProductImport('org-1', actor, {
      rows: preview.rows.map(({ rowNumber, fields, selected }) => ({
        rowNumber,
        fields,
        selected,
      })),
      options: { createMissingCategories: false, createMissingSuppliers: false },
    });

    expect(result.created).toBe(0);
    expect(result.assignedExisting).toBe(1);
    expect(prisma.__tx.product.create).not.toHaveBeenCalled();
    expect(prisma.__tx.productSite.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ productId: existingProductId, siteId: 'site-1' })],
      }),
    );
  });

  it('commits selected rows by creating products without stock movements', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);
    const preview = await service.analyzeProductImport(
      'org-1',
      actor,
      csvFile(
        'nom;unite;sku;fournisseur;categorie;prix_achat_ht\nFarine T55;kg;FAR55;Kespro;Epicerie;1,25\n',
      ),
    );

    const result = await service.commitProductImport('org-1', actor, {
      rows: preview.rows.map(({ rowNumber, fields, selected }) => ({
        rowNumber,
        fields,
        selected,
      })),
      options: { createMissingCategories: false, createMissingSuppliers: false },
    });

    expect(result.created).toBe(1);
    expect(prisma.__tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          name: 'Farine T55',
          sku: 'FAR55',
          unitId: 'unit-kg',
          averagePrice: 1.25,
        }),
      }),
    );
    expect(prisma.__tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PRODUCT_CREATED', entityType: 'Product' }),
      }),
    );
    expect((prisma.__tx as any).stockMovement).toBeUndefined();
  });

  it('requires a common supplier when selected rows have no supplier', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    await expect(
      service.commitProductImport('org-1', actor, {
        rows: [
          {
            rowNumber: 2,
            selected: true,
            fields: { name: 'Farine T65', unit: 'kg', sku: 'FAR65' },
          },
        ],
        options: { createMissingSuppliers: true },
      }),
    ).rejects.toThrow('Aucun fournisseur n’est renseigné');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates one common supplier and assigns it only to supplierless rows', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    const result = await service.commitProductImport('org-1', actor, {
      rows: [
        {
          rowNumber: 2,
          selected: true,
          fields: { name: 'Farine T65', unit: 'kg', sku: 'FAR65' },
        },
        {
          rowNumber: 3,
          selected: true,
          fields: {
            name: 'Farine T80',
            unit: 'kg',
            sku: 'FAR80',
            supplierName: 'Kespro',
            primarySupplierId: KESPRO_SUPPLIER_ID,
          },
        },
      ],
      options: {
        createMissingSuppliers: true,
        defaultSupplierName: 'Metro',
      },
    });

    expect(result.created).toBe(2);
    expect(prisma.__tx.supplier.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.supplier.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', name: 'Metro' },
    });
    expect(prisma.__tx.product.create.mock.calls[0][0].data.primarySupplierId).toBe(
      'supplier-Metro',
    );
    expect(prisma.__tx.product.create.mock.calls[1][0].data.primarySupplierId).toBe(
      KESPRO_SUPPLIER_ID,
    );
  });

  it('reuses the selected existing supplier for supplierless rows', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    await service.commitProductImport('org-1', actor, {
      rows: [
        {
          rowNumber: 2,
          selected: true,
          fields: { name: 'Farine T110', unit: 'kg', sku: 'FAR110' },
        },
      ],
      options: {
        createMissingSuppliers: true,
        defaultSupplierId: KESPRO_SUPPLIER_ID,
      },
    });

    expect(prisma.__tx.supplier.create).not.toHaveBeenCalled();
    expect(prisma.__tx.product.create.mock.calls[0][0].data.primarySupplierId).toBe(
      KESPRO_SUPPLIER_ID,
    );
  });

  it('rejects rows with unknown units on commit', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    await expect(
      service.commitProductImport('org-1', actor, {
        rows: [{ rowNumber: 2, selected: true, fields: { name: 'Produit test', unit: 'palette' } }],
        options: {},
      }),
    ).rejects.toThrow('Certaines lignes ne peuvent pas être importées.');
  });

  it('previews catalog creator rows with the same validation and duplicate checks as CSV', async () => {
    const prisma = mockPrisma({
      products: [{ id: 'existing-1', name: 'Farine T55', sku: 'FAR55', gtin: null }],
    });
    const service = new StocksProductImportService(prisma);
    const result = await service.previewProductRows('org-1', actor, [
      { fields: { name: 'Farine T55', unit: 'kg', sku: 'FAR55' } },
      { fields: { name: 'Crème', unit: 'L', supplier: 'Kespro' } },
    ]);
    expect(result.rows[0].status).toBe('needs_review');
    expect(result.rows[1].status).toBe('ready');
    expect(result.rows[1].fields.unitId).toBe('unit-l');
    expect(result.options).toEqual({ createMissingCategories: true, createMissingSuppliers: true });
  });

  it('exports creator rows using the official CSV header and escaping', () => {
    const service = new StocksProductImportService(mockPrisma());
    const csv = service.creatorCsv([
      { selected: true, fields: { name: 'Sauce; tomate', unit: 'kg', supplier: 'Kespro' } },
    ]);
    expect(csv.startsWith('\uFEFFnom;unite;sku;gtin;fournisseur;')).toBe(true);
    expect(csv).toContain('"Sauce; tomate";kg');
    expect(csv).toContain(';Kespro;');
  });
});
