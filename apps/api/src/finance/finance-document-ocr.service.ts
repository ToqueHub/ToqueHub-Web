import { BadRequestException, Injectable } from '@nestjs/common';
import { FinanceAccountCategory, Prisma } from '@prisma/client';
import { MistralClientService } from '../mistral/mistral-client.service';
import type {
  ParsedAccountingDocument,
  ParsedAccountingLine,
  ParsedFinanceImport,
} from './finance-import-parser.service';
import { FINANCE_DOCUMENT_EXTRACTION_SKILL, financeMistralOptions } from './finance-ai-skills';

const ACCOUNTING_CATEGORIES = [
  FinanceAccountCategory.REVENUE,
  FinanceAccountCategory.MATERIAL_PURCHASES,
  FinanceAccountCategory.PAYROLL,
  FinanceAccountCategory.OTHER_OPEX,
  FinanceAccountCategory.CASH,
  FinanceAccountCategory.FINANCIAL,
  FinanceAccountCategory.TAX,
  FinanceAccountCategory.OTHER,
] as const;

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'language',
    'documentType',
    'companyName',
    'currency',
    'periodStart',
    'periodEnd',
    'unitMultiplier',
    'lines',
    'confidence',
    'warnings',
  ],
  properties: {
    language: { type: 'string', enum: ['fr', 'en', 'fi', 'other'] },
    documentType: {
      type: 'string',
      enum: [
        'income_statement',
        'trial_balance',
        'general_ledger',
        'annual_accounts',
        'balance_sheet',
        'unknown',
      ],
    },
    companyName: { type: ['string', 'null'] },
    businessId: { type: ['string', 'null'] },
    currency: { type: 'string' },
    periodStart: { type: ['string', 'null'] },
    periodEnd: { type: ['string', 'null'] },
    unitMultiplier: { type: 'number', enum: [1, 1000, 1000000] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    warnings: { type: 'array', items: { type: 'string' } },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'label', 'category', 'amount', 'debit', 'credit', 'includeInLedger'],
        properties: {
          code: { type: ['string', 'null'] },
          label: { type: 'string' },
          category: { type: 'string', enum: ACCOUNTING_CATEGORIES },
          amount: { type: ['number', 'null'] },
          debit: { type: ['number', 'null'] },
          credit: { type: ['number', 'null'] },
          includeInLedger: { type: 'boolean' },
        },
      },
    },
  },
} as const;

type MistralAccountingExtraction = {
  language: ParsedAccountingDocument['language'];
  documentType: ParsedAccountingDocument['documentType'];
  companyName: string | null;
  businessId?: string | null;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  unitMultiplier: number;
  lines: Array<{
    code: string | null;
    label: string;
    category: FinanceAccountCategory;
    amount: number | null;
    debit: number | null;
    credit: number | null;
    includeInLedger: boolean;
  }>;
  confidence: number;
  warnings: string[];
};

const SYSTEM_PROMPT = `${FINANCE_DOCUMENT_EXTRACTION_SKILL}

Tu extrais des états comptables français, anglais et finnois pour ToqueHub.
Retourne les montants sans symbole monétaire selon la convention ToqueHub : revenus positifs et charges positives.
Une charge imprimée entre parenthèses ou avec un signe moins reste donc un montant économique positif, sauf si le
document indique explicitement une extourne ou un remboursement. Si le document possède des colonnes débit/crédit,
restitue-les séparément et ne déduis pas leur sens depuis la seule position visuelle.
Reconnais notamment : chiffre d'affaires/revenue/liikevaihto, achats/material purchases/aineet ja tarvikkeet,
salaires/payroll/henkilöstökulut, autres charges/other operating expenses/liiketoiminnan muut kulut,
trésorerie/cash/rahat ja pankkisaamiset, financier/financial/rahoitus et impôts/tax/verot.
Respecte l'unité imprimée : unités=1, milliers/kEUR/t€=1000, millions/MEUR/M€=1000000.
includeInLedger doit être vrai pour les lignes élémentaires. Il doit être faux pour les sous-totaux,
résultats calculés et totaux qui doubleraient leurs lignes détaillées. Si un document ne contient que des
totaux de grandes familles, marque ces totaux vrais afin qu'ils puissent être consolidés.
N'invente jamais une période ou un montant.`;

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLine(
  line: MistralAccountingExtraction['lines'][number],
  multiplier: number,
): ParsedAccountingLine | null {
  const label = String(line.label || '').trim();
  if (!label) return null;
  const debit = finite(line.debit);
  const credit = finite(line.credit);
  const amount = finite(line.amount);
  return {
    code: String(line.code || '').trim() || null,
    label,
    category: ACCOUNTING_CATEGORIES.includes(line.category)
      ? line.category
      : FinanceAccountCategory.OTHER,
    amount: amount == null ? null : amount * multiplier,
    debit: debit == null ? null : debit * multiplier,
    credit: credit == null ? null : credit * multiplier,
    includeInLedger: Boolean(line.includeInLedger),
  };
}

