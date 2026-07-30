import { BadRequestException } from '@nestjs/common';
import { StocksOcrService } from './stocks-ocr.service';

function createSubject(extraction: Record<string, unknown>) {
  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'product-1',
        name: 'Fond de tarte',
      }),
    },
  } as any;
  const mistralClient = {
    ocrMarkdown: jest.fn().mockResolvedValue({
      markdown: 'Nutrition per 100 g. Contains eggs, milk, wheat and soy. May contain almonds and sesame.',
      pageCount: 1,
      durationMs: 120,
    }),
    chatJson: jest.fn().mockResolvedValue(extraction),
  } as any;
  const service = new StocksOcrService(
    prisma,
    {} as any,
    mistralClient,
    {} as any,
  );
  return { service, prisma, mistralClient };
}

function labelFile() {
  return {
    originalname: 'etiquette.jpg',
    mimetype: 'image/jpeg',
    size: 256,
    buffer: Buffer.from('image'),
  };
}

const nutrition = {
  energyKj: 1867,
  energyKcal: 444,
  fatGrams: 22.7,
  saturatedFatGrams: 12,
  carbohydratesGrams: 52.5,
  sugarsGrams: 20,
  fiberGrams: 2,
  proteinGrams: 7.1,
  saltGrams: 0.2,
};

describe('StocksOcrService product label OCR', () => {
  it('extracts per-100g nutrition and keeps contains separate from may contain', async () => {
    const { service, prisma, mistralClient } = createSubject({
      ingredients:
        'Tart shell: wheat flour, sugar, butter, egg, soya bean oil and vanilla extract.',
      nutrition,
      allergensPresent: [
        'Eggs and their derivatives',
        'Milk',
        'Wheat',
        'Soybeans',
      ],
      possibleTraces: ['Tree nuts', 'Almond', 'Sesame'],
      confidence: 0.94,
      warnings: [],
    });

    const result = await service.analyzeProductLabel(
      'org-1',
      { id: 'user-1', role: 'Chef' },
      'product-1',
      labelFile(),
    );

    expect(result.ingredients).toBe(
      'Tart shell: wheat flour, sugar, butter, egg, soya bean oil and vanilla extract.',
    );
    expect(result.nutrition).toEqual(nutrition);
    expect(result.allergensPresent).toEqual(['Gluten', 'Blé', 'Lait', 'Œuf', 'Soja']);
    expect(result.possibleTraces).toEqual(['Fruits à coque', 'Amande', 'Sésame']);
    expect(result.confidence).toBe(0.94);
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'product-1', organizationId: 'org-1', isArchived: false },
      select: { id: true, name: true },
    });
    expect(mistralClient.ocrMarkdown).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ mimeType: 'image/jpeg', withAnnotation: false }),
    );
  });

  it('gives confirmed allergens priority over possible traces', async () => {
    const { service } = createSubject({
      nutrition,
      allergensPresent: ['Almond'],
      possibleTraces: ['Tree nuts', 'Almond'],
      confidence: 0.8,
      warnings: [],
    });

    const result = await service.analyzeProductLabel(
      'org-1',
      { id: 'user-1', role: 'Chef' },
      'product-1',
      labelFile(),
    );

    expect(result.allergensPresent).toEqual(['Fruits à coque', 'Amande']);
    expect(result.possibleTraces).toEqual([]);
  });

  it('rejects implausible nutrition values from automatic prefill', async () => {
    const { service } = createSubject({
      nutrition: {
        ...nutrition,
        energyKcal: 20_000,
        saltGrams: -1,
      },
      allergensPresent: [],
      possibleTraces: [],
      confidence: 1.4,
      warnings: [],
    });

    const result = await service.analyzeProductLabel(
      'org-1',
      { id: 'user-1', role: 'Chef' },
      'product-1',
      labelFile(),
    );

    expect(result.nutrition.energyKcal).toBeNull();
    expect(result.nutrition.saltGrams).toBeNull();
    expect(result.confidence).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('énergie (kcal)'),
        expect.stringContaining('sel'),
      ]),
    );
  });

  it('falls back to the OCR text when Mistral cannot structure the label', async () => {
    const { service, mistralClient } = createSubject({});
    mistralClient.ocrMarkdown.mockResolvedValueOnce({
      markdown: [
        'Nutritional information',
        'Per 100 g',
        'Energy 1867 kJ / 444 kcal',
        'Fat 22.7 g',
        'from which saturated 12 g',
        'Carbohydrates 52.5 g',
        'from which sugars 20 g',
        'Dietary fiber 2 g',
        'Protein 7.1 g',
        'Salt 0.2 g',
        'Ingredients: Wheat flour, sugar, butter, egg and soya bean oil.',
        'Allergens',
        'Contains',
        'Eggs and their derivatives',
        'Milk and its derivatives',
        'Wheat and its derivatives',
        'Soybeans and their derivatives',
        'May contain',
        'Tree nuts and their derivatives',
        'Sesame seeds or their derivatives',
        'Almond and almond products',
        'We recommend checking the packaging label.',
      ].join('\n'),
      pageCount: 1,
      durationMs: 120,
    });
    mistralClient.chatJson.mockRejectedValueOnce(
      new BadRequestException('Mistral a refusé la demande (400)'),
    );

    const result = await service.analyzeProductLabel(
      'org-1',
      { id: 'user-1', role: 'Chef' },
      'product-1',
      labelFile(),
    );

    expect(result.ingredients).toBe(
      'Wheat flour, sugar, butter, egg and soya bean oil.',
    );
    expect(result.nutrition).toEqual(nutrition);
    expect(result.allergensPresent).toEqual(['Gluten', 'Blé', 'Lait', 'Œuf', 'Soja']);
    expect(result.possibleTraces).toEqual(['Fruits à coque', 'Amande', 'Sésame']);
    expect(result.warnings).toEqual([
      expect.stringContaining('directement depuis le texte OCR'),
    ]);
  });

  it('requires an uploaded label image', async () => {
    const { service } = createSubject({
      nutrition,
      allergensPresent: [],
      possibleTraces: [],
      confidence: null,
      warnings: [],
    });

    await expect(
      service.analyzeProductLabel(
        'org-1',
        { id: 'user-1', role: 'Chef' },
        'product-1',
        undefined as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
