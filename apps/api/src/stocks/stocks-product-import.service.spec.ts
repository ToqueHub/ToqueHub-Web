import { StocksProductImportService } from './stocks-product-import.service';

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
      csvFile('nom;unite;sku;fournisseur;categorie\nFarine T55;kg;FAR55;Kespro;Epicerie\n'),
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
  });

  it('exports creator rows using the official CSV header and escaping', () => {
    const service = new StocksProductImportService(mockPrisma());
    const csv = service.creatorCsv([{ selected: true, fields: { name: 'Sauce; tomate', unit: 'kg', supplier: 'Kespro' } }]);
    expect(csv.startsWith('\uFEFFnom;unite;sku;gtin;fournisseur;')).toBe(true);
    expect(csv).toContain('"Sauce; tomate";kg');
    expect(csv).toContain(';Kespro;');
  });
});
