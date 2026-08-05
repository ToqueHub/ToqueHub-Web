import { FinanceProvider, FinanceReportKind } from '@prisma/client';
import { FinanceImportParserService } from './finance-import-parser.service';
import { normalizeLoyverseReceipts, normalizeZettlePurchases } from './pos-api-normalizers';

describe('POS API normalizers', () => {
  it('normalise les tickets et produits Loyverse sans compter deux fois le revenu', () => {
    const locations = normalizeLoyverseReceipts(
      [
        {
          receipt_number: '3-100',
          receipt_date: '2026-08-04T10:30:00.000Z',
          store_id: 'store-1',
          receipt_type: 'SALE',
          total_money: 24,
          total_tax: 2.87,
          payments: [{ payment_type_id: 'card' }],
          line_items: [
            {
              id: 'line-1',
              item_id: 'coffee',
              item_name: 'Cappuccino',
              quantity: 2,
              total_money: 12,
              total_tax: 1.43,
              cost: 1.2,
            },
          ],
        },
      ],
      {
        stores: new Map([['store-1', 'Café Démo']]),
        payments: new Map([['card', 'Carte']]),
        products: new Map([['coffee', { name: 'Cappuccino', category: 'Kahvi' }]]),
      },
    );

    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe('Café Démo');
    expect(locations[0].rows).toHaveLength(2);
    const transaction = locations[0].rows.find(({ isRevenueRecord }) => isRevenueRecord)!;
    const product = locations[0].rows.find(({ isRevenueRecord }) => !isRevenueRecord)!;
    expect(transaction.grossAmount).toBe(24);
    expect(transaction.transactionCount).toBe(1);
    expect(transaction.paymentMethod).toBe('Carte');
    expect(product.metadata).toMatchObject({ product: 'Cappuccino', quantity: 2 });
    expect(product.productCategory).toBe('Kahvi');
    expect(product.costAmount).toBe(2.4);
  });

  it('normalise un achat Zettle avec son établissement et sa ligne produit', () => {
    const locations = normalizeZettlePurchases(
      [
        {
          purchaseUUID1: 'purchase-1',
          timestamp: '2026-08-04T12:00:00.000Z',
          amount: 1450,
          groupedVatAmounts: { '14': 178 },
          payments: [{ type: 'CARD' }],
          products: [
            {
              id: 'row-1',
              productUuid: 'product-1',
              fromLocationUuid: 'location-1',
              name: 'Croissant',
              quantity: 2,
              unitPrice: 725,
              rowTaxableAmount: 1272,
            },
          ],
        },
      ],
      new Map([['product-1', { name: 'Croissant', category: 'Viennoiseries' }]]),
    );

    expect(locations[0].externalLocationId).toBe('location-1');
    expect(locations[0].rows).toHaveLength(2);
    expect(locations[0].rows[0]).toMatchObject({
      grossAmount: 14.5,
      netAmount: 12.72,
      transactionCount: 1,
      paymentMethod: 'CARD',
    });
    expect(locations[0].rows[1].productCategory).toBe('Viennoiseries');
  });

  it('conserve la TVA de ligne et inverse les signes lors d’un remboursement Loyverse', () => {
    const locations = normalizeLoyverseReceipts([
      {
        receipt_number: '3-101',
        receipt_date: '2026-08-04T11:30:00.000Z',
        receipt_type: 'REFUND',
        total_money: 12,
        total_tax: 0,
        line_items: [
          {
            item_name: 'Cappuccino',
            quantity: 2,
            total_money: 12,
            total_tax: 0,
            line_taxes: [{ money_amount: 1.43 }],
            cost: 1.2,
          },
        ],
      },
    ]);

    const transaction = locations[0].rows.find(({ isRevenueRecord }) => isRevenueRecord)!;
    const product = locations[0].rows.find(({ isRevenueRecord }) => !isRevenueRecord)!;
    expect(transaction).toMatchObject({ grossAmount: -12, refundAmount: 12 });
    expect(product).toMatchObject({
      grossAmount: -12,
      vatAmount: -1.43,
      netAmount: -10.57,
      costAmount: -2.4,
      refundAmount: 12,
      metadata: expect.objectContaining({ quantity: -2 }),
    });
  });
});

describe('Loyverse CSV parser', () => {
  it('conserve une ligne ticket et les lignes produit sans doubler le total importé', async () => {
    const csv = [
      'Date,Numéro du reçu,Type de reçu,Catégorie,UGS,Article,Variante,Modificateurs appliqués,Quantité,Ventes brutes,Réductions,Ventes nettes,Coût des marchandises,Marge brute,Taxes,PDV,Magasin,Nom du caissier,Nom du client,Contacts du client,Commentaire,Statut',
      '04/08/2026 10:15,3-100,Vente,Food,1001,Croissant,,,2.000,10.00,1.00,9.00,2.00,7.00,1.11,Caisse 1,Le Café,Arthur,,,,Fermé',
      '04/08/2026 10:15,3-100,Vente,Drinks,1002,Café,,,1.000,4.00,0.00,4.00,0.50,3.50,0.49,Caisse 1,Le Café,Arthur,,,,Fermé',
    ].join('\n');
    const parsed = await new FinanceImportParserService().parse(
      'Archive Loyverse.csv',
      Buffer.from(csv),
      FinanceProvider.LOYVERSE,
      FinanceReportKind.RECEIPTS,
    );

    expect(parsed.ready).toBe(true);
    expect(parsed.rows.filter(({ isRevenueRecord }) => isRevenueRecord)).toHaveLength(1);
    expect(parsed.rows.filter(({ isRevenueRecord }) => !isRevenueRecord)).toHaveLength(2);
    expect(parsed.grossTotal).toBe(13);
    expect(parsed.metadata).toMatchObject({
      parser: 'loyverse-receipts-products',
      parserVersion: 2,
      receiptCount: 1,
      productRowCount: 2,
    });
  });
});
