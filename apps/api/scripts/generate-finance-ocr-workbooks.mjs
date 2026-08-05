import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactToolModule = process.env.TOQUEHUB_ARTIFACT_TOOL_MODULE || '@oai/artifact-tool';
const { SpreadsheetFile, Workbook } = await import(artifactToolModule);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, '../test-fixtures/finance/accounting-reports');
const verificationDir = path.join(outputDir, '_verification', 'xlsx');
const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'));

const translations = {
  fr: {
    statement: 'Compte de résultat',
    period: 'Exercice',
    currency: 'Devise',
    code: 'Compte',
    label: 'Libellé',
    amount: 'Montant',
    share: '% du CA',
    revenue: "Chiffre d'affaires",
    purchases: 'Achats de matières premières',
    payroll: 'Salaires et charges sociales',
    rent: 'Loyers et charges locatives',
    energy: 'Énergie et services',
    marketing: 'Marketing et communication',
    other: "Autres charges d'exploitation",
    operating: "Résultat d'exploitation",
    financial: 'Charges financières',
    tax: 'Impôts sur le résultat',
    net: 'Résultat net',
    details: 'Détails mensuels',
    checks: 'Contrôles',
    month: 'Mois',
    monthlyRevenue: 'CA mensuel',
    monthlyExpense: 'Charges mensuelles',
    monthlyResult: 'Résultat mensuel',
    annualCheck: 'Contrôle annuel',
    expected: 'Valeur attendue',
    calculated: 'Valeur calculée',
    difference: 'Écart',
  },
  en: {
    statement: 'Income statement',
    period: 'Financial year',
    currency: 'Currency',
    code: 'Account',
    label: 'Description',
    amount: 'Amount',
    share: '% of revenue',
    revenue: 'Net revenue',
    purchases: 'Raw material purchases',
    payroll: 'Payroll and social costs',
    rent: 'Rent and occupancy costs',
    energy: 'Utilities and energy',
    marketing: 'Marketing and advertising',
    other: 'Other operating expenses',
    operating: 'Operating profit',
    financial: 'Finance costs',
    tax: 'Income tax expense',
    net: 'Net profit',
    details: 'Monthly details',
    checks: 'Checks',
    month: 'Month',
    monthlyRevenue: 'Monthly revenue',
    monthlyExpense: 'Monthly expenses',
    monthlyResult: 'Monthly result',
    annualCheck: 'Annual reconciliation',
    expected: 'Expected value',
    calculated: 'Calculated value',
    difference: 'Difference',
  },
  fi: {
    statement: 'Tuloslaskelma',
    period: 'Tilikausi',
    currency: 'Valuutta',
    code: 'Tili',
    label: 'Selite',
    amount: 'Määrä',
    share: '% liikevaihdosta',
    revenue: 'Liikevaihto',
    purchases: 'Aine- ja tarvikeostot',
    payroll: 'Henkilöstökulut ja palkat',
    rent: 'Vuokrat ja toimitilakulut',
    energy: 'Energia ja palvelut',
    marketing: 'Markkinointi ja mainonta',
    other: 'Liiketoiminnan muut kulut',
    operating: 'Liikevoitto',
    financial: 'Rahoituskulut',
    tax: 'Tuloverot',
    net: 'Tilikauden voitto',
    details: 'Kuukausierittely',
    checks: 'Tarkistukset',
    month: 'Kuukausi',
    monthlyRevenue: 'Kuukauden liikevaihto',
    monthlyExpense: 'Kuukauden kulut',
    monthlyResult: 'Kuukauden tulos',
    annualCheck: 'Vuositarkistus',
    expected: 'Odotettu arvo',
    calculated: 'Laskettu arvo',
    difference: 'Erotus',
  },
};

const palette = {
  navy: '#10233F',
  teal: '#0F766E',
  mint: '#DDF7EF',
  pale: '#F4F8FB',
  border: '#D8E2EC',
  muted: '#64748B',
  white: '#FFFFFF',
  red: '#B42318',
};

function splitOtherOpex(total) {
  const values = [0.38, 0.2, 0.16, 0.26].map((ratio) => Math.round(total * ratio * 100) / 100);
  values[3] = Math.round((total - values[0] - values[1] - values[2]) * 100) / 100;
  return values;
}

