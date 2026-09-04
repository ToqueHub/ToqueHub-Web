import { FinanceProvider } from '@prisma/client';
import {
  deduplicateCrossSourceSales,
  isTechnicalProductLabel,
  resolveContributingSalesSourceIds,
} from './finance-sales-dedupe';

const saleDate = new Date('2026-08-04T10:30:00.000Z');
const shared = {
  saleDate,
  grossAmount: 24,
  transactionCount: 1,
  paymentMethod: 'Card',
  metadata: { receiptNumber: '3-100' },
};

describe('deduplicateCrossSourceSales', () => {
  it('fusionne les copies API et fichier du même ticket sur le même site', () => {
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        sourceId: 'loyverse-file',
        source: {
          provider: FinanceProvider.LOYVERSE,
          siteId: 'site-a',
          isPrimaryPos: false,
        },
      },
      {
        ...shared,
        sourceId: 'loyverse-api',
        source: {
          provider: FinanceProvider.LOYVERSE,
          siteId: 'site-a',
          isPrimaryPos: true,
        },
      },
    ]);

    expect(result.duplicateCandidates).toBe(1);
    expect(result.rows).toEqual([expect.objectContaining({ sourceId: 'loyverse-api' })]);
  });

  it('fusionne deux fournisseurs lorsque leurs séries de tickets se correspondent', () => {
    const result = deduplicateCrossSourceSales([
      ...[0, 1, 2].flatMap((index) => [
        {
          ...shared,
          saleDate: new Date(saleDate.getTime() + index * 60_000),
          grossAmount: index === 2 ? -5 : 20 + index,
          netAmount: 17 + index,
          vatAmount: 3,
          transactionCount: index === 2 ? 0 : 1,
          metadata: { receiptNumber: `loyverse-${index}` },
          sourceId: 'loyverse',
          source: { provider: FinanceProvider.LOYVERSE, siteId: 'site-a' },
        },
        {
          ...shared,
          saleDate: new Date(saleDate.getTime() + index * 60_000 + 3 * 3_600_000 + 4_000),
          grossAmount: index === 2 ? -5 : 20 + index,
          transactionCount: index === 2 ? 0 : 1,
          metadata: { receiptNumber: `paypal-${index}` },
          sourceId: 'paypal',
          source: { provider: FinanceProvider.PAYPAL_POS, siteId: 'site-a' },
        },
      ]),
    ]);

    expect(result.duplicateCandidates).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every(({ sourceId }) => sourceId === 'loyverse')).toBe(true);
  });

  it('conserve une opération isolée provenant d’un autre fournisseur', () => {
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        sourceId: 'loyverse',
        source: { provider: FinanceProvider.LOYVERSE, siteId: 'site-a' },
      },
      {
        ...shared,
        saleDate: new Date(saleDate.getTime() + 4 * 60_000),
        grossAmount: 50,
        paymentMethod: 'Gift card',
        sourceId: 'paypal',
        source: { provider: FinanceProvider.PAYPAL_POS, siteId: 'site-a' },
      },
    ]);

    expect(result.duplicateCandidates).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it('ne retire pas une simple coïncidence entre deux caisses indépendantes', () => {
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        sourceId: 'loyverse',
        source: { provider: FinanceProvider.LOYVERSE, siteId: 'site-a' },
      },
      {
        ...shared,
        sourceId: 'paypal',
        source: { provider: FinanceProvider.PAYPAL_POS, siteId: 'site-a' },
      },
    ]);

    expect(result.duplicateCandidates).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it('ne confond pas une ligne produit avec un ticket de caisse', () => {
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        transactionCount: 0,
        isRevenueRecord: false,
        sourceId: 'loyverse',
        source: { provider: FinanceProvider.LOYVERSE, siteId: 'site-a' },
      },
      {
        ...shared,
        transactionCount: 0,
        isRevenueRecord: false,
        sourceId: 'paypal',
        source: { provider: FinanceProvider.PAYPAL_POS, siteId: 'site-a' },
      },
    ]);

    expect(result.duplicateCandidates).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it('conserve le même numéro de ticket lorsqu’il vient de deux sites distincts', () => {
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        sourceId: 'flatpay-site-a',
        source: { provider: FinanceProvider.FLATPAY, siteId: 'site-a' },
      },
      {
        ...shared,
        sourceId: 'flatpay-oulu',
        source: { provider: FinanceProvider.FLATPAY, siteId: 'oulu' },
      },
    ]);

    expect(result.duplicateCandidates).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it('ne fusionne pas deux tickets similaires au sein de la même source', () => {
    const withoutReceipt = { ...shared, metadata: {} };
    const result = deduplicateCrossSourceSales([
      { ...withoutReceipt, sourceId: 'flatpay-site-a' },
      { ...withoutReceipt, sourceId: 'flatpay-site-a' },
    ]);

    expect(result.duplicateCandidates).toBe(0);
    expect(result.rows).toHaveLength(2);
  });
});

describe('isTechnicalProductLabel', () => {
  it.each(['34441', '# 34441', '3-7848', 'Ticket 34441', 'transaction:ab12-90'])(
    'reconnaît %s comme une référence technique',
    (label) => expect(isTechnicalProductLabel(label)).toBe(true),
  );

  it('reconnaît un identifiant exact fourni par la source', () => {
    expect(isTechnicalProductLabel('ABCD-9087', ['ABCD-9087'])).toBe(true);
  });

  it.each(['Cappuccino', '7Up', 'Croque Monsieur 3 fromages'])(
    'conserve %s comme un vrai produit',
    (label) => expect(isTechnicalProductLabel(label)).toBe(false),
  );
});

describe('resolveContributingSalesSourceIds', () => {
  it("inclut les copies techniques d'une caisse active sur le même établissement", () => {
    expect(
      resolveContributingSalesSourceIds([
        {
          id: 'flatpay-historique',
          provider: FinanceProvider.FLATPAY,
          siteId: 'kuusamo',
          isPrimarySales: true,
          isPrimaryPos: true,
        },
        {
          id: 'flatpay-renomme',
          provider: FinanceProvider.FLATPAY,
          siteId: 'kuusamo',
          isPrimarySales: false,
          isPrimaryPos: false,
        },
        {
          id: 'paypal-inactif',
          provider: FinanceProvider.PAYPAL_POS,
          siteId: 'kuusamo',
          isPrimarySales: false,
          isPrimaryPos: false,
        },
      ]),
    ).toEqual(['flatpay-historique', 'flatpay-renomme']);
  });

  it('conserve séparément les comptes du même fournisseur rattachés à deux sites', () => {
    expect(
      resolveContributingSalesSourceIds([
        {
          id: 'flatpay-kuusamo',
          provider: FinanceProvider.FLATPAY,
          siteId: 'kuusamo',
          isPrimarySales: true,
        },
        {
          id: 'flatpay-oulu',
          provider: FinanceProvider.FLATPAY,
          siteId: 'oulu',
          isPrimarySales: true,
        },
      ]),
    ).toEqual(['flatpay-kuusamo', 'flatpay-oulu']);
  });
});
