import ExcelJS from 'exceljs';

export type InventorySheetCell = string | number | null;

export type InventoryImportParsedRow = {
  sourceId: string;
  sheetName: string;
  rowNumber: number;
  sourceName: string;
  countedQuantity: number;
  unitLabel: string | null;
  unitPriceExVat: number | null;
  totalExVat: number | null;
  categoryName: string | null;
  supplierName: string | null;
  warnings: string[];
};

export type InventoryImportParseIssue = {
  sheetName: string;
  rowNumber: number;
  code: 'MISSING_NAME' | 'INVALID_QUANTITY' | 'TOTAL_MISMATCH' | 'SUMMARY_MISMATCH';
  message: string;
};

export type ParsedInventoryWorkbook = {
  sourceKind: 'spreadsheetml' | 'xlsx' | 'csv';
  sheets: Array<{ name: string; rowsRead: number; productsFound: number }>;
  rows: InventoryImportParsedRow[];
  issues: InventoryImportParseIssue[];
  summary: {
    productRows: number;
    zeroQuantityRows: number;
    fractionalQuantityRows: number;
    calculatedValueExVat: number;
    reportedRowsValueExVat: number | null;
    workbookSummaryValueExVat: number | null;
  };
};

type RawSheet = { name: string; rows: InventorySheetCell[][] };

const HEADER_ALIASES = {
  name: ['tuote', 'tuotenimi', 'produit', 'nom produit', 'product', 'product name', 'article'],
  quantity: ['maara', 'määrä', 'quantite', 'quantité', 'qty', 'quantity', 'stock', 'compte'],
  unit: ['koko', 'yksikko', 'yksikkö', 'unite', 'unité', 'unit', 'uom'],
  unitPrice: [
    'yks hinta alv 0',
    'yks.hinta(alv 0%)',
    'prix unitaire ht',
    'prix achat ht',
    'unit price excl vat',
    'unit price ex vat',
    'unit price',
  ],
  total: [
    'hinta alv 0 yht',
    'hinta(alv 0%)yht.',
    'total ht',
    'total excl vat',
    'total ex vat',
  ],
  supplier: ['toimittaja', 'fournisseur', 'supplier', 'vendor'],
} as const;

const TOTAL_LABELS = new Set([
  'yhteensa',
  'total',
  'totaux',
  'subtotal',
  'sous total',
  'sous-total',
  'grand total',
]);

export async function parseInventoryWorkbook(
  filename: string,
  buffer: Buffer,
): Promise<ParsedInventoryWorkbook> {
  const lower = filename.toLowerCase();
  let sourceKind: ParsedInventoryWorkbook['sourceKind'];
  let sheets: RawSheet[];
  if (lower.endsWith('.xml')) {
    sourceKind = 'spreadsheetml';
    sheets = parseSpreadsheetMl(buffer.toString('utf8'));
  } else if (lower.endsWith('.xlsx')) {
    sourceKind = 'xlsx';
    sheets = await parseXlsx(buffer);
  } else if (lower.endsWith('.csv')) {
    sourceKind = 'csv';
    sheets = [{ name: 'CSV', rows: parseCsv(buffer.toString('utf8')) }];
  } else {
    throw new Error('Format non supporté. Utilisez CSV, Excel (.xlsx) ou Excel XML (.xml).');
  }
  if (!sheets.length) throw new Error('Le document ne contient aucune feuille lisible.');
  return extractInventoryRows(sourceKind, sheets);
}

export function parseSpreadsheetMl(xml: string): RawSheet[] {
  const sanitized = xml.replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!ENTITY[\s\S]*?>/gi, '');
  const sheets: RawSheet[] = [];
  const worksheetRegex = /<(?:\w+:)?Worksheet\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Worksheet>/gi;
  let worksheetMatch: RegExpExecArray | null;
  while ((worksheetMatch = worksheetRegex.exec(sanitized))) {
    const attrs = worksheetMatch[1] ?? '';
    const name = decodeXml(
      attrs.match(/(?:ss:)?Name\s*=\s*"([^"]*)"/i)?.[1] ?? `Feuille ${sheets.length + 1}`,
    );
    const rows: InventorySheetCell[][] = [];
    const rowRegex = /<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(worksheetMatch[2]))) {
      const cells: InventorySheetCell[] = [];
      const cellRegex = /<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/gi;
      let cellMatch: RegExpExecArray | null;
      let column = 0;
      while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
        const explicitIndex = Number(
          cellMatch[1]?.match(/(?:ss:)?Index\s*=\s*"(\d+)"/i)?.[1] ?? 0,
        );
        if (explicitIndex > 0) column = explicitIndex - 1;
        while (cells.length < column) cells.push(null);
        const data = cellMatch[2].match(
          /<(?:\w+:)?Data\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Data>/i,
        );
        if (!data) {
          cells[column] = null;
        } else {
          const type = data[1]?.match(/(?:ss:)?Type\s*=\s*"([^"]+)"/i)?.[1] ?? 'String';
          const value = decodeXml(data[2].replace(/<[^>]+>/g, '')).trim();
          cells[column] = type.toLowerCase() === 'number' && value !== '' ? Number(value) : value;
        }
        column += 1;
      }
      rows.push(cells);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

