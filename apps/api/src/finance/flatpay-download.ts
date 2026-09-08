import { basename, extname } from 'node:path';

const SUPPORTED_REPORT_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.pdf']);
const GENERIC_DOWNLOAD_NAME = /^download(?:-\d+)?(?:\.[a-z0-9]+)?$/i;

function containsSignature(buffer: Buffer, signature: number[]) {
  if (buffer.length < signature.length) return false;
  for (let offset = 0; offset <= buffer.length - signature.length; offset += 1) {
    if (signature.every((byte, index) => buffer[offset + index] === byte)) return true;
  }
  return false;
}

/**
 * Chromium can leave a complete FlatPay workbook with a `.crdownload` suffix
 * when the portal does not close the download stream cleanly. Only recover a
 * temporary file after its container format proves that the payload is whole.
 */
export function isCompleteFlatpayDownload(buffer: Buffer, targetFileName: string) {
  const extension = extname(targetFileName).toLowerCase();
  if (!buffer.length) return false;
  if (extension === '.xlsx') {
    const zipHeader =
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (!zipHeader) return false;
    const footerWindow = buffer.subarray(Math.max(0, buffer.length - 65_557));
    return containsSignature(footerWindow, [0x50, 0x4b, 0x05, 0x06]);
  }
  if (extension === '.xls') {
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (extension === '.pdf') {
    return (
      buffer.subarray(0, 5).toString('ascii') === '%PDF-' &&
      buffer.subarray(-1_024).includes(Buffer.from('%%EOF'))
    );
  }
  if (extension === '.csv') {
    return !buffer.includes(0) && /[\r\n]/.test(buffer.toString('utf8'));
  }
  return false;
}

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

/**
 * Le centre de téléchargements affiche une borne de début exclusive. Un
 * rapport « 27 to 28 » couvre donc la journée du 28. Réconcilier ces titres
 * avec l'état évite de redemander un export déjà téléchargé et importé.
 */
export function resolveFlatpayDownloadedReportKey(reportName: string) {
  const match = reportName.match(
    /^(Orders|Sales Overview) Report\s*-\s*(20\d{2}-\d{2}-\d{2})\s+to\s+(20\d{2}-\d{2}-\d{2})$/i,
  );
  if (!match) return null;
  const start = new Date(`${match[2]}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const from = start.toISOString().slice(0, 10);
  const type = match[1].toLowerCase().startsWith('orders') ? 'orders' : 'sales-overview';
  return `${type}:${from}:${match[3]}`;
}
