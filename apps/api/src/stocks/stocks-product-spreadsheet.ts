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
};

type HeaderScorer = (headers: string[]) => number;

/** Reads a structured XLSX workbook without sending its contents through OCR. */
export async function parseProductWorkbook(
  buffer: Buffer,
  scoreHeaders: HeaderScorer,
): Promise<TabularImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
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
  };
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
