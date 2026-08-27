import { TechnicalSheetsService } from './technical-sheets.service';
import AdmZip from 'adm-zip';
import { Prisma, ProductKind, TechnicalSheetYieldMode, UnitType } from '@prisma/client';

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

const kesproMarkdown = (name: string, portions: number, rows: string[]) =>
  [
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
      expected: [
        ['Italialainen marenki', 900],
        ['Polarica suomalainen mustikka 2,5kg pakaste', 900],
        ['Liivate Bovine', 60],
        ['Kylmä vesi', 300],
      ],
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
      expected: [
        ['vesi', 720],
        ['Suomen hiiva kilohiiva 1kg', 55.01],
        ['Beurre sec de tourage', 1000],
      ],
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
      expected: [
        ['Pitkäsen Maalaisjuustolan laktoositon luonnonjogurtti', 600],
        ['Menu laktoositon vispikerma 38% 1l UHT', 200],
        ['Stab2000', 2],
      ],
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
      expected: [
        ['Menu suomalainen mustikka 2,5kg pakaste', 655.74],
        ['Sosa pektiini medium rapid set keltainen 500g', 20],
        ['Menu sokeri 25kg', 327.87],
      ],
    },
  ])(
    'extracts exact ingredients from $recipe',
    ({ recipe, portions, rows, expectedName, expected }) => {
      const result = parse(kesproMarkdown(recipe, portions, rows));

      expect(result.name).toBe(expectedName);
      expect(result.referencePortions).toBe(portions);
      expect(
        result.ingredients.map((ingredient: any) => [ingredient.name, ingredient.quantity]),
      ).toEqual(expected);
      expect(result.warnings).toEqual([]);
    },
  );

  it('keeps unmatched ingredients as new Stocks products instead of dropping them', async () => {
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          }),
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      unit: {
        findMany: jest.fn().mockResolvedValue([{ id: 'unit-g', name: 'Gramme', symbol: 'g' }]),
      },
      technicalSheetCategory: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cat-1', name: 'Pâtisserie' }]),
      },
    };
    const mistral = {
      ocrMarkdown: jest
        .fn()
        .mockResolvedValue({
          markdown: kesproMarkdown('Glace yaourt', 1, ['| Stab2000 | 2 g | - | 0 % |']),
          pageCount: 2,
        }),
      chatJson: jest.fn().mockResolvedValue({ ...baseImport, name: 'Glace yaourt' }),
    };
    const result = await new TechnicalSheetsService(prisma as any, mistral as any).importRecipePdf(
      'org-1',
      {
        originalname: 'Glace yaourt - Kespro.com.pdf',
        mimetype: 'application/pdf',
        size: 3,
        buffer: Buffer.from('pdf'),
      },
    );

    expect(result.matchedIngredientsCount).toBe(0);
    expect(result.newProductsCount).toBe(1);
    expect(result.skippedIngredientsCount).toBe(0);
    expect(result.payload.stockPolicy).toBe('MAKE_TO_STOCK');
    expect(result.payload.ingredients).toEqual([
      expect.objectContaining({
        productName: 'Stab2000',
        createProduct: true,
        quantity: 2,
        unitId: 'unit-g',
      }),
    ]);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: {
            in: [ProductKind.UNSPECIFIED, ProductKind.RAW_MATERIAL, ProductKind.PACKAGED],
          },
        }),
      }),
    );
  });

  it('does not match a short ingredient name to a contaminated longer product name', () => {
    const matched = (service as any).matchProduct('Italialainen marenki', [
      {
        id: 'bad-product',
        name: 'Italialainen marenki 900 g Polarica suomalainen mustikka 2,5kg pakaste',
      },
    ]);

    expect(matched).toBeNull();
  });

  it('creates a pending product and its ingredient atomically when the recipe is saved', async () => {
    const unit = { id: 'unit-g', symbol: 'g' };
    const product = {
      id: 'product-new',
      name: 'Stab2000',
      unitId: unit.id,
      unit,
      isArchived: false,
    };
    const tx = {
      technicalSheet: { findFirst: jest.fn().mockResolvedValue({ mode: 'PRODUCTION' }) },
      technicalSheetIngredient: { deleteMany: jest.fn(), create: jest.fn() },
      unit: { findFirst: jest.fn().mockResolvedValue(unit) },
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(product),
      },
      auditLog: { create: jest.fn() },
    };

    await (service as any).replaceIngredients(
      tx,
      'org-1',
      'sheet-1',
      [
        {
          productName: 'Stab2000',
          createProduct: true,
          unitId: unit.id,
          quantity: 2,
        },
      ],
      'user-1',
    );

    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Stab2000', unitId: 'unit-g' }),
      }),
    );
    expect(tx.technicalSheetIngredient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'product-new', quantity: 2 }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('creates the internal production output automatically from the sheet yield', async () => {
    const unit = { id: 'unit-piece', name: 'Pièce', symbol: 'pc' };
    const outputProduct = {
      id: 'product-output',
      name: 'Snicker',
      unitId: unit.id,
      unit,
      kind: 'FINISHED',
    };
    const tx = {
      unit: { findFirst: jest.fn().mockResolvedValue(unit) },
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(outputProduct),
      },
      auditLog: { create: jest.fn() },
    };

    const result = await (service as any).resolveRecipeOutputTx(
      tx,
      'org-1',
      {
        name: 'Snicker',
        referencePortions: 24,
        mode: 'ASSEMBLY',
      },
      undefined,
      'user-1',
    );

    expect(result).toEqual({ outputProductId: 'product-output', yieldUnitId: 'unit-piece' });
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Snicker', unitId: 'unit-piece', kind: 'FINISHED' }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('uses a gram output unit when the sheet yield is based on total mass', async () => {
    const gram = {
      id: 'unit-g',
      name: 'Gramme',
      symbol: 'g',
      type: UnitType.MASS,
    };
    const outputProduct = {
      id: 'product-output',
      name: 'Ganache',
      unitId: gram.id,
      unit: gram,
      kind: ProductKind.INTERMEDIATE,
    };
    const tx = {
      unit: { findFirst: jest.fn().mockResolvedValue(gram) },
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(outputProduct),
      },
      auditLog: { create: jest.fn() },
    };

    const result = await (service as any).resolveRecipeOutputTx(
      tx,
      'org-1',
      {
        name: 'Ganache',
        yieldMode: TechnicalSheetYieldMode.MASS,
        referencePortions: 1,
        mode: 'PRODUCTION',
      },
      undefined,
      'user-1',
    );

    expect(result).toEqual({
      outputProductId: 'product-output',
      yieldUnitId: 'unit-g',
    });
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Ganache',
          unitId: 'unit-g',
          kind: ProductKind.INTERMEDIATE,
        }),
      }),
    );
  });

  it('calculates stock prices, total mass, total cost and portion cost separately', async () => {
    const kg = { id: 'unit-kg', symbol: 'kg', type: UnitType.MASS };
    const gram = { id: 'unit-g', symbol: 'g', type: UnitType.MASS };
    const flour = {
      id: 'line-flour',
      productId: 'product-flour',
      product: {
        id: 'product-flour',
        name: 'Farine',
        averagePrice: new Prisma.Decimal(3),
        unitId: kg.id,
        unit: kg,
        isArchived: false,
      },
      sourceTechnicalSheetId: null,
      sourceTechnicalSheet: null,
      unitId: kg.id,
      unit: kg,
      quantity: new Prisma.Decimal(2),
    };
    const sugar = {
      id: 'line-sugar',
      productId: 'product-sugar',
      product: {
        id: 'product-sugar',
        name: 'Sucre',
        averagePrice: new Prisma.Decimal(2),
        unitId: kg.id,
        unit: kg,
        isArchived: false,
      },
      sourceTechnicalSheetId: null,
      sourceTechnicalSheet: null,
      unitId: gram.id,
      unit: gram,
      quantity: new Prisma.Decimal(500),
    };
    const recipe = {
      id: 'sheet-biscuit',
      yieldMode: TechnicalSheetYieldMode.PORTIONS,
      referencePortions: new Prisma.Decimal(10),
      ingredients: [flour, sugar],
    };
    const updatedRecipe = {
      ...recipe,
      totalCost: new Prisma.Decimal(7),
      costPerPortion: new Prisma.Decimal(0.7),
      costPerKg: new Prisma.Decimal(2.8),
      totalMassGrams: new Prisma.Decimal(2500),
    };
    const tx = {
      technicalSheet: {
        findUnique: jest.fn().mockResolvedValue(recipe),
        update: jest.fn().mockResolvedValue(updatedRecipe),
      },
      technicalSheetIngredient: { update: jest.fn() },
      technicalSheetCostSnapshot: { create: jest.fn() },
      technicalSheetHistory: { create: jest.fn() },
      unit: { findFirst: jest.fn().mockResolvedValue(gram) },
      unitConversion: {
        findFirst: jest.fn().mockResolvedValue({
          factor: new Prisma.Decimal(0.001),
        }),
      },
    };

    await (service as any).recalculateCostTx(tx, 'org-1', recipe.id, 'user-1', true);

    const updateData = tx.technicalSheet.update.mock.calls[0][0].data;
    expect(Number(updateData.totalCost)).toBeCloseTo(7);
    expect(Number(updateData.totalMassGrams)).toBeCloseTo(2500);
    expect(Number(updateData.costPerPortion)).toBeCloseTo(0.7);
    expect(Number(updateData.costPerKg)).toBeCloseTo(2.8);
    expect(tx.technicalSheetIngredient.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          unitPriceSnapshot: flour.product.averagePrice,
          cost: expect.anything(),
        }),
      }),
    );
    expect(tx.technicalSheetCostSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costPerPortion: expect.anything(),
          costPerKg: expect.anything(),
        }),
      }),
    );
  });

  it('creates the site production profile automatically from the recipe yield', async () => {
    const sheet = {
      id: 'sheet-snicker',
      name: 'Snicker',
      mode: 'ASSEMBLY',
      status: 'ACTIVE',
      isArchived: false,
      outputProductId: 'product-snicker',
      yieldUnitId: 'unit-piece',
      referencePortions: new Prisma.Decimal(24),
    };
    const profile = {
      id: 'profile-snicker',
      organizationId: 'org-1',
      siteId: 'site-2',
      technicalSheetId: sheet.id,
      outputProductId: sheet.outputProductId,
      outputVariantId: null,
      yieldUnitId: sheet.yieldUnitId,
      referenceYield: sheet.referencePortions,
      mode: 'FIXED',
    };
    const tx = {
      technicalSheet: {
        findFirst: jest.fn().mockResolvedValue(sheet),
        update: jest.fn(),
      },
      site: { findFirst: jest.fn().mockResolvedValue({ id: 'site-2' }) },
      unit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-piece',
          organizationId: 'org-1',
          type: 'COUNT',
        }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-snicker',
          name: 'Snicker',
          kind: 'FINISHED',
          unitId: 'unit-piece',
          unit: { id: 'unit-piece' },
        }),
        update: jest.fn(),
      },
      productionProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(profile),
        update: jest.fn(),
      },
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          stocksInstalledAt: new Date(),
          technicalSheetsInstalledAt: new Date(),
        }),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const automaticService = new TechnicalSheetsService(prisma as any, {} as any);

    const result = await automaticService.ensureProductionProfile(
      'org-1',
      { id: 'user-1', role: 'Manager' },
      sheet.id,
      'site-2',
    );

    expect(tx.productionProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        siteId: 'site-2',
        technicalSheetId: sheet.id,
        outputProductId: 'product-snicker',
        yieldUnitId: 'unit-piece',
        referenceYield: sheet.referencePortions,
        mode: 'FIXED',
      }),
    });
    expect(result).toBe(profile);
  });

  it('links a sub-recipe to its manufactured product', async () => {
    const unit = { id: 'unit-g', symbol: 'g' };
    const outputProduct = {
      id: 'product-ganache',
      name: 'Ganache',
      unitId: unit.id,
      unit,
      isArchived: false,
    };
    const source = {
      id: 'sheet-ganache',
      name: 'Ganache',
      mode: 'PRODUCTION',
      status: 'ACTIVE',
      outputProductId: outputProduct.id,
      outputProduct,
      yieldUnit: unit,
    };
    const tx = {
      technicalSheetIngredient: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      technicalSheet: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ mode: 'ASSEMBLY' })
          .mockResolvedValueOnce(source),
      },
      unit: { findFirst: jest.fn().mockResolvedValue(unit) },
      product: { findFirst: jest.fn().mockResolvedValue(outputProduct) },
    };

    await (service as any).replaceIngredients(tx, 'org-1', 'sheet-snicker', [
      {
        sourceTechnicalSheetId: source.id,
        productId: '',
        unitId: unit.id,
        quantity: 500,
        section: 'Ganache',
      },
    ]);

    expect(tx.technicalSheetIngredient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          technicalSheetId: 'sheet-snicker',
          sourceTechnicalSheetId: 'sheet-ganache',
          productId: 'product-ganache',
          quantity: 500,
          section: 'Ganache',
        }),
      }),
    );
  });

  it('rejects sub-recipes in a fabrication sheet', async () => {
    const tx = {
      technicalSheet: { findFirst: jest.fn().mockResolvedValue({ mode: 'PRODUCTION' }) },
      technicalSheetIngredient: { deleteMany: jest.fn() },
    };

    await expect(
      (service as any).replaceIngredients(tx, 'org-1', 'sheet-biscuit', [
        {
          sourceTechnicalSheetId: 'sheet-ganache',
          productId: '',
          unitId: 'unit-piece',
          quantity: 1,
        },
      ]),
    ).rejects.toThrow('sans sous-recette');
  });

  it('rejects a production output used as a direct Stocks ingredient', async () => {
    const unit = { id: 'unit-piece', symbol: 'pc' };
    const tx = {
      technicalSheet: { findFirst: jest.fn().mockResolvedValue({ mode: 'ASSEMBLY' }) },
      technicalSheetIngredient: { deleteMany: jest.fn() },
      unit: { findFirst: jest.fn().mockResolvedValue(unit) },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-biscuit',
          name: 'Biscuit Joconde',
          kind: ProductKind.INTERMEDIATE,
          unitId: unit.id,
          unit,
        }),
      },
    };

    await expect(
      (service as any).replaceIngredients(tx, 'org-1', 'sheet-snicker', [
        {
          productId: 'product-biscuit',
          unitId: unit.id,
          quantity: 1,
        },
      ]),
    ).rejects.toThrow('production interne');
  });

  it('keeps only Brouillon and Actif as visible workflow statuses', () => {
    expect((service as any).visibleRecipeStatus('DRAFT')).toBe('DRAFT');
    expect((service as any).visibleRecipeStatus('ACTIVE')).toBe('ACTIVE');
    expect((service as any).visibleRecipeStatus('VALIDATED')).toBe('ACTIVE');
    expect((service as any).visibleRecipeStatus('ARCHIVED')).toBe('DRAFT');
  });

  it('rejects circular sub-recipes', async () => {
    const tx = {
      technicalSheetIngredient: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ sourceTechnicalSheetId: 'sheet-biscuit' }])
          .mockResolvedValueOnce([{ sourceTechnicalSheetId: 'sheet-snicker' }]),
      },
    };

    await expect(
      (service as any).assertNoSubRecipeCycleTx(tx, 'org-1', 'sheet-snicker', 'sheet-ganache'),
    ).rejects.toThrow('Cycle de sous-recettes détecté');
  });

  it.each(['Fiche.pages', 'Recette.numbers'])(
    'extracts the embedded Apple preview before OCR for %s',
    (originalname) => {
      const archive = new AdmZip();
      archive.addFile('preview.jpg', Buffer.from('jpeg-preview'));

      const input = (service as any).recipeOcrInput({
        originalname,
        mimetype: 'application/zip',
        size: archive.toBuffer().length,
        buffer: archive.toBuffer(),
      });

      expect(input.mimeType).toBe('image/jpeg');
      expect(input.buffer.toString()).toBe('jpeg-preview');
    },
  );

  it('keeps recipe import progress derived from persisted document and OCR states', () => {
    const baseDocument = {
      id: 'doc-1',
      originalName: 'Madeleine.pages',
      mimeType: 'application/zip',
      sizeBytes: 12,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(
      (service as any).recipeImportStatus(
        { ...baseDocument, status: 'UPLOADED' },
        { status: 'PENDING' },
        null,
      ),
    ).toEqual(expect.objectContaining({ state: 'en attente', progress: 12 }));
    expect(
      (service as any).recipeImportStatus(
        { ...baseDocument, status: 'PROCESSING' },
        { status: 'PROCESSING' },
        null,
      ),
    ).toEqual(expect.objectContaining({ state: 'analyse', progress: 55 }));
    expect(
      (service as any).recipeImportStatus(
        { ...baseDocument, status: 'PROCESSED' },
        { status: 'COMPLETED' },
        { extractedJson: baseImport },
      ),
    ).toEqual(expect.objectContaining({ state: 'vérifier', progress: 100, result: baseImport }));
  });

  it('limits a recipe OCR batch to ten files', async () => {
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          }),
      },
    };
    const importService = new TechnicalSheetsService(prisma as any, {} as any);
    const files = Array.from({ length: 11 }, (_, index) => ({
      originalname: `recette-${index + 1}.pdf`,
      mimetype: 'application/pdf',
      size: 3,
      buffer: Buffer.from('pdf'),
    }));

    await expect(
      importService.uploadRecipeImports('org-1', { id: 'user-1', role: 'ADMIN' }, files),
    ).rejects.toThrow('Vous pouvez importer 10 fiches techniques maximum.');
  });

  it('retries only the structured recipe extraction when Mistral briefly rate-limits a batch', async () => {
    const mistral = {
      chatJson: jest
        .fn()
        .mockRejectedValueOnce(new Error('Mistral a refusé la demande (429)'))
        .mockResolvedValue(baseImport),
    };
    const retryingService = new TechnicalSheetsService({} as any, mistral as any);
    jest.spyOn(retryingService as any, 'waitRecipeImportRetry').mockResolvedValue(undefined);

    await expect(
      (retryingService as any).extractRecipeFromOcr('org-1', '# Recette', 'recette.pages'),
    ).resolves.toEqual(baseImport);
    expect(mistral.chatJson).toHaveBeenCalledTimes(2);
  });

  it('gives recipe extraction more time and retries a transient Mistral timeout', async () => {
    const mistral = {
      chatJson: jest
        .fn()
        .mockRejectedValueOnce(
          new Error('Mistral indisponible: Délai Mistral dépassé après 180000 ms'),
        )
        .mockResolvedValue(baseImport),
    };
    const retryingService = new TechnicalSheetsService({} as any, mistral as any);
    jest.spyOn(retryingService as any, 'waitRecipeImportRetry').mockResolvedValue(undefined);

    await expect(
      (retryingService as any).extractRecipeFromOcr('org-1', '# Recette', 'macaron.pdf'),
    ).resolves.toEqual(baseImport);
    expect(mistral.chatJson).toHaveBeenCalledTimes(2);
    expect(mistral.chatJson).toHaveBeenCalledWith(
      'org-1',
      expect.any(Array),
      'toquehub_recipe_pdf_import',
      expect.any(Object),
      expect.objectContaining({ timeoutMs: 180_000 }),
    );
  });

  it('marks the exact import as reviewed inside the recipe creation transaction', async () => {
    const tx = {
      document: {
        findFirst: jest.fn().mockResolvedValue({ id: 'document-1', sourceId: 'extraction-1' }),
        update: jest.fn(),
      },
      ocrBusinessExtraction: { updateMany: jest.fn() },
    };

    await (service as any).markRecipeImportReviewedTx(tx, 'org-1', 'document-1');

    expect(tx.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        organizationId: 'org-1',
        sourceModule: 'technical-sheets',
        sourceType: 'recipe-import',
      },
    });
    expect(tx.ocrBusinessExtraction.updateMany).toHaveBeenCalledWith({
      where: { id: 'extraction-1', organizationId: 'org-1' },
      data: { status: 'REVIEWED' },
    });
    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { sourceType: 'recipe-import-reviewed' },
    });
  });

  it('derives the HT target and gross margin from a TTC target using the organization regulatory country', async () => {
    const updatedRecipe = {
      id: 'sheet-1',
      referencePortions: 1,
      totalCost: 4,
      costPerPortion: 4,
      targetSellingPriceHtPerPortion: 10,
      ingredients: [],
      steps: [],
    };
    const tx = {
      technicalSheet: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue(updatedRecipe) },
      technicalSheetHistory: { create: jest.fn() },
    };
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          })
          .mockResolvedValueOnce({ regulatoryCountryCode: 'FR' }),
      },
      technicalSheet: { findFirst: jest.fn().mockResolvedValue({ id: 'sheet-1' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const pricingService = new TechnicalSheetsService(prisma as any, {} as any);

    const result = await pricingService.updateRecipePricing(
      'org-1',
      { id: 'user-1', role: 'ADMIN' },
      'sheet-1',
      { targetSellingPriceInclTax: 11 },
    );

    expect(tx.technicalSheet.update).toHaveBeenCalledWith({
      where: { id: 'sheet-1', organizationId: 'org-1' },
      data: { targetSellingPriceHtPerPortion: expect.objectContaining({}) },
    });
    expect(
      Number(tx.technicalSheet.update.mock.calls[0][0].data.targetSellingPriceHtPerPortion),
    ).toBe(10);
    expect(result).toEqual(
      expect.objectContaining({
        targetSellingPriceExclTax: 10,
        targetSellingPriceInclTax: 11,
        grossMarginAmount: 6,
        grossMarginRate: 60,
        salesTaxRate: 10,
        regulatoryCountryCode: 'FR',
      }),
    );
  });

  it('does not pre-create recipe categories during module installation', async () => {
    const tx = {
      organization: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            rnmPricesInstalledAt: null,
            hrInstalledAt: null,
            planningInstalledAt: null,
          }),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const onboardingService = new TechnicalSheetsService(prisma as any, {} as any);

    await onboardingService.install('org-1', { id: 'user-1', role: 'ADMIN' });

    expect(tx.organization.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect((tx as any).technicalSheetCategory).toBeUndefined();
  });

  it('derives the technical-sheets onboarding step from real categories and recipes', async () => {
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          }),
      },
      technicalSheetCategory: { findMany: jest.fn().mockResolvedValue([{ name: 'Pâtisserie' }]) },
      technicalSheet: { count: jest.fn().mockResolvedValue(0) },
    };
    const onboardingService = new TechnicalSheetsService(prisma as any, {} as any);

    const result = await onboardingService.onboarding('org-1');

    expect(result).toEqual(
      expect.objectContaining({
        categoryCount: 1,
        recipeCount: 0,
        completed: false,
        nextStep: 'recipe',
        selectedCategoryNames: ['Pâtisserie'],
      }),
    );
    expect(result.suggestedCategories).toContain('Pâtisserie');
  });

  it('restores archived categories and avoids case-insensitive duplicates during onboarding', async () => {
    const tx = {
      technicalSheetCategory: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cat-1', name: 'Pâtisserie', isArchived: true }]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          }),
      },
      technicalSheetCategory: {
        findMany: jest.fn().mockResolvedValue([{ name: 'Pâtisserie' }, { name: 'Desserts' }]),
      },
      technicalSheet: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const onboardingService = new TechnicalSheetsService(prisma as any, {} as any);

    await onboardingService.completeOnboardingCategories('org-1', { id: 'user-1', role: 'ADMIN' }, [
      'Pâtisserie',
      'pâtisserie',
      ' Desserts ',
    ]);

    expect(tx.technicalSheetCategory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cat-1'] }, organizationId: 'org-1' },
      data: { isArchived: false, archivedAt: null },
    });
    expect(tx.technicalSheetCategory.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: 'org-1', name: 'Desserts' }],
      skipDuplicates: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ details: { names: ['Pâtisserie', 'Desserts'] } }),
      }),
    );
  });

  it('reactivates an archived recipe when a new import uses the same name', async () => {
    const archivedRecipe = {
      id: 'sheet-croissant',
      name: 'Croissant',
      isArchived: true,
      outputProductId: null,
      yieldUnitId: 'unit-portion',
      mode: 'PRODUCTION',
    };
    const restoredRecipe = { ...archivedRecipe, isArchived: false, status: 'DRAFT' };
    const tx = {
      technicalSheet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(archivedRecipe),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(restoredRecipe),
        create: jest.fn(),
      },
    };
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          }),
      },
      technicalSheet: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: archivedRecipe.id,
            name: archivedRecipe.name,
            isArchived: true,
          }),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const restoringService = new TechnicalSheetsService(prisma as any, {} as any);
    jest
      .spyOn(restoringService as any, 'resolveRecipeOutputTx')
      .mockResolvedValue({ outputProductId: null, yieldUnitId: 'unit-portion' });
    jest.spyOn(restoringService as any, 'replaceChildren').mockResolvedValue(undefined);
    jest.spyOn(restoringService as any, 'assertRecipeCanBeActiveTx').mockResolvedValue(undefined);
    jest.spyOn(restoringService as any, 'syncProductionProfileTx').mockResolvedValue(undefined);
    const history = jest.spyOn(restoringService as any, 'history').mockResolvedValue(undefined);
    jest.spyOn(restoringService as any, 'recalculateCostTx').mockResolvedValue(undefined);
    jest
      .spyOn(restoringService as any, 'serializeRecipe')
      .mockReturnValue({ id: archivedRecipe.id, name: archivedRecipe.name });

    const result = await restoringService.createRecipe('org-1', { id: 'user-1', role: 'ADMIN' }, {
      name: ' Croissant ',
      mode: 'PRODUCTION',
      status: 'DRAFT',
      referencePortions: 28,
      ingredients: [],
      steps: [],
    } as any);

    expect(tx.technicalSheet.create).not.toHaveBeenCalled();
    expect(tx.technicalSheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: archivedRecipe.id, organizationId: 'org-1' },
        data: expect.objectContaining({
          name: 'Croissant',
          isArchived: false,
          archivedAt: null,
          sourceTechnicalSheetId: null,
        }),
      }),
    );
    expect(history).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      archivedRecipe.id,
      'user-1',
      'STATUS_CHANGED',
      'Réactivation de la fiche archivée avec un nouvel import',
      expect.objectContaining({ restoredFromArchive: true }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: archivedRecipe.id,
        name: 'Croissant',
        restoredFromArchive: true,
      }),
    );
  });

  it('rejects a duplicate active recipe with a clear business error', async () => {
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            stocksInstalledAt: new Date(),
            technicalSheetsInstalledAt: new Date(),
          }),
      },
      technicalSheet: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sheet-croissant', name: 'Croissant', isArchived: false }),
      },
      $transaction: jest.fn(),
    };
    const duplicateService = new TechnicalSheetsService(prisma as any, {} as any);

    await expect(
      duplicateService.createRecipe('org-1', { id: 'user-1', role: 'ADMIN' }, {
        name: 'croissant',
        mode: 'PRODUCTION',
        status: 'DRAFT',
        referencePortions: 28,
      } as any),
    ).rejects.toThrow('Une fiche technique nommée « Croissant » existe déjà.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('always stores technical sheets with stock production policy', () => {
    const stockService = new TechnicalSheetsService({} as any, {} as any);
    const payload = {
      name: 'Croissant',
      referencePortions: 28,
      stockPolicy: 'MAKE_TO_ORDER',
    } as any;

    expect((stockService as any).recipeCreateData('org-1', payload).stockPolicy).toBe(
      'MAKE_TO_STOCK',
    );
    expect((stockService as any).recipeUpdateData(payload).stockPolicy).toBe('MAKE_TO_STOCK');
  });

  it('rejects a technical sheet step without a positive duration before replacing existing steps', async () => {
    const tx = {
      technicalSheetStep: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await expect(
      (service as any).replaceSteps(tx, 'org-1', 'sheet-1', [
        {
          order: 1,
          title: 'Cuisson',
          description: 'Cuire la préparation.',
          estimatedTimeMinutes: 0,
        },
      ]),
    ).rejects.toThrow('Indiquez une durée entière supérieure à 0 minute pour l’étape « Cuisson ».');
    expect(tx.technicalSheetStep.deleteMany).not.toHaveBeenCalled();
    expect(tx.technicalSheetStep.createMany).not.toHaveBeenCalled();
  });

  it('stores a positive duration supplied by the technical sheet editor', async () => {
    const tx = {
      technicalSheetStep: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await (service as any).replaceSteps(tx, 'org-1', 'sheet-1', [
      {
        order: 1,
        title: 'Cuisson',
        description: 'Cuire la préparation.',
        estimatedTimeMinutes: 15,
      },
    ]);

    expect(tx.technicalSheetStep.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          technicalSheetId: 'sheet-1',
          title: 'Cuisson',
          estimatedMinutes: 15,
        }),
      ],
    });
  });

  it('prevents an existing step without duration from being activated', async () => {
    const tx = {
      technicalSheet: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Croissant',
          status: 'ACTIVE',
          mode: 'ASSEMBLY',
          yieldMode: 'PORTIONS',
          referencePortions: new Prisma.Decimal(12),
          totalMassGrams: new Prisma.Decimal(0),
          _count: { ingredients: 1, steps: 1 },
        }),
      },
      technicalSheetStep: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ order: 1, title: 'Tourage' }),
      },
    };

    await expect(
      (service as any).assertRecipeCanBeActiveTx(tx, 'sheet-1'),
    ).rejects.toThrow(
      'Indiquez une durée entière supérieure à 0 minute pour l’étape « Tourage ».',
    );
  });
});
