import { classifyFinanceFile } from './finance.service';
import {
  isCompleteFlatpayDownload,
  resolveFlatpayDownloadedReportKey,
  resolveFlatpayDownloadFileName,
} from './flatpay-download';
import { flatpayProductPeriodFromFileName } from './finance-import-parser.service';

describe('FlatPay report download names', () => {
  it('recognizes a complete Chromium workbook left with a temporary suffix', () => {
    const completeWorkbook = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('workbook payload'),
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      Buffer.alloc(18),
    ]);

    expect(isCompleteFlatpayDownload(completeWorkbook, 'OrdersReport.xlsx')).toBe(true);
    expect(isCompleteFlatpayDownload(completeWorkbook.subarray(0, -22), 'OrdersReport.xlsx')).toBe(
      false,
    );
  });

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

  it('reconciles an existing Orders download with its covered business day', () => {
    expect(resolveFlatpayDownloadedReportKey('Orders Report - 2026-08-27 to 2026-08-28')).toBe(
      'orders:2026-08-28:2026-08-28',
    );
  });

  it('reconciles an existing Sales Overview download with its covered period', () => {
    expect(
      resolveFlatpayDownloadedReportKey('Sales Overview Report - 2026-07-31 to 2026-08-28'),
    ).toBe('sales-overview:2026-08-01:2026-08-28');
  });
});