function styleStatement(sheet) {
  sheet.getRange('A1:D1').merge();
  sheet.getRange('A1:D1').format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white, size: 18 },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
    rowHeight: 32,
  };
  sheet.getRange('A6:D6').format = {
    fill: palette.teal,
    font: { bold: true, color: palette.white },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
    rowHeight: 24,
  };
  sheet.getRange('A7:D19').format.borders = {
    bottom: { color: palette.border, style: 'thin' },
  };
  sheet.getRange('A7:A19').format.font = { color: palette.muted };
  sheet.getRange('B7:B19').format.font = { bold: false, color: palette.navy };
  sheet.getRange('C7:C19').format.numberFormat = '#,##0.00 [$€-1]';
  sheet.getRange('D7:D19').format.numberFormat = '0.0%';
  sheet.getRange('A15:D15').format = {
    fill: palette.mint,
    font: { bold: true, color: palette.navy },
    borders: {
      top: { color: palette.teal, style: 'medium' },
      bottom: { color: palette.border, style: 'thin' },
    },
  };
  sheet.getRange('A19:D19').format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white },
    borders: { top: { color: palette.navy, style: 'medium' } },
  };
  sheet.getRange('A1:A19').format.columnWidth = 14;
  sheet.getRange('B1:B19').format.columnWidth = 39;
  sheet.getRange('C1:C19').format.columnWidth = 19;
  sheet.getRange('D1:D19').format.columnWidth = 18;
  sheet.getRange('A1:D19').format.wrapText = true;
  sheet.freezePanes.freezeRows(6);
}

function addStatement(workbook, entry) {
  const t = translations[entry.language];
  const sheet = workbook.worksheets.add(t.statement.slice(0, 31));
  const other = splitOtherOpex(entry.expected.otherOpex);
  sheet.getRange('A1:D19').values = [
    [`${t.statement} — ${entry.companyName}`, null, null, null],
    [t.period, `${entry.periodStart} — ${entry.periodEnd}`, null, null],
    [t.currency, entry.currency, null, null],
    ['Business ID', entry.businessId, null, null],
    ['Synthetic QA corpus', 'ToqueHub Finance OCR · v1', null, null],
    [t.code, t.label, t.amount, t.share],
    ['3000', t.revenue, entry.expected.revenue, null],
    ['4000', t.purchases, entry.expected.materialPurchases, null],
    ['5000', t.payroll, entry.expected.payroll, null],
    ['6100', t.rent, other[0], null],
    ['6200', t.energy, other[1], null],
    ['6300', t.marketing, other[2], null],
    ['6500', t.other, other[3], null],
    ['', '', null, null],
    ['6990', t.operating, null, null],
    ['7000', t.financial, entry.expected.financial, null],
    ['8000', t.tax, entry.expected.tax, null],
    ['', '', null, null],
    ['8990', t.net, null, null],
  ];
  sheet.getRange('C15').formulas = [['=C7-SUM(C8:C13)']];
  sheet.getRange('C19').formulas = [['=C15-C16-C17']];
  sheet.getRange('D7').formulas = [['=C7/$C$7']];
  sheet.getRange('D7:D19').fillDown();
  styleStatement(sheet);
  return sheet;
}

function addMonthlyDetails(workbook, entry) {
  const t = translations[entry.language];
  const sheet = workbook.worksheets.add(t.details.slice(0, 31));
  sheet.getRange('A1:D1').values = [[t.month, t.monthlyRevenue, t.monthlyExpense, t.monthlyResult]];
  const start = new Date(`${entry.periodStart}T00:00:00Z`);
  const totalExpense =
    entry.expected.materialPurchases + entry.expected.payroll + entry.expected.otherOpex;
  const rows = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const weight = 0.76 + ((index * 7 + entry.businessId.length) % 9) * 0.06;
    return [date, entry.expected.revenue * weight, totalExpense * weight, null];
  });
  const revenueScale = entry.expected.revenue / rows.reduce((sum, row) => sum + Number(row[1]), 0);
  const expenseScale = totalExpense / rows.reduce((sum, row) => sum + Number(row[2]), 0);
  for (const row of rows) {
    row[1] = Math.round(Number(row[1]) * revenueScale * 100) / 100;
    row[2] = Math.round(Number(row[2]) * expenseScale * 100) / 100;
  }
  rows[11][1] =
    Math.round(
      (entry.expected.revenue - rows.slice(0, 11).reduce((s, r) => s + Number(r[1]), 0)) * 100,
    ) / 100;
  rows[11][2] =
    Math.round((totalExpense - rows.slice(0, 11).reduce((s, r) => s + Number(r[2]), 0)) * 100) /
    100;
  sheet.getRange('A2:D13').values = rows;
  sheet.getRange('D2').formulas = [['=B2-C2']];
  sheet.getRange('D2:D13').fillDown();
  sheet.getRange('A14:D14').values = [[t.annualCheck, null, null, null]];
  sheet.getRange('B14:D14').formulas = [['=SUM(B2:B13)', '=SUM(C2:C13)', '=SUM(D2:D13)']];
  sheet.getRange('A1:D1').format = {
    fill: palette.teal,
    font: { bold: true, color: palette.white },
  };
  sheet.getRange('A14:D14').format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white },
  };
  sheet.getRange('A2:A13').format.numberFormat = 'mmm yyyy';
  sheet.getRange('B2:D14').format.numberFormat = '#,##0.00 [$€-1]';
  sheet.getRange('A1:A14').format.columnWidth = 18;
  sheet.getRange('B1:D14').format.columnWidth = 23;
  sheet.getRange('A1:D14').format.borders = { bottom: { color: palette.border, style: 'thin' } };
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function addChecks(workbook, entry, statementName) {
  const t = translations[entry.language];
  const sheet = workbook.worksheets.add(t.checks.slice(0, 31));
  sheet.getRange('A1:D1').values = [[t.annualCheck, t.expected, t.calculated, t.difference]];
  sheet.getRange('A2:B4').values = [
    [t.revenue, entry.expected.revenue],
    [t.operating, entry.expected.operatingResult],
    [t.net, entry.expected.netResult],
  ];
  const escaped = statementName.replaceAll("'", "''");
  sheet.getRange('C2:C4').formulas = [
    [`='${escaped}'!C7`],
    [`='${escaped}'!C15`],
    [`='${escaped}'!C19`],
  ];
  sheet.getRange('D2').formulas = [['=C2-B2']];
  sheet.getRange('D2:D4').fillDown();
  sheet.getRange('A1:D1').format = {
    fill: palette.teal,
    font: { bold: true, color: palette.white },
  };
  sheet.getRange('B2:D4').format.numberFormat = '#,##0.00 [$€-1]';
  sheet.getRange('D2:D4').format.font = { bold: true, color: palette.red };
  sheet.getRange('A1:A4').format.columnWidth = 29;
  sheet.getRange('B1:D4').format.columnWidth = 22;
  return sheet;
}

