import { FinanceAccountCategory, FinanceProvider, FinanceReportKind } from '@prisma/client';
import { classifyFinanceFile, shouldIncludeSalesSourceByDefault } from './finance.service';
import {
  flattenFennoaBudgetRows,
  buildFennoaSyncRanges,
  inferFinanceAccountCategory,
  normalizeFennoaLedgerRow,
  normalizeFennoaLockingPeriods,
  normalizeFennoaPeriod,
  shouldRunFullFennoaSync,
} from './fennoa-sync.service';
import { normalizeFennoaBaseUrl, unwrapFennoaData } from './fennoa-client.service';
import { resolveFinancePeriod, selectFinanceRevenue } from './finance-analytics.service';
import { FinanceImportParserService } from './finance-import-parser.service';
import {
  flatpayPeriodFromFileName,
  flatpayProductPeriodFromFileName,
} from './finance-import-parser.service';
import ExcelJS from 'exceljs';
import {
  completeDailySalesSeries,
  selectNonOverlappingBatches,
} from './finance-sales-insights.service';
import { deduplicateCrossSourceSales } from './finance-sales-dedupe';

describe('classifyFinanceFile', () => {
  it.each([
    [
      'OrdersReport_2026-07-24-2026-07-31.xlsx',
      FinanceProvider.FLATPAY,
      FinanceReportKind.SALES_ORDERS,
    ],
    [
      'Salesoverviewreport_Café Démo Oy.xlsx',
      FinanceProvider.FLATPAY,
      FinanceReportKind.PRODUCT_SALES,
    ],
    [
      'pos-report-EOD-988a9320f02d1af8.pdf',
      FinanceProvider.FLATPAY,
      FinanceReportKind.DAILY_CLOSURE,
    ],
    [
      'TurnoverReport_2026-06-01-2026-06-30.pdf',
      FinanceProvider.FLATPAY,
      FinanceReportKind.DAILY_CLOSURE,
    ],
    [
      'Transaction_report_2026-06-01-2026-06-30.xlsx',
      FinanceProvider.FLATPAY,
      FinanceReportKind.RECEIPTS,
    ],
    [
      'CardTransactionsReport_2026-08-01-2026-08-01.xlsx',
      FinanceProvider.FLATPAY,
      FinanceReportKind.RECEIPTS,
    ],
    [
      'CashManagementReport_2026-06-01-2026-06-30.pdf',
      FinanceProvider.FLATPAY,
      FinanceReportKind.DAILY_CLOSURE,
    ],
    [
      'Tuotemyyntiraportti_Café Démo Oy_2026-05-31-2026-06-30.xlsx',
      FinanceProvider.FLATPAY,
      FinanceReportKind.PRODUCT_SALES,
    ],
    [
      'Käteishallintaraportti_2026-06-01-2026-06-30.pdf',
      FinanceProvider.FLATPAY,
      FinanceReportKind.DAILY_CLOSURE,
    ],
    [
      'Liikevaihtoraportti_2026-06-01-2026-06-30.pdf',
      FinanceProvider.FLATPAY,
      FinanceReportKind.DAILY_CLOSURE,
    ],
    ['Archive Loysverse.csv', FinanceProvider.LOYVERSE, FinanceReportKind.RECEIPTS],
    ['PayPal-POS-Receipts-Report.xlsx', FinanceProvider.PAYPAL_POS, FinanceReportKind.RECEIPTS],
    ['Fennoa-accounting-export.xlsx', FinanceProvider.FENNOA, FinanceReportKind.ACCOUNTING],
    ['budget-2027.csv', FinanceProvider.GENERIC, FinanceReportKind.BUDGET],
  ])('classe %s', (fileName, provider, reportKind) => {
    expect(classifyFinanceFile(fileName)).toEqual({ provider, reportKind });
  });
});

