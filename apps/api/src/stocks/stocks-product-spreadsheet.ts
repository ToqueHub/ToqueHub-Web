import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';

export type TabularImportRow = {
  rowNumber: number;
  values: string[];
};

export type TabularImport = {
  headers: string[];
  rows: TabularImportRow[];
  sheetName: string;
  headerRowNumber: number;
  compatibilityMode?: 'minimal-openxml';
};

type HeaderScorer = (headers: string[]) => number;

/** Reads a structured XLSX workbook without sending its contents through OCR. */
export async function parseProductWorkbook(
  buffer: Buffer,
  scoreHeaders: HeaderScorer,
): Promise<TabularImport> {
  const { workbook, compatibilityMode } = await loadProductWorkbook(buffer);
  if (!workbook.worksheets.length) throw new Error('Le classeur Excel ne contient aucune feuille.');

  let best: {
    worksheet: ExcelJS.Worksheet;
    rowNumber: number;
    headers: string[];
    score: number;
  } | null = null;
  for (const worksheet of workbook.worksheets) {
    const maxRow = Math.min(Math.max(worksheet.actualRowCount, 1), 30);
    for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
      const values = worksheet.getRow(rowNumber).values as ExcelJS.CellValue[];
      const lastColumn = lastPopulatedColumn(values);
      if (lastColumn < 2) continue;
      const headers = uniqueHeaders(
        Array.from({ length: lastColumn }, (_, index) =>
          cellText(worksheet.getCell(rowNumber, index + 1)),
        ),
      );
      const populated = headers.filter((header) => !header.startsWith('Colonne ')).length;
      const score = scoreHeaders(headers) + populated / 100;
      if (!best || score > best.score) best = { worksheet, rowNumber, headers, score };
    }
  }

  if (!best) throw new Error('Aucun tableau exploitable trouvé dans le classeur Excel.');
  const rows: TabularImportRow[] = [];
  for (
    let rowNumber = best.rowNumber + 1;
    rowNumber <= best.worksheet.actualRowCount;
    rowNumber += 1
  ) {
    const values = best.headers.map((_, index) =>
      cellText(best!.worksheet.getCell(rowNumber, index + 1)),
    );
    if (values.some((value) => value !== '')) rows.push({ rowNumber, values });
  }

  return {
    headers: best.headers,
    rows,
    sheetName: best.worksheet.name,
    headerRowNumber: best.rowNumber,
    compatibilityMode,
  };
}

async function loadProductWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    return { workbook, compatibilityMode: undefined };
  } catch (initialError) {
    const normalized = normalizeMinimalOpenXmlWorkbook(buffer);
    if (!normalized) throw initialError;

    const compatibleWorkbook = new ExcelJS.Workbook();
    try {
      await compatibleWorkbook.xlsx.load(normalized as unknown as ExcelJS.Buffer);
      return {
        workbook: compatibleWorkbook,
        compatibilityMode: 'minimal-openxml' as const,
      };
    } catch {
      throw initialError;
    }
  }
}

/**
 * Some spreadsheet exporters produce valid but unusually minimal SpreadsheetML:
 * every element uses a namespace prefix and row/cell references are omitted.
 * Excel and tolerant readers infer those references, while ExcelJS does not.
 * Normalize only that representation, in memory, after the regular reader fails.
 */
function normalizeMinimalOpenXmlWorkbook(buffer: Buffer) {
  try {
    const archive = new AdmZip(buffer);
    const workbookEntry = archive.getEntry('xl/workbook.xml');
    if (!workbookEntry) return null;

    const workbookXml = archive.readAsText(workbookEntry);
    if (!spreadsheetMlPrefix(workbookXml)) return null;

    let changed = false;
    for (const entry of archive.getEntries()) {
      if (!entry.entryName.startsWith('xl/') || !entry.entryName.endsWith('.xml')) continue;
      const source = archive.readAsText(entry);
      let normalized = normalizeSpreadsheetMlNamespace(source);
      if (entry.entryName.startsWith('xl/worksheets/')) {
        normalized = ensureWorksheetReferences(normalized);
      }
      if (normalized !== source) {
        archive.updateFile(entry.entryName, Buffer.from(normalized, 'utf8'));
        changed = true;
      }
    }
    return changed ? archive.toBuffer() : null;
  } catch {
    return null;
  }
}