async function parseXlsx(buffer: Buffer): Promise<RawSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook.worksheets.map((sheet) => {
    const rows: InventorySheetCell[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: InventorySheetCell[] = [];
      for (let index = 1; index <= Math.max(row.cellCount, 1); index += 1) {
        const raw = row.getCell(index).value as any;
        const resolved = raw && typeof raw === 'object' && 'result' in raw ? raw.result : raw;
        values.push(toCellValue(resolved));
      }
      rows.push(values);
    });
    return { name: sheet.name, rows };
  });
}

function parseCsv(input: string): InventorySheetCell[][] {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.split('\n').find((line) => line.trim()) ?? '';
  const delimiter = [',', ';', '\t'].sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index] ?? '\n';
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && char === '\n') {
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  return rows;
}

function extractInventoryRows(
  sourceKind: ParsedInventoryWorkbook['sourceKind'],
  rawSheets: RawSheet[],
): ParsedInventoryWorkbook {
  const rows: InventoryImportParsedRow[] = [];
  const issues: InventoryImportParseIssue[] = [];
  const sheetSummaries: ParsedInventoryWorkbook['sheets'] = [];
  let workbookSummaryValueExVat: number | null = null;

  for (const sheet of rawSheets) {
    const summaryTotal = findWorkbookSummary(sheet.rows);
    if (summaryTotal != null && workbookSummaryValueExVat == null) workbookSummaryValueExVat = summaryTotal;
    const header = findHeader(sheet.rows);
    if (!header) {
      sheetSummaries.push({ name: sheet.name, rowsRead: sheet.rows.length, productsFound: 0 });
      continue;
    }
    let categoryName: string | null = null;
    let productsFound = 0;
    for (let index = header.rowIndex + 1; index < sheet.rows.length; index += 1) {
      const cells = sheet.rows[index];
      const name = cellText(cells[header.columns.name]);
      const quantityRaw = cells[header.columns.quantity];
      const quantity = parseNumber(quantityRaw);
      const unit = cellText(cells[header.columns.unit]);
      const unitPrice = parseNumber(cells[header.columns.unitPrice]);
      const total = parseNumber(cells[header.columns.total]);
      const supplierRaw = cellText(cells[header.columns.supplier]);
      const supplier = supplierRaw && !looksNumeric(supplierRaw) ? supplierRaw : null;
      const populated = cells.filter((value) => cellText(value) !== '').length;
      if (name && TOTAL_LABELS.has(normalize(name))) continue;
      if (name && quantity == null && populated <= 2) {
        categoryName = name;
        continue;
      }
      if (!name && [quantityRaw, unit, unitPrice, total].some((value) => cellText(value) !== '')) {
        issues.push({
          sheetName: sheet.name,
          rowNumber: index + 1,
          code: 'MISSING_NAME',
          message: `Ligne ${index + 1}: données présentes mais nom du produit absent.`,
        });
        continue;
      }
      if (!name) continue;
      if (quantity == null || quantity < 0) {
        issues.push({
          sheetName: sheet.name,
          rowNumber: index + 1,
          code: 'INVALID_QUANTITY',
          message: `« ${name} »: quantité absente ou invalide.`,
        });
        continue;
      }
      const warnings: string[] = [];
      if (unitPrice != null && total != null) {
        const expected = quantity * unitPrice;
        const tolerance = Math.max(0.02, Math.abs(expected) * 0.005);
        if (Math.abs(expected - total) > tolerance) {
          const message = `« ${name} »: quantité × prix (${money(expected)}) ne correspond pas au total déclaré (${money(total)}).`;
          warnings.push(message);
          issues.push({
            sheetName: sheet.name,
            rowNumber: index + 1,
            code: 'TOTAL_MISMATCH',
            message,
          });
        }
      }
      rows.push({
        sourceId: `${sheet.name}:${index + 1}`,
        sheetName: sheet.name,
        rowNumber: index + 1,
        sourceName: name,
        countedQuantity: round(quantity, 3),
        unitLabel: unit || null,
        unitPriceExVat: unitPrice == null ? null : round(unitPrice, 6),
        totalExVat: total == null ? null : round(total, 6),
        categoryName,
        supplierName: supplier,
        warnings,
      });
      productsFound += 1;
    }
    sheetSummaries.push({ name: sheet.name, rowsRead: sheet.rows.length, productsFound });
  }

  if (!rows.length) {
    throw new Error(
      'Aucune ligne d’inventaire reconnue. Colonnes attendues: produit, quantité et unité.',
    );
  }
  const calculatedValueExVat = rows.reduce(
    (sum, row) => sum + row.countedQuantity * (row.unitPriceExVat ?? 0),
    0,
  );
  const rowsWithTotal = rows.filter((row) => row.totalExVat != null);
  const reportedRowsValueExVat = rowsWithTotal.length
    ? rowsWithTotal.reduce((sum, row) => sum + (row.totalExVat ?? 0), 0)
    : null;
  if (
    workbookSummaryValueExVat != null &&
    Math.abs(calculatedValueExVat - workbookSummaryValueExVat) >
      Math.max(1, workbookSummaryValueExVat * 0.005)
  ) {
    issues.push({
      sheetName: rawSheets[0]?.name ?? 'Résumé',
      rowNumber: 0,
      code: 'SUMMARY_MISMATCH',
      message: `La valeur recalculée (${money(calculatedValueExVat)}) diffère du total du classeur (${money(workbookSummaryValueExVat)}). Vérifiez les formules et sous-totaux du document.`,
    });
  }
  return {
    sourceKind,
    sheets: sheetSummaries,
    rows,
    issues,
    summary: {
      productRows: rows.length,
      zeroQuantityRows: rows.filter((row) => row.countedQuantity === 0).length,
      fractionalQuantityRows: rows.filter((row) => !Number.isInteger(row.countedQuantity)).length,
      calculatedValueExVat: round(calculatedValueExVat, 2),
      reportedRowsValueExVat:
        reportedRowsValueExVat == null ? null : round(reportedRowsValueExVat, 2),
      workbookSummaryValueExVat:
        workbookSummaryValueExVat == null ? null : round(workbookSummaryValueExVat, 2),
    },
  };
}

