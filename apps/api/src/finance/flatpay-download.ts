import { basename, extname } from 'node:path';

const SUPPORTED_REPORT_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.pdf']);
const GENERIC_DOWNLOAD_NAME = /^download(?:-\d+)?(?:\.[a-z0-9]+)?$/i;

function safeReportStem(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

/**
 * FlatPay sometimes returns Sales Overview exports as a bare `download` file.
 * Keep meaningful server filenames, but derive generic or extensionless names
 * from the report title so the finance importer can classify the workbook.
 */
export function resolveFlatpayDownloadFileName(suggestedName: string, reportName: string) {
  const suggested = basename(suggestedName.trim()) || 'download';
  const suggestedExtension = extname(suggested).toLowerCase();
  const hasSupportedExtension = SUPPORTED_REPORT_EXTENSIONS.has(suggestedExtension);
  const needsReportName = GENERIC_DOWNLOAD_NAME.test(suggested) || !hasSupportedExtension;

  if (!needsReportName) return suggested;

  const reportStem = safeReportStem(reportName) || safeReportStem(suggested) || 'FlatPay_Report';
  return `${reportStem}${hasSupportedExtension ? suggestedExtension : '.xlsx'}`;
}
