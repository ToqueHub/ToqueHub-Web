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

function reportStemWithPeriod(reportName: string) {
  const dates = [...reportName.matchAll(/20\d{2}-\d{2}-\d{2}/g)];
  if (dates.length < 2) return safeReportStem(reportName);
  const label = safeReportStem(reportName.slice(0, dates[0].index));
  return `${label || 'FlatPay_Report'}_${dates[0][0]}-${dates[1][0]}`;
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

  const reportStem =
    reportStemWithPeriod(reportName) || safeReportStem(suggested) || 'FlatPay_Report';
  return `${reportStem}${hasSupportedExtension ? suggestedExtension : '.xlsx'}`;
}