describe('consolidation multi-caisses', () => {
  it.each([
    [FinanceProvider.FLATPAY, FinanceReportKind.SALES_ORDERS, true],
    [FinanceProvider.FLATPAY, FinanceReportKind.PRODUCT_SALES, false],
    [FinanceProvider.FLATPAY, FinanceReportKind.RECEIPTS, false],
    [FinanceProvider.PAYPAL_POS, FinanceReportKind.RECEIPTS, true],
    [FinanceProvider.LOYVERSE, FinanceReportKind.RECEIPTS, true],
    [FinanceProvider.GENERIC, FinanceReportKind.RECEIPTS, false],
  ])('détermine si %s / %s contribue au CA', (provider, reportKind, expected) => {
    expect(shouldIncludeSalesSourceByDefault(provider, reportKind, 1)).toBe(expected);
  });

  it('n’active jamais une source sans ligne de vente', () => {
    expect(
      shouldIncludeSalesSourceByDefault(FinanceProvider.FLATPAY, FinanceReportKind.SALES_ORDERS, 0),
    ).toBe(false);
  });

  it('additionne deux fournisseurs distincts même si leurs tickets se ressemblent', () => {
    const saleDate = new Date('2026-08-03T12:34:56.000Z');
    const shared = { saleDate, grossAmount: 12.5, transactionCount: 1, paymentMethod: 'Card' };
    const result = deduplicateCrossSourceSales([
      {
        ...shared,
        sourceId: 'paypal',
        source: { provider: FinanceProvider.PAYPAL_POS, siteId: 'site-a', isPrimaryPos: false },
      },
      {
        ...shared,
        sourceId: 'flatpay',
        source: { provider: FinanceProvider.FLATPAY, siteId: 'site-a', isPrimaryPos: true },
      },
    ]);
    expect(result.duplicateCandidates).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it('ne fusionne jamais deux tickets similaires issus de la même caisse', () => {
    const saleDate = new Date('2026-08-03T12:34:56.000Z');
    const result = deduplicateCrossSourceSales([
      { saleDate, grossAmount: 10, transactionCount: 1, sourceId: 'flatpay' },
      { saleDate, grossAmount: 10, transactionCount: 1, sourceId: 'flatpay' },
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.duplicateCandidates).toBe(0);
  });
});

describe('priorité caisse / comptabilité', () => {
  const openPeriod = {
    cashRegisterRevenue: 72_179.81,
    accountingRevenue: 789.62,
    hasCashRegisterData: true,
    hasAccountingData: true,
    periodEnd: new Date('2026-07-31T23:59:59.999Z'),
    accountingLockedThrough: new Date('2026-06-30T00:00:00.000Z'),
  };

  it('retient toutes les caisses tant que la période est ouverte', () => {
    expect(selectFinanceRevenue(openPeriod)).toEqual({
      value: 72_179.81,
      basis: 'cash_register',
    });
  });

  it('retient Fennoa lorsque la période est clôturée', () => {
    expect(
      selectFinanceRevenue({
        ...openPeriod,
        accountingLockedThrough: new Date('2026-07-31T00:00:00.000Z'),
      }),
    ).toEqual({ value: 789.62, basis: 'accounting' });
  });

  it('utilise Fennoa comme repli si aucun rapport de caisse ne couvre la période', () => {
    expect(
      selectFinanceRevenue({
        ...openPeriod,
        hasCashRegisterData: false,
        cashRegisterRevenue: 0,
      }),
    ).toEqual({ value: 789.62, basis: 'accounting' });
  });

  it('signale une période sans donnée exploitable', () => {
    expect(
      selectFinanceRevenue({
        ...openPeriod,
        hasCashRegisterData: false,
        hasAccountingData: false,
      }),
    ).toEqual({ value: null, basis: 'unavailable' });
  });
});

describe('rattrapage historique Fennoa', () => {
  const periods = [
    { externalId: 1, startDate: new Date('2022-12-20'), endDate: new Date('2024-05-31') },
    { externalId: 2, startDate: new Date('2024-06-01'), endDate: new Date('2025-05-31') },
    { externalId: 3, startDate: new Date('2025-06-01'), endDate: new Date('2026-05-31') },
    { externalId: 4, startDate: new Date('2026-06-01'), endDate: new Date('2027-05-31') },
  ];
  const now = new Date('2026-08-03T20:00:00.000Z');

  it('déclenche automatiquement un historique complet à la première synchronisation', () => {
    expect(
      shouldRunFullFennoaSync({
        hasSuccessfulFullSync: false,
      }),
    ).toBe(true);
  });

  it('reste incrémental après un premier historique complet réussi', () => {
    expect(
      shouldRunFullFennoaSync({
        hasSuccessfulFullSync: true,
      }),
    ).toBe(false);
  });

  it('respecte une période manuelle sans imposer un historique complet', () => {
    expect(
      shouldRunFullFennoaSync({
        requestedFrom: '2025-06-01',
        requestedTo: '2026-05-31',
        hasSuccessfulFullSync: false,
      }),
    ).toBe(false);
  });

  it('planifie tous les exercices Fennoa lors du rattrapage', () => {
    const ranges = buildFennoaSyncRanges(periods, { now, full: true });
    expect(ranges).toHaveLength(4);
    expect(ranges[0]).toMatchObject({
      externalId: 1,
      from: new Date('2022-12-20'),
      to: new Date('2024-05-31'),
    });
    expect(ranges[3]).toMatchObject({
      externalId: 4,
      from: new Date('2026-06-01'),
      to: now,
    });
  });

  it('limite une synchronisation ordinaire à l’exercice courant', () => {
    expect(buildFennoaSyncRanges(periods, { now, full: false })).toEqual([
      {
        externalId: 4,
        from: new Date('2026-06-01'),
        to: now,
      },
    ]);
  });

  it('découpe une plage manuelle à la frontière des exercices', () => {
    expect(
      buildFennoaSyncRanges(periods, {
        now,
        full: false,
        from: new Date('2025-05-01'),
        to: new Date('2025-07-01'),
      }),
    ).toEqual([
      {
        externalId: 2,
        from: new Date('2025-05-01'),
        to: new Date('2025-05-31'),
      },
      {
        externalId: 3,
        from: new Date('2025-06-01'),
        to: new Date('2025-07-01'),
      },
    ]);
  });
});

describe('périodes des rapports Flatpay', () => {
  it('conserve chaque date de la période même lorsqu’un jour ne contient aucune vente', () => {
    expect(
      completeDailySalesSeries(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-04T23:59:59.999Z'),
        [{ date: '2026-08-03', revenue: 2459, transactions: 92 }],
      ),
    ).toEqual([
      { date: '2026-08-01', revenue: 0, transactions: 0 },
      { date: '2026-08-02', revenue: 0, transactions: 0 },
      { date: '2026-08-03', revenue: 2459, transactions: 92 },
      { date: '2026-08-04', revenue: 0, transactions: 0 },
    ]);
  });

  it('lit la période dans le nom produit par le centre de téléchargements', () => {
    const period = flatpayPeriodFromFileName('OrdersReport_2026-07-31-2026-08-03.xlsx');
    expect(period?.startDate.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    expect(period?.endDate.toISOString()).toBe('2026-08-03T23:59:59.999Z');
  });

  it('corrige le jour de départ des Sales Overview Flatpay', () => {
    const period = flatpayProductPeriodFromFileName(
      'Salesoverviewreport_Cafe_2026-06-30-2026-07-07.xlsx',
    );
    expect(period?.startDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(period?.endDate.toISOString()).toBe('2026-07-07T23:59:59.999Z');
  });

  it('importe les colonnes produit lorsque Flatpay exporte les libellés en finnois', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tuotemyynti');
    sheet.addRow([
      'Tuotteen nimi',
      'Kategorian nimi',
      'Myynti',
      'Yhteensä ilman ALV (EUR)',
      'ALV (EUR)',
      'Yhteensä (EUR)',
    ]);
    sheet.addRow(['Croissant', 'Leivonnaiset', 3, 12, 1.68, 13.68]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await new FinanceImportParserService().parse(
      'Tuotemyyntiraportti_2026-06-01-2026-06-30.xlsx',
      buffer,
      FinanceProvider.FLATPAY,
      FinanceReportKind.PRODUCT_SALES,
    );
    expect(parsed.ready).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      productCategory: 'Leivonnaiset',
      isRevenueRecord: false,
    });
    expect(parsed.grossTotal).toBe(13.68);
  });

  it('reconnaît un rapport Flatpay selon ses colonnes même si son nom est générique', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Export');
    sheet.addRow([
      'Date of Sale',
      'Order No.',
      'Staff',
      'Payment Type',
      'Status',
      'Gross Amount (EUR)',
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(
      new FinanceImportParserService().detect('export.xlsx', buffer, {
        provider: FinanceProvider.GENERIC,
        reportKind: FinanceReportKind.UNKNOWN,
      }),
    ).resolves.toEqual({
      provider: FinanceProvider.FLATPAY,
      reportKind: FinanceReportKind.SALES_ORDERS,
    });
  });

  it('exclut les lignes Total et conserve quantité, remise et code-barres des produits', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow([
      'Product Name',
      'Category Name',
      'Barcode',
      'Sale',
      'Discount (EUR)',
      'Total excl. VAT (EUR)',
      'VAT (EUR)',
      'Total (EUR)',
    ]);
    sheet.addRow(['Café', 'Boissons', '123', 4, 2, 16, 2.24, 18.24]);
    sheet.addRow(['Total', '', '', 4, 2, 16, 2.24, 18.24]);
    sheet.addRow(['Jakso:', '', '', 0, 0, 0, 0, 0]);
    sheet.addRow([
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-04T00:00:00.000Z'),
      '',
      new Date('2026-08-01T00:00:00.000Z'),
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await new FinanceImportParserService().parse(
      'Salesoverviewreport_Cafe_2026-08-01-2026-08-03.xlsx',
      buffer,
      FinanceProvider.FLATPAY,
      FinanceReportKind.PRODUCT_SALES,
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].metadata).toEqual(
      expect.objectContaining({ product: 'Café', quantity: 4, discount: 2, barcode: '123' }),
    );
    expect(parsed.grossTotal).toBe(18.24);
  });

  it('conserve les annulations pour le contrôle sans les ajouter au chiffre d’affaires', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders');
    sheet.addRow([
      'Date of Sale',
      'Order No.',
      'Staff',
      'Payment Type',
      'Status',
      'Discount (EUR)',
      'Net Amount (EUR)',
      'VAT Rate (%)',
      'VAT Amount (EUR)',
      'Gross Amount (EUR)',
    ]);
    sheet.addRow(['2026-08-03 12:30:00', '42', 'Arthur', 'Card', 'Cancelled', 1, 9, 14, 1, 10]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await new FinanceImportParserService().parse(
      'OrdersReport_2026-08-03-2026-08-03.xlsx',
      buffer,
      FinanceProvider.FLATPAY,
      FinanceReportKind.SALES_ORDERS,
    );
    expect(parsed.rows[0]).toMatchObject({ isRevenueRecord: false, transactionCount: 0 });
    expect(parsed.rows[0].metadata).toEqual(
      expect.objectContaining({ status: 'cancelled', staff: 'Arthur', discount: 1 }),
    );
  });
});

describe('rapports produit qui se chevauchent', () => {
  const batch = (id: string, from: string, to: string, createdAt = '2026-08-04') => ({
    id,
    periodStart: new Date(from),
    periodEnd: new Date(to),
    createdAt: new Date(createdAt),
  });

  it('ne retient qu’une version d’une même période et maximise les jours sans double comptage', () => {
    const selected = selectNonOverlappingBatches([
      batch('month-old', '2026-07-01', '2026-07-31', '2026-08-01'),
      batch('month-new', '2026-07-01', '2026-07-31', '2026-08-03'),
      batch('week', '2026-07-24', '2026-07-31', '2026-08-04'),
    ]);
    expect(selected.map(({ id }) => id)).toEqual(['month-new']);
  });
});

describe('normalisation Finance', () => {
  it.each([
    ['3000', FinanceAccountCategory.REVENUE],
    ['4010', FinanceAccountCategory.MATERIAL_PURCHASES],
    ['5000', FinanceAccountCategory.PAYROLL],
    ['1910', FinanceAccountCategory.CASH],
    ['7500', FinanceAccountCategory.OTHER_OPEX],
  ])('mappe le compte %s', (code, category) => {
    expect(inferFinanceAccountCategory(code)).toBe(category);
  });

  it('déplie les enveloppes Fennoa', () => {
    expect(unwrapFennoaData({ status: true, data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(normalizeFennoaBaseUrl('https://app.fennoa.com/api/')).toBe(
      'https://app.fennoa.com/api',
    );
  });

  it('reconnaît les champs snake_case documentés par Fennoa', () => {
    expect(
      normalizeFennoaPeriod({ id: 2, start_date: '2026-06-01', end_date: '2027-05-31' }),
    ).toEqual({
      externalId: 2,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
    });

    const ledger = normalizeFennoaLedgerRow(
      {
        statement_id: 10540,
        account: '3000',
        date: '2026-08-01',
        debit: 0,
        credit: 125.5,
        opening: 10,
        closing: 135.5,
        id: 2750,
        url: '/api/sales_api/2750',
      },
      0,
      'source-1',
    );
    expect(ledger).toMatchObject({
      externalStatementId: '10540',
      accountCode: '3000',
      sourceEntityId: '2750',
      sourceUrl: '/api/sales_api/2750',
    });
    expect(ledger?.openingBalance?.toNumber()).toBe(10);
    expect(ledger?.closingBalance?.toNumber()).toBe(135.5);
  });

  it('déplie les budgets et dates de verrouillage Fennoa v1', () => {
    const rows = flattenFennoaBudgetRows([
      {
        id: 7,
        name: 'Budget principal',
        accounting_period_id: 2,
        accounts: [
          {
            account_code: '3000',
            months: [
              { month: 1, sum: 100 },
              { month: 2, sum: 200 },
            ],
          },
        ],
      },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        budgetId: 7,
        budgetName: 'Budget principal',
        accountNumber: '3000',
        month: 1,
        amount: 100,
      }),
      expect.objectContaining({
        budgetId: 7,
        budgetName: 'Budget principal',
        accountNumber: '3000',
        month: 2,
        amount: 200,
      }),
    ]);
    expect(
      normalizeFennoaLockingPeriods([
        { code: 'accounting_locked', value: '2026-07-31' },
        { code: 'sales_invoices_locked', value: '2026-07-15' },
        { code: 'purchase_invoices_locked', value: '2026-07-20' },
      ]),
    ).toEqual({
      accountingLockedAt: new Date('2026-07-31'),
      salesLockedAt: new Date('2026-07-15'),
      purchasesLockedAt: new Date('2026-07-20'),
    });
  });

  it('calcule un exercice décalé', () => {
    const period = resolveFinancePeriod(
      { preset: 'fiscal_year' },
      6,
      new Date('2026-08-03T12:00:00Z'),
    );
    expect(period.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-08-03T23:59:59.999Z');
  });
});

describe('budget mensuel Finance', () => {
  it('importe les 12 mois et les huit indicateurs sans lisser le budget annuel', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Budget mensuel');
    sheet.getCell('B3').value = 'Central';
    const monthNames = [
      'Juin',
      'Juillet',
      'Août',
      'Septembre',
      'Octobre',
      'Novembre',
      'Décembre',
      'Janvier',
      'Février',
      'Mars',
      'Avril',
      'Mai',
    ];
    monthNames.forEach((name, index) => {
      const year = index < 7 ? 2026 : 2027;
      sheet.getCell(5, index + 2).value = `${name} ${year}`;
      [6, 7, 13, 24, 26, 27, 33, 35].forEach((row) => {
        sheet.getCell(row, index + 2).value = row * 100 + index;
      });
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await new FinanceImportParserService().parse(
      'Budget_2026-2027.xlsx',
      buffer,
      FinanceProvider.GENERIC,
      FinanceReportKind.BUDGET,
    );
    expect(parsed.ready).toBe(true);
    expect(parsed.budgetPlan?.scenario).toBe('Central');
    expect(parsed.budgetPlan?.startDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(parsed.budgetPlan?.endDate.toISOString()).toBe('2027-05-31T23:59:59.999Z');
    expect(parsed.budgetPlan?.lines).toHaveLength(96);
    expect(
      parsed.budgetPlan?.lines
        .filter(({ metric }) => metric === 'revenue')
        .map(({ amount }) => amount),
    ).toEqual(Array.from({ length: 12 }, (_, index) => 600 + index));
  });
});