async function verifyAndExport(workbook, entry) {
  const formulaErrors = await workbook.inspect({
    kind: 'match',
    searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
    options: { useRegex: true, maxResults: 100 },
    summary: `formula error scan for ${entry.id}`,
  });
  if (formulaErrors.ndjson && /#(?:REF|DIV\/0|VALUE|NAME|N\/A)/.test(formulaErrors.ndjson)) {
    throw new Error(`Formula error detected in ${entry.id}: ${formulaErrors.ndjson}`);
  }
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(path.join(outputDir, entry.fileName));
  for (const sheetInfo of await workbook
    .inspect({ kind: 'sheet', include: 'id,name' })
    .then((result) =>
      result.ndjson
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((line) => line.name),
    )) {
    const rendered = await workbook.render({
      sheetName: sheetInfo.name,
      autoCrop: 'all',
      scale: 1.35,
      format: 'png',
    });
    const safeName = sheetInfo.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    await fs.writeFile(
      path.join(verificationDir, `${entry.id}-${safeName}.png`),
      new Uint8Array(await rendered.arrayBuffer()),
    );
  }
}

async function createManifestWorkbook() {
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add('Corpus index');
  const header = [
    'ID',
    'Language',
    'Format',
    'Company size',
    'Period start',
    'Period end',
    'File',
    'Revenue',
    'Net result',
  ];
  const rows = manifest.cases.map((entry) => [
    entry.id,
    entry.language,
    entry.format,
    entry.size,
    new Date(`${entry.periodStart}T00:00:00Z`),
    new Date(`${entry.periodEnd}T00:00:00Z`),
    entry.fileName,
    entry.expected.revenue,
    entry.expected.netResult,
  ]);
  sheet.getRange(`A1:I${rows.length + 1}`).values = [header, ...rows];
  sheet.getRange('A1:I1').format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white },
  };
  sheet.getRange(`A2:I${rows.length + 1}`).format.borders = {
    bottom: { color: palette.border, style: 'thin' },
  };
  sheet.getRange(`E2:F${rows.length + 1}`).format.numberFormat = 'yyyy-mm-dd';
  sheet.getRange(`H2:I${rows.length + 1}`).format.numberFormat = '#,##0.00 [$€-1]';
  sheet.getRange('A1:A31').format.columnWidth = 36;
  sheet.getRange('B1:D31').format.columnWidth = 17;
  sheet.getRange('E1:F31').format.columnWidth = 16;
  sheet.getRange('G1:G31').format.columnWidth = 43;
  sheet.getRange('H1:I31').format.columnWidth = 20;
  sheet.freezePanes.freezeRows(1);
  const preview = await workbook.render({
    sheetName: 'Corpus index',
    autoCrop: 'all',
    scale: 1.1,
    format: 'png',
  });
  await fs.writeFile(
    path.join(verificationDir, 'corpus-manifest.png'),
    new Uint8Array(await preview.arrayBuffer()),
  );
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(path.join(outputDir, 'corpus-manifest.xlsx'));
}

await fs.mkdir(verificationDir, { recursive: true });
for (const entry of manifest.cases.filter(({ format }) => format.startsWith('xlsx'))) {
  const workbook = Workbook.create();
  const statement = addStatement(workbook, entry);
  if (entry.format === 'xlsx_multisheet') {
    addMonthlyDetails(workbook, entry);
    addChecks(workbook, entry, statement.name);
  }
  await verifyAndExport(workbook, entry);
}
await createManifestWorkbook();
console.log(`Generated and verified 6 XLSX reports plus the corpus index in ${outputDir}`);
