import { Injectable } from '@nestjs/common';
import { FinanceAccountCategory, FinanceProvider, FinanceReportKind, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

type ParsedSale = {
  externalKey: string;
  saleDate: Date;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  refundAmount: Prisma.Decimal;
  costAmount?: Prisma.Decimal;
  transactionCount: number;
  paymentMethod?: string;
  productCategory?: string;
  isRevenueRecord: boolean;
  metadata?: Prisma.InputJsonValue;
};

export type ParsedFinanceImport = {
  ready: boolean;
  rows: ParsedSale[];
  periodStart: Date | null;
  periodEnd: Date | null;
  grossTotal: number | null;
  netTotal: number | null;
  vatTotal: number | null;
  warnings: string[];
  metadata: Prisma.InputJsonObject;
  budgetPlan?: ParsedBudgetPlan;
  accountingDocument?: ParsedAccountingDocument;
};

export type ParsedAccountingLine = {
  code: string | null;
  label: string;
  category: FinanceAccountCategory;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  includeInLedger: boolean;
};

export type ParsedAccountingDocument = {
  language: 'fr' | 'en' | 'fi' | 'other';
  documentType:
    | 'income_statement'
    | 'trial_balance'
    | 'general_ledger'
    | 'annual_accounts'
    | 'balance_sheet'
    | 'unknown';
  companyName: string | null;
  businessId: string | null;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  unitMultiplier: number;
  confidence: number;
  lines: ParsedAccountingLine[];
  pageCount: number | null;
  ocrMarkdown?: string;
  warnings: string[];
};

export type ParsedBudgetPlan = {
  name: string;
  scenario: string | null;
  currency: string;
  startDate: Date;
  endDate: Date;
  lines: Array<{
    metric: string;
    label: string;
    periodStart: Date;
    amount: number;
  }>;
};

function value(cell: ExcelJS.Cell) {
  const raw = cell.value;
  if (raw && typeof raw === 'object' && 'result' in raw) return raw.result;
  if (raw && typeof raw === 'object' && 'text' in raw) return raw.text;
  return raw;
}

function normalized(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function canonicalLabel(value: unknown) {
  return normalized(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isSummaryProduct(value: string) {
  const label = canonicalLabel(value);
  return ['total', 'yhteensa', 'subtotal', 'soustotal', 'grandtotal', 'jakso', 'period'].includes(
    label,
  );
}

function amount(value: unknown) {
  if (value instanceof Date) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  const negative = /^\(.*\)$/.test(raw) || /-$/.test(raw);
  let cleaned = raw.replace(/[^0-9,.-]/g, '').replace(/-$/, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    cleaned = cleaned.replace(thousands, '').replace(decimal, '.');
  } else if (lastComma >= 0) {
    const decimalDigits = cleaned.length - lastComma - 1;
    cleaned =
      decimalDigits > 0 && decimalDigits <= 2
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimalDigits = cleaned.length - lastDot - 1;
    if (decimalDigits > 2) cleaned = cleaned.replace(/\./g, '');
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : 0;
}

function accountingCategory(labelValue: unknown, codeValue?: unknown) {
  const label = canonicalLabel(labelValue);
  const code = String(codeValue ?? '').replace(/\D/g, '');
  const number = Number(code);
  if (
    /chiffredaffaires|ventes|produitsdexploitation|revenue|turnover|sales|liikevaihto|myynti/.test(
      label,
    ) ||
    (number >= 3000 && number <= 3999)
  )
    return FinanceAccountCategory.REVENUE;
  if (
    /achats|matieres|marchandises|material|purchases|costofgoods|aineet|tarvikkeet|ostot/.test(
      label,
    ) ||
    (number >= 4000 && number <= 4999)
  )
    return FinanceAccountCategory.MATERIAL_PURCHASES;
  if (
    /massesalariale|personnel|salaires|wages|salaries|payroll|henkilosto|palkat|sosiaalikulut/.test(
      label,
    ) ||
    (number >= 5000 && number <= 5999)
  )
    return FinanceAccountCategory.PAYROLL;
  if (
    /tresorerie|banque|caisse|cash|bank|rahat|pankki|kassa/.test(label) ||
    (number >= 1900 && number <= 1999)
  )
    return FinanceAccountCategory.CASH;
  if (/impot|tax|vero/.test(label)) return FinanceAccountCategory.TAX;
  if (/financ|interest|rahoitus|korko/.test(label)) return FinanceAccountCategory.FINANCIAL;
  if (number >= 8000 && number <= 8999) return FinanceAccountCategory.FINANCIAL;
  if (number >= 9000 && number <= 9999) return FinanceAccountCategory.TAX;
  if (
    /charges|loyer|energie|marketing|assurance|maintenance|operatingexpenses|operatingcosts|otheroperating|opex|liiketoiminnankulut|liiketoiminnanmuutkulut|vuokra|energia/.test(
      label,
    ) ||
    (number >= 6000 && number <= 7999)
  )
    return FinanceAccountCategory.OTHER_OPEX;
  return FinanceAccountCategory.OTHER;
}

function accountingLanguage(values: unknown[]) {
  const text = canonicalLabel(values.join(' '));
  if (/tuloslaskelma|liikevaihto|tilikausi|henkilosto|tase/.test(text)) return 'fi' as const;
  if (/incomestatement|profitandloss|financialyear|turnover|payroll/.test(text))
    return 'en' as const;
  if (/compteresultat|exercicecomptable|chiffredaffaires|massesalariale/.test(text))
    return 'fr' as const;
  return 'other' as const;
}

function accountingPeriod(fileName: string, values: unknown[]) {
  const text = `${fileName} ${values.map((item) => String(item ?? '')).join(' ')}`;
  const isoRange = text.match(
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2}).{0,40}?(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/s,
  );
  if (isoRange) {
    return {
      start: new Date(Date.UTC(Number(isoRange[1]), Number(isoRange[2]) - 1, Number(isoRange[3]))),
      end: new Date(
        Date.UTC(
          Number(isoRange[4]),
          Number(isoRange[5]) - 1,
          Number(isoRange[6]),
          23,
          59,
          59,
          999,
        ),
      ),
    };
  }
  const years = [...text.matchAll(/20\d{2}/g)].map((match) => Number(match[0]));
  if (!years.length) return { start: null, end: null };
  const first = years[0];
  const last = years.length > 1 ? years[1] : first;
  return {
    start: new Date(Date.UTC(first, 0, 1)),
    end: new Date(Date.UTC(last, 11, 31, 23, 59, 59, 999)),
  };
}

function date(value: unknown, dayFirst = false) {
  if (value instanceof Date) return value;
  const raw = String(value ?? '').trim();
  if (dayFirst) {
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (match)
      return new Date(
        Date.UTC(
          Number(match[3]),
          Number(match[2]) - 1,
          Number(match[1]),
          Number(match[4] ?? 0),
          Number(match[5] ?? 0),
        ),
      );
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sha(parts: unknown[]) {
  return createHash('sha256')
    .update(parts.map((item) => String(item ?? '')).join('|'))
    .digest('hex');
}

export function flatpayPeriodFromFileName(fileName: string) {
  const match = fileName.match(/(20\d{2}-\d{2}-\d{2})-(20\d{2}-\d{2}-\d{2})/);
  if (!match) return null;
  const startDate = new Date(`${match[1]}T00:00:00.000Z`);
  const endDate = new Date(`${match[2]}T23:59:59.999Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return null;
  }
  return { startDate, endDate };
}

export function flatpayProductPeriodFromFileName(fileName: string) {
  const period = flatpayPeriodFromFileName(fileName);
  if (!period) return null;
  const correctedStart = new Date(period.startDate.getTime() + 86_400_000);
  return {
    startDate: correctedStart <= period.endDate ? correctedStart : period.startDate,
    endDate: period.endDate,
  };
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function openXmlCells(xml: string, sharedStrings: string[]) {
  const cells = new Map<string, string | number>();
  const cellPattern = /<(?:\w+:)?c\b([^>]*)\br="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(xml))) {
    const attributes = `${match[1]} ${match[3]}`;
    const body = match[4];
    const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? '';
    const raw = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1] ?? '';
    if (type === 's') cells.set(match[2], sharedStrings[Number(raw)] ?? '');
    else if (type === 'str' || type === 'inlineStr') {
      const inline = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/.exec(body)?.[1];
      cells.set(match[2], decodeXml(inline ?? raw));
    } else if (raw !== '') {
      const parsed = Number(raw);
      cells.set(match[2], Number.isFinite(parsed) ? parsed : decodeXml(raw));
    }
  }
  return cells;
}

function openXmlRows(cells: Map<string, string | number>) {
  const rows = new Map<number, Map<number, string | number>>();
  const columnNumber = (letters: string) =>
    [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  for (const [reference, cellValue] of cells) {
    const match = reference.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;
    const rowNumber = Number(match[2]);
    const row = rows.get(rowNumber) ?? new Map<number, string | number>();
    row.set(columnNumber(match[1]), cellValue);
    rows.set(rowNumber, row);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => {
      const width = Math.max(...row.keys(), 0);
      return Array.from({ length: width }, (_, index) => row.get(index + 1) ?? null);
    });
}

function frenchMonth(value: unknown) {
  const raw = normalized(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const months: Record<string, number> = {
    janvier: 0,
    january: 0,
    fevrier: 1,
    february: 1,
    mars: 2,
    march: 2,
    avril: 3,
    april: 3,
    mai: 4,
    may: 4,
    juin: 5,
    june: 5,
    juillet: 6,
    july: 6,
    aout: 7,
    august: 7,
    septembre: 8,
    september: 8,
    octobre: 9,
    october: 9,
    novembre: 10,
    november: 10,
    decembre: 11,
    december: 11,
  };
  const found = Object.entries(months).find(([name]) => raw.includes(name));
  const year = Number(raw.match(/20\d{2}/)?.[0]);
  return found && year ? new Date(Date.UTC(year, found[1], 1)) : null;
}

function summary(
  rows: ParsedSale[],
  metadata: Prisma.InputJsonObject,
  warnings: string[] = [],
): ParsedFinanceImport {
  const dates = rows.map(({ saleDate }) => saleDate).sort((a, b) => a.getTime() - b.getTime());
  const revenueRows = rows.some(({ isRevenueRecord }) => isRevenueRecord)
    ? rows.filter(({ isRevenueRecord }) => isRevenueRecord)
    : rows;
  return {
    ready: rows.length > 0,
    rows,
    periodStart: dates[0] ?? null,
    periodEnd: dates.at(-1) ?? null,
    grossTotal: revenueRows.length
      ? revenueRows.reduce((sum, row) => sum + Number(row.grossAmount), 0)
      : null,
    netTotal: revenueRows.length
      ? revenueRows.reduce((sum, row) => sum + Number(row.netAmount), 0)
      : null,
    vatTotal: revenueRows.length
      ? revenueRows.reduce((sum, row) => sum + Number(row.vatAmount), 0)
      : null,
    warnings,
    metadata,
  };
}

function csvRows(buffer: Buffer) {
  const input = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    ([',', ';', '\t'] as const)
      .map((candidate) => ({
        candidate,
        count: firstLine.split(candidate).length - 1,
      }))
      .sort((left, right) => right.count - left.count)[0]?.candidate ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((item) => item.length)) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

@Injectable()
export class FinanceImportParserService {
  async detect(
    fileName: string,
    buffer: Buffer,
    fallback: { provider: FinanceProvider; reportKind: FinanceReportKind },
  ) {
    const extension = extname(fileName).toLowerCase();
    if (extension === '.csv') {
      const header = canonicalLabel(buffer.toString('utf8').split(/\r?\n/, 1)[0]);
      if (header.includes('numerodurecu') || header.includes('receipt')) {
        return { provider: FinanceProvider.LOYVERSE, reportKind: FinanceReportKind.RECEIPTS };
      }
      return fallback;
    }
    if (extension !== '.xlsx') return fallback;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      if (workbook.worksheets.some(({ name }) => canonicalLabel(name) === 'budgetmensuel')) {
        return { provider: FinanceProvider.GENERIC, reportKind: FinanceReportKind.BUDGET };
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) return fallback;
      const headers = [...this.headers(sheet, 1).keys()].map(canonicalLabel);
      const has = (...labels: string[]) => labels.every((label) => headers.includes(label));
      if (has('dateofsale', 'orderno', 'grossamounteur')) {
        return { provider: FinanceProvider.FLATPAY, reportKind: FinanceReportKind.SALES_ORDERS };
      }
      if (
        has('productname', 'categoryname', 'sale', 'totaleur') ||
        has('tuotteennimi', 'kategorianimi', 'myynti', 'yhteensaeur')
      ) {
        return { provider: FinanceProvider.FLATPAY, reportKind: FinanceReportKind.PRODUCT_SALES };
      }
      const normalizedHeaders = [...this.headers(sheet, 1).keys()].map(canonicalLabel);
      if (normalizedHeaders.includes('paivamaara') && normalizedHeaders.includes('kuitinnumero')) {
        return { provider: FinanceProvider.PAYPAL_POS, reportKind: FinanceReportKind.RECEIPTS };
      }
      const sample: unknown[] = [];
      for (let row = 1; row <= Math.min(40, sheet.rowCount); row += 1) {
        sheet.getRow(row).eachCell((cell) => sample.push(value(cell)));
      }
      const accountingHits = sample.filter(
        (item) => accountingCategory(item) !== FinanceAccountCategory.OTHER,
      ).length;
      if (accountingHits >= 2) {
        return { provider: FinanceProvider.GENERIC, reportKind: FinanceReportKind.ACCOUNTING };
      }
    } catch {
      return fallback;
    }
    return fallback;
  }

  async parse(
    fileName: string,
    buffer: Buffer,
    provider: FinanceProvider,
    reportKind: FinanceReportKind,
  ): Promise<ParsedFinanceImport> {
    const extension = extname(fileName).toLowerCase();
    if (extension === '.pdf') {
      const period = flatpayPeriodFromFileName(fileName);
      return {
        ...summary(
          [],
          {
            parser: 'flatpay-control-pdf',
            parserVersion: 2,
            filePeriodStart: period?.startDate.toISOString() ?? null,
            filePeriodEnd: period?.endDate.toISOString() ?? null,
          },
          [
            'Rapport Flatpay conservé comme pièce de contrôle. Les ventes consolidées proviennent du rapport Orders afin d’éviter un double comptage.',
          ],
        ),
        ready: provider === FinanceProvider.FLATPAY && reportKind !== FinanceReportKind.UNKNOWN,
        periodStart: period?.startDate ?? null,
        periodEnd: period?.endDate ?? null,
      };
    }
    if (extension === '.xls') {
      return summary([], { parser: 'legacy-xls', parserVersion: 1 }, [
        'Le format XLS historique doit être réexporté en XLSX ou CSV avant consolidation.',
      ]);
    }
    if (extension === '.csv' && provider === FinanceProvider.LOYVERSE) {
      return this.loyverse(buffer);
    }
    if (extension === '.csv' && reportKind === FinanceReportKind.ACCOUNTING) {
      return this.genericAccountingRows(fileName, csvRows(buffer));
    }
    if (
      provider === FinanceProvider.FLATPAY &&
      reportKind !== FinanceReportKind.SALES_ORDERS &&
      reportKind !== FinanceReportKind.PRODUCT_SALES &&
      reportKind !== FinanceReportKind.UNKNOWN
    ) {
      const period = flatpayPeriodFromFileName(fileName);
      return {
        ...summary(
          [],
          {
            parser: 'flatpay-control-file',
            parserVersion: 1,
            filePeriodStart: period?.startDate.toISOString() ?? null,
            filePeriodEnd: period?.endDate.toISOString() ?? null,
          },
          [
            'Rapport Flatpay conservé comme source de contrôle sans être ajouté une seconde fois au chiffre d’affaires.',
          ],
        ),
        ready: true,
        periodStart: period?.startDate ?? null,
        periodEnd: period?.endDate ?? null,
      };
    }
    if (extension !== '.xlsx') {
      return summary([], { parser: 'generic', parserVersion: 1 }, ['Mapping manuel requis.']);
    }
    if (reportKind === FinanceReportKind.BUDGET) return this.budgetWorkbook(buffer);
    if (reportKind === FinanceReportKind.ACCOUNTING) {
      return this.genericAccountingWorkbook(fileName, buffer);
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return summary([], { parser: 'xlsx-empty', parserVersion: 1 }, ['Classeur vide.']);
    if (provider === FinanceProvider.FLATPAY && reportKind === FinanceReportKind.SALES_ORDERS)
      return this.flatpayOrders(sheet, fileName);
    if (provider === FinanceProvider.FLATPAY && reportKind === FinanceReportKind.PRODUCT_SALES)
      return this.flatpayProducts(sheet, fileName);
    if (provider === FinanceProvider.PAYPAL_POS) return this.paypalPos(sheet);
    return summary([], { parser: 'generic-xlsx', parserVersion: 1 }, ['Mapping manuel requis.']);
  }

  private genericAccountingWorkbook(fileName: string, buffer: Buffer): ParsedFinanceImport {
    const zip = new AdmZip(buffer);
    const entryText = (entryPath: string) =>
      zip.getEntry(entryPath)?.getData().toString('utf8') ?? '';
    const workbookXml = entryText('xl/workbook.xml');
    const relationshipsXml = entryText('xl/_rels/workbook.xml.rels');
    const firstSheet = /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/.exec(workbookXml);
    if (!firstSheet) {
      return summary([], { parser: 'multilingual-accounting-table', parserVersion: 2 }, [
        'Le classeur comptable ne contient aucune feuille exploitable.',
      ]);
    }
    const relationship = [...relationshipsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)]
      .map((match) => ({
        id: /\bId="([^"]+)"/.exec(match[1])?.[1],
        target: /\bTarget="([^"]+)"/.exec(match[1])?.[1],
      }))
      .find(({ id }) => id === firstSheet[1]);
    if (!relationship?.target) {
      return summary([], { parser: 'multilingual-accounting-table', parserVersion: 2 }, [
        'La première feuille du classeur comptable ne peut pas être lue.',
      ]);
    }
    const sharedStrings = [
      ...entryText('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g),
    ].map((match) =>
      decodeXml(
        [...match[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
          .map((part) => part[1])
          .join(''),
      ),
    );
    const normalizedTarget = relationship.target.startsWith('/')
      ? relationship.target.slice(1)
      : `xl/${relationship.target.replace(/^\.\//, '')}`;
    return this.genericAccountingRows(
      fileName,
      openXmlRows(openXmlCells(entryText(normalizedTarget), sharedStrings)),
    );
  }

  private genericAccountingRows(fileName: string, rows: unknown[][]): ParsedFinanceImport {
    const flattened = rows.flat();
    const period = accountingPeriod(fileName, flattened);
    const text = canonicalLabel(flattened.join(' '));
    const multiplier = /million|meur/.test(text)
      ? 1_000_000
      : /keur|tuhatta|millier/.test(text)
        ? 1000
        : 1;
    const candidates = rows
      .map((row, index) => {
        const populated = row.filter((item) => item !== null && item !== undefined && item !== '');
        const labelCell = populated.find(
          (item) => typeof item === 'string' && !/^[-+()\d\s.,€$]+$/.test(item.trim()),
        );
        if (!labelCell) return null;
        const codeCell = populated.find((item) => /^\d{3,8}$/.test(String(item).trim()));
        if (/financialyear|tilikausi|exercice|accountingperiod/.test(canonicalLabel(labelCell))) {
          return null;
        }
        const category = accountingCategory(labelCell, codeCell);
        if (category === FinanceAccountCategory.OTHER) return null;
        const numericCells = populated
          .filter(
            (item) =>
              item !== codeCell &&
              (typeof item === 'number' ||
                /^[-+()\d][\d\s.,()-]*\s*[€$]?$/.test(String(item).trim())),
          )
          .map((item) => amount(item));
        const rowAmount = numericCells.sort((left, right) => Math.abs(right) - Math.abs(left))[0];
        if (rowAmount == null) return null;
        const label = String(labelCell).trim();
        const totalLike = /total|yhteensa|resultat|result|profit|loss|voitto|tappio/.test(
          canonicalLabel(label),
        );
        const ledgerCategories: FinanceAccountCategory[] = [
          FinanceAccountCategory.REVENUE,
          FinanceAccountCategory.MATERIAL_PURCHASES,
          FinanceAccountCategory.PAYROLL,
          FinanceAccountCategory.OTHER_OPEX,
          FinanceAccountCategory.FINANCIAL,
          FinanceAccountCategory.TAX,
        ];
        const economicAmount = ledgerCategories.includes(category)
          ? Math.abs(rowAmount * multiplier)
          : rowAmount * multiplier;
        return {
          index,
          code: codeCell ? String(codeCell).trim() : null,
          label,
          category,
          amount: economicAmount,
          debit: null,
          credit: null,
          includeInLedger: !totalLike,
          totalLike,
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
    for (const line of candidates) {
      if (
        line.totalLike &&
        !candidates.some(
          (other) => other !== line && other.category === line.category && !other.totalLike,
        )
      ) {
        line.includeInLedger = true;
      }
    }
    const lines: ParsedAccountingLine[] = candidates.map(
      ({ code, label, category, amount: lineAmount, debit, credit, includeInLedger }) => ({
        code,
        label,
        category,
        amount: lineAmount,
        debit,
        credit,
        includeInLedger,
      }),
    );
    const document: ParsedAccountingDocument = {
      language: accountingLanguage(flattened),
      documentType: 'income_statement',
      companyName: null,
      businessId: null,
      currency: 'EUR',
      periodStart: period.start,
      periodEnd: period.end,
      unitMultiplier: multiplier,
      confidence: lines.length >= 4 ? 0.92 : 0.72,
      lines,
      pageCount: null,
      warnings: [],
    };
    const included = lines.filter(({ includeInLedger }) => includeInLedger);
    const warnings = [
      ...(period.start && period.end ? [] : ['Période comptable à confirmer.']),
      ...(included.length ? [] : ['Aucune ligne comptable consolidable détectée.']),
    ];
    return {
      ready: Boolean(period.start && period.end && included.length),
      rows: [],
      periodStart: period.start,
      periodEnd: period.end,
      grossTotal: null,
      netTotal: null,
      vatTotal: null,
      warnings,
      metadata: {
        parser: 'multilingual-accounting-table',
        parserVersion: 1,
        language: document.language,
        unitMultiplier: multiplier,
        extractedLineCount: lines.length,
        includedLineCount: included.length,
      },
      accountingDocument: document,
    };
  }

  private budgetWorkbook(buffer: Buffer): ParsedFinanceImport {
    const zip = new AdmZip(buffer);
    const entryText = (path: string) => zip.getEntry(path)?.getData().toString('utf8') ?? '';
    const workbookXml = entryText('xl/workbook.xml');
    const relationshipsXml = entryText('xl/_rels/workbook.xml.rels');
    const relationshipTargets = new Map<string, string>();
    for (const match of relationshipsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)) {
      const id = /\bId="([^"]+)"/.exec(match[1])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1];
      if (id && target) relationshipTargets.set(id, target);
    }
    const budgetSheet = [
      ...workbookXml.matchAll(
        /<(?:\w+:)?sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g,
      ),
    ].find((match) => normalized(decodeXml(match[1])) === 'budget mensuel');
    if (!budgetSheet)
      return summary([], { parser: 'toquehub-budget', parserVersion: 2 }, [
        'La feuille « Budget mensuel » est introuvable.',
      ]);
    const target = relationshipTargets.get(budgetSheet[2]);
    if (!target)
      return summary([], { parser: 'toquehub-budget', parserVersion: 2 }, [
        'La feuille de budget ne peut pas être lue.',
      ]);
    const sharedStringsXml = entryText('xl/sharedStrings.xml');
    const sharedStrings = [
      ...sharedStringsXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g),
    ].map((match) =>
      decodeXml(
        [...match[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
          .map((part) => part[1])
          .join(''),
      ),
    );
    const normalizedTarget = target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`;
    const cells = openXmlCells(entryText(normalizedTarget), sharedStrings);
    const months = Array.from({ length: 12 }, (_, index) =>
      frenchMonth(cells.get(`${String.fromCharCode(66 + index)}5`)),
    );
    if (months.some((month) => !month))
      return summary([], { parser: 'toquehub-budget', parserVersion: 2 }, [
        'Les 12 mois du budget ne sont pas identifiables.',
      ]);
    const rowDefinitions = [
      [6, 'revenue', "Chiffre d'affaires"],
      [7, 'material_purchases', 'Achats / matières'],
      [13, 'payroll', 'Masse salariale'],
      [24, 'other_opex', "Autres charges d'exploitation"],
      [26, 'operating_expenses', "Charges d'exploitation"],
      [27, 'operating_result', "Résultat d'exploitation"],
      [33, 'net_result', 'Résultat net'],
      [35, 'break_even', 'Seuil de rentabilité'],
    ] as const;
    const lines = rowDefinitions.flatMap(([row, metric, label]) =>
      months.map((periodStart, index) => ({
        metric,
        label,
        periodStart: periodStart!,
        amount: amount(cells.get(`${String.fromCharCode(66 + index)}${row}`)),
      })),
    );
    const firstMonth = months[0]!;
    const lastMonth = months.at(-1)!;
    const endDate = new Date(
      Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const scenario = String(cells.get('B3') ?? '').trim() || null;
    const plan: ParsedBudgetPlan = {
      name: `Budget ${firstMonth.getUTCFullYear()}–${endDate.getUTCFullYear()}`,
      scenario,
      currency: 'EUR',
      startDate: firstMonth,
      endDate,
      lines,
    };
    return {
      ready: true,
      rows: [],
      periodStart: firstMonth,
      periodEnd: endDate,
      grossTotal: null,
      netTotal: lines
        .filter(({ metric }) => metric === 'revenue')
        .reduce((sum, line) => sum + line.amount, 0),
      vatTotal: null,
      warnings: [],
      metadata: {
        parser: 'toquehub-budget',
        parserVersion: 2,
        scenario: scenario ?? 'Non renseigné',
        metrics: rowDefinitions.map(([, metric]) => metric),
      },
      budgetPlan: plan,
    };
  }

  private flatpayOrders(sheet: ExcelJS.Worksheet, fileName: string) {
    const headers = this.headers(sheet, 1);
    const rows: ParsedSale[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const saleDate = date(value(row.getCell(headers.get('date of sale') ?? 0)));
      const order = value(row.getCell(headers.get('order no.') ?? 0));
      const status = normalized(value(row.getCell(headers.get('status') ?? 0)));
      if (!saleDate || !order) return;
      const gross = amount(value(row.getCell(headers.get('gross amount (eur)') ?? 0)));
      const net = amount(value(row.getCell(headers.get('net amount (eur)') ?? 0)));
      const vat = amount(value(row.getCell(headers.get('vat amount (eur)') ?? 0)));
      const discount = amount(value(row.getCell(headers.get('discount (eur)') ?? 0)));
      const complete = !status || status === 'complete' || status === 'completed';
      const refunded = status.includes('refund') || status.includes('return');
      rows.push({
        externalKey: `flatpay-order:${order}`,
        saleDate,
        grossAmount: new Prisma.Decimal(gross),
        netAmount: new Prisma.Decimal(net),
        vatAmount: new Prisma.Decimal(vat),
        refundAmount: new Prisma.Decimal(gross < 0 || refunded ? Math.abs(gross) : 0),
        transactionCount: complete && gross !== 0 ? 1 : 0,
        paymentMethod: String(value(row.getCell(headers.get('payment type') ?? 0)) ?? ''),
        isRevenueRecord: complete,
        metadata: {
          orderNumber: String(order),
          status: status || 'complete',
          staff: String(value(row.getCell(headers.get('staff') ?? 0)) ?? '').trim() || null,
          discount,
          vatRate: amount(value(row.getCell(headers.get('vat rate (%)') ?? 0))),
          recordType: 'transaction',
        },
      });
    });
    const period = flatpayProductPeriodFromFileName(fileName);
    const parsed = summary(rows, {
      parser: 'flatpay-orders',
      parserVersion: 3,
      filePeriodStart: period?.startDate.toISOString() ?? null,
      filePeriodEnd: period?.endDate.toISOString() ?? null,
    });
    return {
      ...parsed,
      ready: rows.length > 0 || Boolean(period),
      periodStart: period?.startDate ?? parsed.periodStart,
      periodEnd: period?.endDate ?? parsed.periodEnd,
    };
  }

  private flatpayProducts(sheet: ExcelJS.Worksheet, fileName: string) {
    const headers = this.headers(sheet, 1);
    const column = (...names: string[]) =>
      names.map((name) => headers.get(name)).find((index) => index !== undefined) ?? 0;
    const cell = (row: ExcelJS.Row, ...names: string[]) => {
      const index = column(...names);
      return index ? value(row.getCell(index)) : undefined;
    };
    const period = flatpayProductPeriodFromFileName(fileName);
    const rows: ParsedSale[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const product = String(cell(row, 'product name', 'tuotteen nimi') ?? '').trim();
      if (!product || isSummaryProduct(product)) return;
      const gross = amount(cell(row, 'total (eur)', 'yhteensä (eur)'));
      const net = amount(cell(row, 'total excl. vat (eur)', 'yhteensä ilman alv (eur)'));
      const vat = amount(cell(row, 'vat (eur)', 'alv (eur)'));
      const quantity = amount(cell(row, 'sale', 'myynti'));
      if (quantity === 0 && gross === 0 && net === 0 && vat === 0) return;
      rows.push({
        externalKey: sha([
          'flatpay-product',
          period?.startDate.toISOString() ?? fileName,
          period?.endDate.toISOString() ?? '',
          product,
          rowNumber,
        ]),
        saleDate: period?.endDate ?? new Date(0),
        grossAmount: new Prisma.Decimal(gross),
        netAmount: new Prisma.Decimal(net),
        vatAmount: new Prisma.Decimal(vat),
        refundAmount: new Prisma.Decimal(0),
        transactionCount: 0,
        productCategory: String(cell(row, 'category name', 'kategorian nimi') ?? ''),
        isRevenueRecord: false,
        metadata: {
          product,
          quantity,
          discount: amount(cell(row, 'discount (eur)', 'alennus (eur)')),
          barcode: String(cell(row, 'barcode', 'viivakoodi') ?? '').trim() || null,
          recordType: 'product_snapshot',
        },
      });
    });
    const parsed = summary(
      rows,
      {
        parser: 'flatpay-products',
        parserVersion: 6,
        filePeriodStart: period?.startDate.toISOString() ?? null,
        filePeriodEnd: period?.endDate.toISOString() ?? null,
      },
      [
        'Le rapport produit complète l’analyse des familles mais ne remplace pas le rapport Orders pour le chiffre d’affaires journalier.',
        ...(period ? [] : ['La période du rapport ne peut pas être déterminée depuis son nom.']),
      ],
    );
    return {
      ...parsed,
      ready: Boolean(period),
      periodStart: period?.startDate ?? null,
      periodEnd: period?.endDate ?? null,
    };
  }

  private paypalPos(sheet: ExcelJS.Worksheet) {
    let headerRow = 0;
    for (let row = 1; row <= Math.min(sheet.rowCount, 50); row += 1) {
      if (normalized(value(sheet.getRow(row).getCell(1))) === 'päivämäärä') {
        headerRow = row;
        break;
      }
    }
    if (!headerRow)
      return summary([], { parser: 'paypal-pos', parserVersion: 1 }, [
        'En-tête PayPal POS introuvable.',
      ]);
    const headers = this.headers(sheet, headerRow);
    const rows: ParsedSale[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const saleDate = date(value(row.getCell(headers.get('päivämäärä') ?? 0)));
      const receipt = value(row.getCell(headers.get('kuitin numero') ?? 0));
      if (!saleDate || !receipt) return;
      const gross = amount(value(row.getCell(headers.get('yhteensä') ?? 0)));
      const vat = [...headers.entries()]
        .filter(([name]) => name.startsWith('alv ('))
        .reduce((sum, [, column]) => sum + amount(value(row.getCell(column))), 0);
      const type = normalized(value(row.getCell(headers.get('tapahtuman tyyppi') ?? 0)));
      rows.push({
        externalKey: `paypal-pos:${receipt}`,
        saleDate,
        grossAmount: new Prisma.Decimal(gross),
        netAmount: new Prisma.Decimal(gross - vat),
        vatAmount: new Prisma.Decimal(vat),
        refundAmount: new Prisma.Decimal(
          gross < 0 || type.includes('palauta') ? Math.abs(gross) : 0,
        ),
        transactionCount: gross === 0 ? 0 : 1,
        paymentMethod: String(value(row.getCell(headers.get('maksutapa') ?? 0)) ?? ''),
        isRevenueRecord: true,
        metadata: { receiptNumber: String(receipt), transactionType: type },
      });
    });
    return summary(rows, { parser: 'paypal-pos-receipts', parserVersion: 1 });
  }

  private loyverse(buffer: Buffer) {
    const input = csvRows(buffer);
    const headers = new Map(input[0]?.map((item, index) => [normalized(item), index]) ?? []);
    const receipts = new Map<string, ParsedSale>();
    const productRows: ParsedSale[] = [];
    const productLineIndexByReceipt = new Map<string, number>();
    for (const row of input.slice(1)) {
      const receipt = row[headers.get('numéro du reçu') ?? -1]?.trim();
      const saleDate = date(row[headers.get('date') ?? -1], true);
      if (!receipt || !saleDate) continue;
      const gross = amount(row[headers.get('ventes nettes') ?? -1]);
      const vat = amount(row[headers.get('taxes') ?? -1]);
      const cost = amount(row[headers.get('coût des marchandises') ?? -1]);
      const receiptType = normalized(row[headers.get('type de reçu') ?? -1]);
      const refund = receiptType.includes('remb') || receiptType.includes('refund');
      const store = String(row[headers.get('magasin') ?? -1] ?? '').trim();
      const pointOfSale = String(row[headers.get('pdv') ?? -1] ?? '').trim();
      const cashier = String(row[headers.get('nom du caissier') ?? -1] ?? '').trim();
      const existing = receipts.get(receipt);
      if (existing) {
        existing.grossAmount = existing.grossAmount.add(gross);
        existing.netAmount = existing.netAmount.add(gross - vat);
        existing.vatAmount = existing.vatAmount.add(vat);
        existing.costAmount = (existing.costAmount ?? new Prisma.Decimal(0)).add(cost);
        if (refund) existing.refundAmount = existing.refundAmount.add(Math.abs(gross));
      } else {
        receipts.set(receipt, {
          externalKey: `loyverse:${receipt}`,
          saleDate,
          grossAmount: new Prisma.Decimal(gross),
          netAmount: new Prisma.Decimal(gross - vat),
          vatAmount: new Prisma.Decimal(vat),
          refundAmount: new Prisma.Decimal(refund ? Math.abs(gross) : 0),
          costAmount: new Prisma.Decimal(cost),
          transactionCount: refund ? 0 : 1,
          isRevenueRecord: true,
          metadata: {
            receiptNumber: receipt,
            recordType: 'transaction',
            status: refund ? 'refund' : 'complete',
            store: store || null,
            pointOfSale: pointOfSale || null,
            cashier: cashier || null,
          },
        });
      }

      const product = String(row[headers.get('article') ?? -1] ?? '').trim();
      if (!product || isSummaryProduct(product)) continue;
      const quantity = amount(row[headers.get('quantité') ?? -1]);
      const discount = amount(row[headers.get('réductions') ?? -1]);
      const category = String(row[headers.get('catégorie') ?? -1] ?? '').trim();
      const variant = String(row[headers.get('variante') ?? -1] ?? '').trim();
      const sku = String(row[headers.get('ugs') ?? -1] ?? '').trim();
      const productLineIndex = productLineIndexByReceipt.get(receipt) ?? 0;
      productLineIndexByReceipt.set(receipt, productLineIndex + 1);
      productRows.push({
        externalKey: `loyverse-product:${receipt}:${productLineIndex}`,
        saleDate,
        grossAmount: new Prisma.Decimal(gross),
        netAmount: new Prisma.Decimal(gross - vat),
        vatAmount: new Prisma.Decimal(vat),
        refundAmount: new Prisma.Decimal(refund ? Math.abs(gross) : 0),
        costAmount: new Prisma.Decimal(cost),
        transactionCount: 0,
        productCategory: category || 'Non classé',
        isRevenueRecord: false,
        metadata: {
          receiptNumber: receipt,
          recordType: 'product_snapshot',
          product,
          variant: variant || null,
          sku: sku || null,
          quantity,
          discount,
          store: store || null,
          pointOfSale: pointOfSale || null,
        },
      });
    }
    return summary([...receipts.values(), ...productRows], {
      parser: 'loyverse-receipts-products',
      parserVersion: 2,
      receiptCount: receipts.size,
      productRowCount: productRows.length,
    });
  }

  private headers(sheet: ExcelJS.Worksheet, rowNumber: number) {
    const headers = new Map<string, number>();
    sheet
      .getRow(rowNumber)
      .eachCell((cell, column) => headers.set(normalized(value(cell)), column));
    return headers;
  }
}
