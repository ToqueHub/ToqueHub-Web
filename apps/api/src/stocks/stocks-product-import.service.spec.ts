import { StocksProductImportService } from './stocks-product-import.service';
import ExcelJS from 'exceljs';

const actor = { id: 'user-1', role: 'Manager' };

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

function mockPrisma(options: { products?: any[] } = {}) {
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
    },
    category: { create: jest.fn(async ({ data }: any) => ({ id: `category-${data.name}`, ...data })) },
    supplier: { create: jest.fn(async ({ data }: any) => ({ id: `supplier-${data.name}`, ...data })) },
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
    supplier: { findMany: jest.fn(async () => [{ id: 'supplier-kespro', name: 'Kespro' }]) },
    product: { findMany: jest.fn(async () => options.products ?? []) },
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
      csvFile('nom;unite;sku;gtin;fournisseur;categorie;prix_achat_ht\nFarine T55;kg;FAR55;1234567890123;Kespro;Epicerie;1,25\n'),
    );

    expect(result.mapping.nom).toBe('name');
    expect(result.mapping.unite).toBe('unit');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('ready');
    expect(result.rows[0].fields.name).toBe('Farine T55');
    expect(result.rows[0].fields.unitId).toBe('unit-kg');
    expect(result.rows[0].fields.primarySupplierId).toBe('supplier-kespro');
    expect(result.rows[0].fields.categoryId).toBe('category-epicerie');
    expect(result.rows[0].fields.averagePrice).toBe(1.25);
    expect(result.options).toEqual({ createMissingCategories: true, createMissingSuppliers: true });
  });

  it('reads a regular XLSX product database through the existing preview pipeline', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    const result = await service.analyzeProductImport('org-1', actor, await xlsxFile([
      ['nom', 'unite', 'sku', 'gtin', 'fournisseur', 'categorie', 'prix_achat_ht'],
      ['Farine T55', 'kg', 'FAR55', '1234567890123', 'Kespro', 'Epicerie', 1.25],
    ]));

    expect(result.sourceKind).toBe('xlsx');
    expect(result.sourceSheet).toBe('Export');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({ status: 'ready', selected: true }));
    expect(result.rows[0].fields).toEqual(expect.objectContaining({ name: 'Farine T55', unitId: 'unit-kg', averagePrice: 1.25 }));
  });

  it('consolidates a supplier purchase-history XLSX without invoking reception OCR', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);
    const headers = [
      'PRODUCT GROUP', 'SUB PRODUCT GROUP', 'PRODUCT', 'PURCHASES VAT 0 % (EXCL. FREIGHT)', 'PURCHASES, BRUTTO KG',
      'PURCHASES, NET CONTENT', 'Sisällön mittayksikkö', 'PURCHASES, MMY', 'Myyntieräyksikkö', 'PUCHASES, PMY',
      'Perusmyyntiyksikön mittayksikkö', 'PURCHASES, INC. VAT', 'VENDOR', 'EAN CODE', 'TAX %',
    ];
    const result = await service.analyzeProductImport('org-1', actor, await xlsxFile([
      headers,
      ['Maitovalmisteet', 'Maito', 'Maito 1L', 100, 100, 100, 'L', 10, 'LTK', 100, 'TLK', 114, 'VALIO OY', '6410400000001', 14],
      ['Maitovalmisteet', 'Maito', 'Maito 1L', 100, 50, 50, 'L', 5, 'LTK', 50, 'TLK', 113.5, 'VALIO OY', '6410400000001', 13.5],
      ['Pantit', 'Myytävät juomapantit', 'Palautettava kori', -10, -2, -2, 'KPL', -2, 'KPL', -2, 'KPL', -12.4, '', '6408640000001', 24],
    ], 'historique-fournisseur.xlsx'));

    expect(result.sourceKind).toBe('supplier_purchase_history');
    expect(result.rows).toHaveLength(2);
    const milk = result.rows.find((row: any) => row.fields.gtin === '6410400000001');
    expect(milk?.fields).toEqual(expect.objectContaining({ name: 'Maito 1L', unit: 'L', averagePrice: 1.3333, unitsPerPackage: 10 }));
    expect(milk?.source['Lignes consolidées']).toBe('2');
    const returnable = result.rows.find((row: any) => row.fields.gtin === '6408640000001');
    expect(returnable).toEqual(expect.objectContaining({ status: 'ignored', selected: false }));
    expect(result.processingNotes.join(' ')).toContain('montant total HT acheté ÷ quantité nette commandée');
    expect(result.processingNotes.join(' ')).toContain('prix d’achat initial');
    expect(result.processingNotes.join(' ')).toContain('prochains imports de factures');
    expect(result.processingNotes.join(' ')).toContain('moteur OCR des factures et réceptions n’est pas utilisé');
  });

  it('marks existing SKU duplicates before commit', async () => {
    const prisma = mockPrisma({ products: [{ id: 'existing-1', name: 'Farine ancienne', sku: 'FAR55', gtin: null }] });
    const service = new StocksProductImportService(prisma);

    const result = await service.analyzeProductImport(
      'org-1',
      actor,
      csvFile('nom;unite;sku\nFarine T55;kg;FAR55\n'),
    );

    expect(result.rows[0].status).toBe('duplicate');
    expect(result.rows[0].duplicateOf).toEqual(expect.objectContaining({ type: 'existing', field: 'sku', label: 'Farine ancienne' }));
    expect(result.rows[0].selected).toBe(false);
  });

  it('commits selected rows by creating products without stock movements', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);
    const preview = await service.analyzeProductImport(
      'org-1',
      actor,
      csvFile('nom;unite;sku;fournisseur;categorie;prix_achat_ht\nFarine T55;kg;FAR55;Kespro;Epicerie;1,25\n'),
    );

    const result = await service.commitProductImport('org-1', actor, {
      rows: preview.rows.map(({ rowNumber, fields, selected }) => ({ rowNumber, fields, selected })),
      options: { createMissingCategories: false, createMissingSuppliers: false },
    });

    expect(result.created).toBe(1);
    expect(prisma.__tx.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org-1',
        name: 'Farine T55',
        sku: 'FAR55',
        unitId: 'unit-kg',
        averagePrice: 1.25,
      }),
    }));
    expect(prisma.__tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PRODUCT_CREATED', entityType: 'Product' }),
    }));
    expect((prisma.__tx as any).stockMovement).toBeUndefined();
  });

  it('rejects rows with unknown units on commit', async () => {
    const prisma = mockPrisma();
    const service = new StocksProductImportService(prisma);

    await expect(service.commitProductImport('org-1', actor, {
      rows: [{ rowNumber: 2, selected: true, fields: { name: 'Produit test', unit: 'palette' } }],
      options: {},
    })).rejects.toThrow('Certaines lignes ne peuvent pas être importées.');
  });

  it('previews catalog creator rows with the same validation and duplicate checks as CSV', async () => {
    const prisma = mockPrisma({ products: [{ id: 'existing-1', name: 'Farine T55', sku: 'FAR55', gtin: null }] });
    const service = new StocksProductImportService(prisma);
    const result = await service.previewProductRows('org-1', actor, [
      { fields: { name: 'Farine T55', unit: 'kg', sku: 'FAR55' } },
      { fields: { name: 'Crème', unit: 'L', supplier: 'Kespro' } },
    ]);
    expect(result.rows[0].status).toBe('duplicate');
    expect(result.rows[1].status).toBe('ready');
    expect(result.rows[1].fields.unitId).toBe('unit-l');
    expect(result.options).toEqual({ createMissingCategories: true, createMissingSuppliers: true });
  });

  it('exports creator rows using the official CSV header and escaping', () => {
    const service = new StocksProductImportService(mockPrisma());
    const csv = service.creatorCsv([{ selected: true, fields: { name: 'Sauce; tomate', unit: 'kg', supplier: 'Kespro' } }]);
    expect(csv.startsWith('\uFEFFnom;unite;sku;gtin;fournisseur;')).toBe(true);
    expect(csv).toContain('"Sauce; tomate";kg');
    expect(csv).toContain(';Kespro;');
  });
});