const SPREADSHEET_ML_NAMESPACE =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function spreadsheetMlPrefix(xml: string) {
  return xml.match(
    new RegExp(
      `xmlns:([A-Za-z_][\\w.-]*)=(["'])${escapeRegExp(SPREADSHEET_ML_NAMESPACE)}\\2`,
    ),
  )?.[1];
}

function normalizeSpreadsheetMlNamespace(xml: string) {
  const prefix = spreadsheetMlPrefix(xml);
  if (!prefix) return xml;

  const namespaceDeclaration = new RegExp(
    `\\s+xmlns:${escapeRegExp(prefix)}=(["'])${escapeRegExp(SPREADSHEET_ML_NAMESPACE)}\\1`,
  );
  const hasDefaultNamespace = new RegExp(
    `xmlns=(["'])${escapeRegExp(SPREADSHEET_ML_NAMESPACE)}\\1`,
  ).test(xml);
  const normalizedNamespace = hasDefaultNamespace
    ? ''
    : ` xmlns="${SPREADSHEET_ML_NAMESPACE}"`;

  return xml
    .replace(new RegExp(`<(/?)${escapeRegExp(prefix)}:`, 'g'), '<$1')
    .replace(namespaceDeclaration, normalizedNamespace);
}

function ensureWorksheetReferences(xml: string) {
  let nextRowNumber = 1;
  return xml.replace(
    /<row\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/row>)/g,
    (_row, attributes: string, cells: string | undefined) => {
      const explicitRowNumber = numericAttribute(attributes, 'r');
      const rowNumber = explicitRowNumber ?? nextRowNumber;
      nextRowNumber = Math.max(nextRowNumber, rowNumber + 1);
      const rowAttributes =
        explicitRowNumber === undefined
          ? addAttribute(attributes, 'r', String(rowNumber))
          : attributes.trim();

      if (cells === undefined) return `<row${attributeSuffix(rowAttributes)} />`;

      let nextColumnNumber = 1;
      const referencedCells = cells.replace(
        /<c\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/c>)/g,
        (_cell, cellAttributes: string, content: string | undefined) => {
          const explicitReference = stringAttribute(cellAttributes, 'r');
          if (explicitReference) {
            const column = columnNumber(explicitReference);
            if (column) nextColumnNumber = Math.max(nextColumnNumber, column + 1);
          }
          const reference = explicitReference ?? `${columnName(nextColumnNumber++)}${rowNumber}`;
          const normalizedAttributes = explicitReference
            ? cellAttributes.trim()
            : addAttribute(cellAttributes, 'r', reference);
          return content === undefined
            ? `<c${attributeSuffix(normalizedAttributes)} />`
            : `<c${attributeSuffix(normalizedAttributes)}>${content}</c>`;
        },
      );

      return `<row${attributeSuffix(rowAttributes)}>${referencedCells}</row>`;
    },
  );
}

function numericAttribute(attributes: string, name: string) {
  const value = stringAttribute(attributes, name);
  if (!value || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function stringAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`))?.[2];
}

function addAttribute(attributes: string, name: string, value: string) {
  const current = attributes.trim();
  return `${current}${current ? ' ' : ''}${name}="${value}"`;
}

function attributeSuffix(attributes: string) {
  const current = attributes.trim();
  return current ? ` ${current}` : '';
}

function columnName(columnNumber: number) {
  let value = columnNumber;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function columnNumber(reference: string) {
  const letters = reference.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
  if (!letters) return 0;
  return [...letters].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cellText(cell: ExcelJS.Cell) {
  if (cell.value == null) return '';
  if (cell.type === ExcelJS.ValueType.Date && cell.value instanceof Date)
    return cell.value.toISOString();
  return String(cell.text ?? '').trim();
}

function lastPopulatedColumn(values: ExcelJS.CellValue[]) {
  for (let index = values.length - 1; index >= 1; index -= 1) {
    const value = values[index];
    if (value !== null && value !== undefined && String(value).trim() !== '') return index;
  }
  return 0;
}

function uniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header || `Colonne ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}
