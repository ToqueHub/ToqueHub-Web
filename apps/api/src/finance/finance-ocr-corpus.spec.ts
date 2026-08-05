import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FinanceAccountCategory, FinanceProvider, FinanceReportKind } from '@prisma/client';
import { FinanceDocumentOcrService } from './finance-document-ocr.service';
import { FinanceImportParserService } from './finance-import-parser.service';

type CorpusCase = {
  id: string;
  language: 'fr' | 'en' | 'fi';
  format: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  expected: {
    revenue: number;
    materialPurchases: number;
    payroll: number;
    otherOpex: number;
    operatingResult: number;
    financial: number;
    tax: number;
    netResult: number;
  };
};

const corpusDir = join(__dirname, '../../test-fixtures/finance/accounting-reports');
const manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8')) as {
  cases: CorpusCase[];
};
const structuredCases = manifest.cases.filter(
  ({ fileName }) => fileName.endsWith('.xlsx') || fileName.endsWith('.csv'),
);

function totalByCategory(
  lines: NonNullable<
    Awaited<ReturnType<FinanceImportParserService['parse']>>['accountingDocument']
  >['lines'],
  category: FinanceAccountCategory,
) {
  return lines
    .filter((line) => line.includeInLedger && line.category === category)
    .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
}

describe('corpus OCR Finance multilingue', () => {
  it('contient exactement dix cas français, anglais et finnois', () => {
    expect(manifest.cases).toHaveLength(30);
    expect(
      manifest.cases.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.language] = (counts[entry.language] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ fr: 10, en: 10, fi: 10 });
    for (const entry of manifest.cases) {
      expect(() => readFileSync(join(corpusDir, entry.fileName))).not.toThrow();
    }
  });

  it.each(structuredCases)('normalise $id sans double compter les totaux', async (entry) => {
    const parsed = await new FinanceImportParserService().parse(
      entry.fileName,
      readFileSync(join(corpusDir, entry.fileName)),
      FinanceProvider.GENERIC,
      FinanceReportKind.ACCOUNTING,
    );
    const document = parsed.accountingDocument;
    expect(parsed.ready).toBe(true);
    expect(document?.language).toBe(entry.language);
    expect(parsed.periodStart?.toISOString().slice(0, 10)).toBe(entry.periodStart);
    expect(parsed.periodEnd?.toISOString().slice(0, 10)).toBe(entry.periodEnd);
    expect(totalByCategory(document!.lines, FinanceAccountCategory.REVENUE)).toBeCloseTo(
      entry.expected.revenue,
      2,
    );
    expect(totalByCategory(document!.lines, FinanceAccountCategory.MATERIAL_PURCHASES)).toBeCloseTo(
      entry.expected.materialPurchases,
      2,
    );
    expect(totalByCategory(document!.lines, FinanceAccountCategory.PAYROLL)).toBeCloseTo(
      entry.expected.payroll,
      2,
    );
    expect(totalByCategory(document!.lines, FinanceAccountCategory.OTHER_OPEX)).toBeCloseTo(
      entry.expected.otherOpex,
      2,
    );
    expect(totalByCategory(document!.lines, FinanceAccountCategory.FINANCIAL)).toBeCloseTo(
      entry.expected.financial,
      2,
    );
    expect(totalByCategory(document!.lines, FinanceAccountCategory.TAX)).toBeCloseTo(
      entry.expected.tax,
      2,
    );
    expect(document!.lines.some(({ includeInLedger }) => !includeInLedger)).toBe(true);
  });

  it('applique le multiplicateur OCR et garde les totaux calculés hors grand livre', async () => {
    const mistral = {
      ocrMarkdown: jest.fn().mockResolvedValue({
        markdown: '# Tuloslaskelma\nLiikevaihto 2 500,00 kEUR',
        pageCount: 2,
      }),
      chatJson: jest.fn().mockResolvedValue({
        language: 'fi',
        documentType: 'income_statement',
        companyName: 'Testi Ravintola Oy',
        businessId: '1234567-8',
        currency: 'EUR',
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
        unitMultiplier: 1000,
        confidence: 0.96,
        warnings: [],
        lines: [
          {
            code: '3000',
            label: 'Liikevaihto',
            category: FinanceAccountCategory.REVENUE,
            amount: 2500,
            debit: null,
            credit: null,
            includeInLedger: true,
          },
          {
            code: '6990',
            label: 'Liikevoitto',
            category: FinanceAccountCategory.OTHER,
            amount: 400,
            debit: null,
            credit: null,
            includeInLedger: false,
          },
        ],
      }),
    };
    const parsed = await new FinanceDocumentOcrService(mistral as never).parse('org-1', {
      fileName: 'scan-fi.pdf',
      buffer: Buffer.from('fixture'),
      mimeType: 'application/pdf',
    });
    expect(parsed.ready).toBe(true);
    expect(parsed.accountingDocument).toMatchObject({
      language: 'fi',
      unitMultiplier: 1000,
      pageCount: 2,
    });
    expect(parsed.accountingDocument?.lines[0].amount).toBe(2_500_000);
    expect(parsed.accountingDocument?.lines[1].includeInLedger).toBe(false);
  });
});