@Injectable()
export class FinanceDocumentOcrService {
  constructor(private readonly mistral: MistralClientService) {}

  async parse(
    organizationId: string,
    input: { fileName: string; buffer: Buffer; mimeType: string },
  ): Promise<ParsedFinanceImport> {
    const ocr = await this.mistral.ocrMarkdown(organizationId, {
      buffer: input.buffer,
      mimeType: input.mimeType,
      withAnnotation: true,
      documentAnnotationPrompt: SYSTEM_PROMPT,
      documentAnnotationFormat: EXTRACTION_SCHEMA,
    });
    if (!ocr.markdown.trim()) {
      throw new BadRequestException('Le document comptable ne contient aucun texte exploitable.');
    }
    const extracted = await this.mistral.chatJson<MistralAccountingExtraction>(
      organizationId,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Fichier : ${input.fileName}\nPages OCR : ${ocr.pageCount ?? 'inconnu'}\n\n${ocr.markdown.slice(0, 120000)}`,
        },
      ],
      'toquehub_accounting_document_v1',
      EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      {
        temperature: 0,
        fallbackToJsonObject: true,
        timeoutMs: 90_000,
        ...financeMistralOptions(),
      },
    );
    const multiplier = [1, 1000, 1_000_000].includes(Number(extracted.unitMultiplier))
      ? Number(extracted.unitMultiplier)
      : 1;
    const periodStart = validDate(extracted.periodStart);
    const periodEnd = validDate(extracted.periodEnd);
    const lines = (extracted.lines || [])
      .map((line) => normalizeLine(line, multiplier))
      .filter((line): line is ParsedAccountingLine => Boolean(line));
    const document: ParsedAccountingDocument = {
      language: extracted.language || 'other',
      documentType: extracted.documentType || 'unknown',
      companyName: extracted.companyName?.trim() || null,
      businessId: extracted.businessId?.trim() || null,
      currency: /^[A-Z]{3}$/.test(extracted.currency || '') ? extracted.currency : 'EUR',
      periodStart,
      periodEnd,
      unitMultiplier: multiplier,
      confidence: Math.max(0, Math.min(1, Number(extracted.confidence) || 0)),
      lines,
      pageCount: ocr.pageCount,
      ocrMarkdown: ocr.markdown.slice(0, 150000),
      warnings: (extracted.warnings || []).map(String).slice(0, 20),
    };
    const included = lines.filter(({ includeInLedger }) => includeInLedger);
    const warnings = [...document.warnings];
    if (!periodStart || !periodEnd) warnings.push('Période comptable à confirmer.');
    if (!included.length) warnings.push('Aucune ligne élémentaire consolidable détectée.');
    if (document.confidence < 0.72) warnings.push('Confiance OCR faible : contrôle humain requis.');
    return {
      ready: Boolean(periodStart && periodEnd && included.length && document.confidence >= 0.55),
      rows: [],
      periodStart,
      periodEnd,
      grossTotal: null,
      netTotal: null,
      vatTotal: null,
      warnings,
      metadata: {
        parser: 'mistral-accounting-ocr',
        parserVersion: 1,
        language: document.language,
        documentType: document.documentType,
        companyName: document.companyName,
        businessId: document.businessId,
        currency: document.currency,
        confidence: document.confidence,
        pageCount: document.pageCount,
        unitMultiplier: document.unitMultiplier,
        extractedLineCount: lines.length,
        includedLineCount: included.length,
        ocrMarkdown: document.ocrMarkdown,
      } satisfies Prisma.InputJsonObject,
      accountingDocument: document,
    };
  }
}
