import { classifyFinanceFile } from './finance.service';
import { resolveFlatpayDownloadFileName } from './flatpay-download';

describe('FlatPay report download names', () => {
  it('turns a generic Sales Overview download into a classifiable workbook name', () => {
    const fileName = resolveFlatpayDownloadFileName(
      'download',
      'Sales Overview Report - 2026-08-27 to 2026-08-28',
    );

    expect(fileName).toBe('Sales_Overview_Report_2026_08_27_to_2026_08_28.xlsx');
    expect(classifyFinanceFile(fileName)).toMatchObject({
      provider: 'FLATPAY',
      reportKind: 'PRODUCT_SALES',
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
