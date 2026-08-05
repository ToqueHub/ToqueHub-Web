import { FinanceProvider } from '@prisma/client';
import { deduplicateCrossSourceSales } from './finance-sales-dedupe';

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

  it('additionne FlatPay, Loyverse et PayPal lorsqu’ils sont utilisés simultanément', () => {
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        sourceId: 'flatpay',
        source: { provider: FinanceProvider.FLATPAY, siteId: 'site-a' },
      },
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
    expect(result.rows).toHaveLength(3);
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
