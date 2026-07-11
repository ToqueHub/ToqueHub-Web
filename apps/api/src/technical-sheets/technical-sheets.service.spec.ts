import { TechnicalSheetsService } from './technical-sheets.service';

const baseImport = {
  name: null,
  description: null,
  categoryName: null,
  referencePortions: null,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  ingredients: [],
  steps: [],
  warnings: ['Les quantités précises ne sont pas indiquées.'],
};

const kesproMarkdown = (name: string, portions: number, rows: string[]) => [
  `${name} - Kespro.com`,
  `# ${name}`,
  `Plate serving ${portions} serving${portions === 1 ? '' : 's'} 100 g/serving`,
  '| PRODUCT | AMOUNT | ADDITIONAL INFO | WEIGHT LOSS |',
  '| --- | --- | --- | --- |',
  ...rows,
  '## Preparation instructions',
].join('\n');

describe('TechnicalSheetsService Kespro recipe import', () => {
  const service = new TechnicalSheetsService({} as any, {} as any);
  const parse = (markdown: string) => (service as any).applyKesproRecipeData(markdown, baseImport);

  it.each([
    {
      recipe: 'Kuningatarmousse maidoton 112 kpl 80 mm',
      portions: 112,
      rows: [
        '| Italialainen marenki | 900 g | - | 0 % |',
        '| **Polarica suomalainen mustikka 2,5kg pakaste** GTIN 27319994217354 - SAP 21947047 | 900 g | - | 0 % |',
        '| Liivate Bovine | 60 g | - | 0 % |',
        '| Kylmä vesi | 300 g | - | 0 % |',
      ],
      expectedName: 'Kuningatarmousse maidoton',
      expected: [['Italialainen marenki', 900], ['Polarica suomalainen mustikka 2,5kg pakaste', 900], ['Liivate Bovine', 60], ['Kylmä vesi', 300]],
    },
    {
      recipe: 'Croissant',
      portions: 28,
      rows: [
        '| vesi | 720 g | - | 0 % |',
        '| **Suomen hiiva kilohiiva 1kg** GTIN 6417227721009 - SAP 20003445 | 55,01 g | - | 0 % |',
        '| Beurre sec de tourage | 1000 g | - | 0 % |',
      ],
      expectedName: 'Croissant',
      expected: [['vesi', 720], ['Suomen hiiva kilohiiva 1kg', 55.01], ['Beurre sec de tourage', 1000]],
    },
    {
      recipe: 'Glace yaourt',
      portions: 1,
      rows: [
        '| Pitkäsen Maalaisjuustolan laktoositon luonnonjogurtti | 600 g | - | 0 % |',
        '| **Menu laktoositon vispikerma 38% 1l UHT** GTIN 6410405326256 - SAP 21941366 | 200 g | - | 0 % |',
        '| Stab2000 | 2 g | - | 0 % |',
      ],
      expectedName: 'Glace yaourt',
      expected: [['Pitkäsen Maalaisjuustolan laktoositon luonnonjogurtti', 600], ['Menu laktoositon vispikerma 38% 1l UHT', 200], ['Stab2000', 2]],
    },
    {
      recipe: 'Hillo, mustikka kilo',
      portions: 1,
      rows: [
        '| **Menu suomalainen mustikka 2,5kg pakaste** GTIN 6410405322418 - SAP 22013342 | 655,74 g | - | 2 % |',
        '| **Sosa pektiini medium rapid set keltainen 500g** GTIN 8414933009535 - SAP 22016705 | 20 g | - | 2 % |',
        '| **Menu sokeri 25kg** GTIN 6410405347480 - SAP 22036883 | 327,87 g | - | 2 % |',
      ],
      expectedName: 'Hillo, mustikka kilo',
      expected: [['Menu suomalainen mustikka 2,5kg pakaste', 655.74], ['Sosa pektiini medium rapid set keltainen 500g', 20], ['Menu sokeri 25kg', 327.87]],
    },
  ])('extracts exact ingredients from $recipe', ({ recipe, portions, rows, expectedName, expected }) => {
    const result = parse(kesproMarkdown(recipe, portions, rows));

    expect(result.name).toBe(expectedName);
    expect(result.referencePortions).toBe(portions);
    expect(result.ingredients.map((ingredient: any) => [ingredient.name, ingredient.quantity])).toEqual(expected);
    expect(result.warnings).toEqual([]);
  });

  it('keeps unmatched ingredients as new Stocks products instead of dropping them', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ stocksInstalledAt: new Date(), technicalSheetsInstalledAt: new Date() }) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      unit: { findMany: jest.fn().mockResolvedValue([{ id: 'unit-g', name: 'Gramme', symbol: 'g' }]) },
      technicalSheetCategory: { findMany: jest.fn().mockResolvedValue([{ id: 'cat-1', name: 'Pâtisserie' }]) },
    };
    const mistral = {
      ocrMarkdown: jest.fn().mockResolvedValue({ markdown: kesproMarkdown('Glace yaourt', 1, ['| Stab2000 | 2 g | - | 0 % |']), pageCount: 2 }),
      chatJson: jest.fn().mockResolvedValue({ ...baseImport, name: 'Glace yaourt' }),
    };
    const result = await new TechnicalSheetsService(prisma as any, mistral as any).importRecipePdf('org-1', {
      originalname: 'Glace yaourt - Kespro.com.pdf',
      mimetype: 'application/pdf',
      size: 3,
      buffer: Buffer.from('pdf'),
    });

    expect(result.matchedIngredientsCount).toBe(0);
    expect(result.newProductsCount).toBe(1);
    expect(result.skippedIngredientsCount).toBe(0);
    expect(result.payload.ingredients).toEqual([expect.objectContaining({ productName: 'Stab2000', createProduct: true, quantity: 2, unitId: 'unit-g' })]);
  });

  it('does not match a short ingredient name to a contaminated longer product name', () => {
    const matched = (service as any).matchProduct('Italialainen marenki', [{
      id: 'bad-product',
      name: 'Italialainen marenki 900 g Polarica suomalainen mustikka 2,5kg pakaste',
    }]);

    expect(matched).toBeNull();
  });

  it('creates a pending product and its ingredient atomically when the recipe is saved', async () => {
    const unit = { id: 'unit-g', symbol: 'g' };
    const product = { id: 'product-new', name: 'Stab2000', unitId: unit.id, unit, isArchived: false };
    const tx = {
      technicalSheetIngredient: { deleteMany: jest.fn(), create: jest.fn() },
      unit: { findFirst: jest.fn().mockResolvedValue(unit) },
      product: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(product) },
      auditLog: { create: jest.fn() },
    };

    await (service as any).replaceIngredients(tx, 'org-1', 'sheet-1', [{
      productName: 'Stab2000',
      createProduct: true,
      unitId: unit.id,
      quantity: 2,
    }], 'user-1');

    expect(tx.product.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'Stab2000', unitId: 'unit-g' }) }));
    expect(tx.technicalSheetIngredient.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productId: 'product-new', quantity: 2 }) }));
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