function findHeader(rows: InventorySheetCell[][]) {
  let best:
    | { rowIndex: number; score: number; columns: Record<keyof typeof HEADER_ALIASES, number> }
    | undefined;
  rows.slice(0, 40).forEach((cells, rowIndex) => {
    const columns = {} as Record<keyof typeof HEADER_ALIASES, number>;
    let score = 0;
    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((field) => {
      const found = cells.findIndex((cell) => matchesAlias(cellText(cell), HEADER_ALIASES[field]));
      columns[field] = found;
      if (found >= 0) score += field === 'name' || field === 'quantity' ? 3 : 1;
    });
    if (columns.name >= 0 && columns.quantity >= 0 && (!best || score > best.score)) {
      best = { rowIndex, score, columns };
    }
  });
  return best;
}

function findWorkbookSummary(rows: InventorySheetCell[][]) {
  for (const cells of rows) {
    if (!TOTAL_LABELS.has(normalize(cellText(cells[0])))) continue;
    const value = parseNumber(cells[1]);
    if (value != null && value > 0) return value;
  }
  return null;
}

function matchesAlias(value: string, aliases: readonly string[]) {
  const normalized = normalize(value);
  return aliases.some((alias) => normalized === normalize(alias));
}

export function normalizeInventoryName(value: string) {
  return normalize(value);
}

export function normalizeInventoryFamilyName(value: string) {
  return normalize(value)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl|kpl|pcs?|plo|pkt|pss|ltk|rll|tlk)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value: InventorySheetCell | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cellText(value).replace(/\s/g, '').replace(',', '.');
  if (!text) return null;
  const parsed = Number(text.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function toCellValue(value: any): InventorySheetCell {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.toISOString();
  if (value == null) return null;
  if (typeof value === 'object' && Array.isArray(value.richText))
    return value.richText.map((entry: any) => entry.text ?? '').join('');
  return String(value);
}

function cellText(value: InventorySheetCell | undefined) {
  return value == null ? '' : String(value).trim();
}

function looksNumeric(value: string) {
  return /^[-+]?\d+(?:[.,]\d+)?$/.test(value.replace(/\s/g, ''));
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function money(value: number) {
  return `${round(value, 2).toFixed(2).replace('.', ',')} €`;
}
