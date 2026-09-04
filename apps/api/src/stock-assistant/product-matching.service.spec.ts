import { ProductMatchingService } from './product-matching.service';

const products = [
  { id: 'p-cafe', name: 'Juhla Mocca coffee 500g filter ground', sku: 'CAF-1', gtin: '1234567890123', unitId: 'u-pc', unit: { symbol: 'pc' }, isArchived: false },
  { id: 'p-lait', name: 'Arla Cafe Maito 1L laktoositon UHT', sku: 'MILK-1', gtin: null, unitId: 'u-l', unit: { symbol: 'L' }, isArchived: false },
];

function createService(aliases: any[] = []) {
  const prisma: any = {
    productAlias: { findMany: jest.fn(async () => aliases) },
    product: { findMany: jest.fn(async () => products) },
  };
  return { prisma, service: new ProductMatchingService(prisma) };
}

describe('ProductMatchingService', () => {
  it('matches supplier SKU before fuzzy names', async () => {
    const { service } = createService();
    const match = await service.match('org-1', 'unknown label', null, 'CAF-1');

    expect(match.productId).toBe('p-cafe');
    expect(match.status).toBe('MATCHED');
  });

  it('uses global aliases when no supplier is provided', async () => {
    const { service } = createService([{ productId: 'p-cafe', supplierId: null }]);
    const match = await service.match('org-1', 'café');

    expect(match.productId).toBe('p-cafe');
    expect(match.confidence).toBe(1);
  });

  it('returns candidates instead of hard failing on ambiguous labels', async () => {
    const { service } = createService();
    const match = await service.match('org-1', 'cafe');

    expect(match.productId).toBeTruthy();
    expect(match.candidates.length).toBeGreaterThan(0);
  });
});
