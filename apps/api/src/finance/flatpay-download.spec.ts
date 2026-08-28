import { classifyFinanceFile } from './finance.service';
import { resolveFlatpayDownloadFileName } from './flatpay-download';
import { flatpayProductPeriodFromFileName } from './finance-import-parser.service';

describe('FlatPay report download names', () => {
  it('turns a generic Sales Overview download into a classifiable workbook name', () => {
    const fileName = resolveFlatpayDownloadFileName(
      'download',
      'Sales Overview Report - 2026-08-27 to 2026-08-28',
    );

    expect(fileName).toBe('Sales_Overview_Report_2026-08-27-2026-08-28.xlsx');
    expect(classifyFinanceFile(fileName)).toMatchObject({
      provider: 'FLATPAY',
      reportKind: 'PRODUCT_SALES',
    });
    expect(flatpayProductPeriodFromFileName(fileName)).toMatchObject({
      startDate: new Date('2026-08-28T00:00:00.000Z'),
      endDate: new Date('2026-08-28T23:59:59.999Z'),
    });
  });

  it('keeps an already meaningful supported filename', () => {
    expect(
      resolveFlatpayDownloadFileName(
        'OrdersReport_2026-08-27-2026-08-28.xlsx',
        'Orders Report - 2026-08-27 to 2026-08-28',
      ),
    ).toBe('OrdersReport_2026-08-27-2026-08-28.xlsx');
  });

  it('uses the report title for generic downloads that include an extension', () => {
    expect(
      resolveFlatpayDownloadFileName('download-2.xlsx', 'Sales Overview Report - August'),
    ).toBe('Sales_Overview_Report_August.xlsx');
  });
});
