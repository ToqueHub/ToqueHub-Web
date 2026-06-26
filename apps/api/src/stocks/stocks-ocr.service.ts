import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import {
  DocumentStatus,
  OcrBusinessExtractionStatus,
  OcrExtractionType,
  OcrProcessingStatus,
  Prisma,
  StockMovementType,
  StockReceptionLineMatchingStatus,
  StockReceptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveOcrCorrectionDto } from './dto/stocks-ocr.dto';

const OCR_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Second', 'Magasinier'];
const MAX_FILES = Number(process.env.OCR_MAX_FILES ?? 8);
const MAX_FILE_BYTES = Number(process.env.OCR_MAX_FILE_MB ?? 20) * 1024 * 1024;
const OCR_MODEL = process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest';
const OCR_PROVIDER = process.env.OCR_PROVIDER || 'mistral';
const STOCKS_OCR_UPLOAD_ROOT = resolve(process.env.STOCKS_OCR_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads', 'stocks-ocr');
const ACCEPTED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const ACCEPTED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.avif']);
const EXCLUDED_LINE_RE = /\b(total|tva|remise|consigne|transport|frais|port|sous-total|net a payer|net à payer|acompte)\b/i;
const LINE_HEADER_RE = /\b(d[eé]signation|libell[eé]|article|produit|r[eé]f|reference|quantit[eé]|qt[eé]|prix|montant|total|tva)\b/i;
const SUPPLIER_EXCLUDED_RE = /\b(code fournisseur|facture|invoice|bon de livraison|livraison|date|total|tva|client|adresse|siret|siren|iban|bic|tel|t[eé]l|email|mail|page|commande|numero|num[eé]ro|repr[eé]sentant|tourn[eé]e|compte|rue|avenue|av\.|zac|za\s|cs\s|cedex|moneteau|parcay|meslay|jou[eé]-les-tours|issy-les-moulineaux|capital|rcs|ape|maison retraite|ehpad|fay loges|pierre avezard|rocade)\b/i;

type Actor = { id: string; role: string };
type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type Tx = Prisma.TransactionClient;

interface ExtractedLine {
  label: string | null;
  reference: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  total: number | null;
  vatRate: number | null;
  lotNumber: string | null;
  bestBeforeDate: string | null;
}

interface ExtractedLineRow {
  source: string;
  labelSource?: string;
  reference?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  total?: number | null;
  lotNumber?: string | null;
  bestBeforeDate?: string | null;
}

interface BusinessExtraction {
  documentType: 'invoice' | 'delivery_note' | 'unknown';
  supplier: {
    name: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    matchingStatus?: StockReceptionLineMatchingStatus;
    matchingScore?: number;
    candidates?: Array<{ id: string; name: string; score: number }>;
  };
  supplierId?: string | null;
  supplierName?: string | null;
  supplierMatchingStatus?: StockReceptionLineMatchingStatus;
  supplierMatchingScore?: number;
  supplierCandidates?: Array<{ id: string; name: string; score: number }>;
  document: {
    invoiceNumber: string | null;
    deliveryNoteNumber: string | null;
    purchaseOrderNumber: string | null;
    documentDate: string | null;
    deliveryDate: string | null;
  };
  totals: {
    totalExcludingTax: number | null;
    totalTax: number | null;
    totalIncludingTax: number | null;
  };
  lines: ExtractedLine[];
}

@Injectable()
export class StocksOcrService {
  private readonly logger = new Logger(StocksOcrService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertOcr(actor: Actor) {
    if (!OCR_ROLES.includes(actor.role)) throw new ForbiddenException('Droits OCR Stocks insuffisants');
  }

  private async assertOcrConfigured(organizationId: string) {
    if (OCR_PROVIDER !== 'mistral') throw new BadRequestException('Provider OCR non configuré');
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Configuration OCR absente');
  }

  async getOcrConfig(organizationId: string, actor: Actor) {
    this.assertOcr(actor);
    const apiKey = await this.resolveMistralApiKey(organizationId);
    return {
      provider: OCR_PROVIDER,
      model: OCR_MODEL,
      configured: Boolean(apiKey),
      source: apiKey && (process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY) === apiKey ? 'environment' : apiKey ? 'organization' : null,
    };
  }

  async uploadDocuments(organizationId: string, actor: Actor, files: UploadedFile[]) {
    this.assertOcr(actor);
    if (!files?.length) throw new BadRequestException('Aucun fichier fourni');
    if (files.length > MAX_FILES) throw new BadRequestException(`Vous pouvez importer ${MAX_FILES} fichiers maximum.`);
    const documents = [];
    for (const file of files) {
      this.validateFile(file);
      const id = randomUUID();
      const ext = this.safeExtension(file);
      const relativePath = join(organizationId, `${id}${ext}`);
      const absolutePath = join(STOCKS_OCR_UPLOAD_ROOT, relativePath);
      await mkdir(join(STOCKS_OCR_UPLOAD_ROOT, organizationId), { recursive: true });
      await writeFile(absolutePath, file.buffer);
      const document = await this.prisma.document.create({
        data: {
          organizationId,
          uploadedById: actor.id,
          internalFilename: `${id}${ext}`,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: relativePath,
          sourceModule: 'stocks',
          sourceType: 'ocr-reception',
          status: DocumentStatus.UPLOADED,
        },
      });
      documents.push(document);
    }
    return { documents };
  }

  async getDocumentForDownload(organizationId: string, actor: Actor, documentId: string) {
    this.assertOcr(actor);
    const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new NotFoundException('Document introuvable');
    return { document, absolutePath: join(STOCKS_OCR_UPLOAD_ROOT, document.storagePath) };
  }

  async analyzeDocument(organizationId: string, actor: Actor, documentId: string) {
    this.assertOcr(actor);
    await this.assertOcrConfigured(organizationId);
    const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new NotFoundException('Document introuvable');
    const ocr = await this.prisma.ocrDocument.upsert({
      where: { documentId },
      update: { status: OcrProcessingStatus.PENDING, errorCode: null, errorMessage: null },
      create: { organizationId, documentId, provider: OCR_PROVIDER, model: OCR_MODEL, status: OcrProcessingStatus.PENDING },
    });
    void this.processOcr(organizationId, actor, document.id, ocr.id);
    return { documentId: document.id, ocrDocumentId: ocr.id, status: OcrProcessingStatus.PENDING };
  }

  async analyzeBatch(organizationId: string, actor: Actor, documentIds: string[]) {
    if (!documentIds?.length) throw new BadRequestException('Aucun document fourni');
    if (documentIds.length > MAX_FILES) throw new BadRequestException(`Vous pouvez analyser ${MAX_FILES} fichiers maximum.`);
    const jobs = [];
    for (const documentId of documentIds) jobs.push(await this.analyzeDocument(organizationId, actor, documentId));
    return { jobs };
  }

  async getStatus(organizationId: string, actor: Actor, documentId: string) {
    this.assertOcr(actor);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: { ocrDocuments: { include: { extractions: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    const ocr = document.ocrDocuments[0] ?? null;
    return {
      document,
      ocr,
      extraction: ocr?.extractions[0] ?? null,
      state: this.uiState(document.status, ocr?.status, ocr?.extractions[0]?.id),
    };
  }

  async getExtraction(organizationId: string, actor: Actor, extractionId: string) {
    this.assertOcr(actor);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({
      where: { id: extractionId, organizationId },
      include: { ocrDocument: { include: { document: true } } },
    });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    return this.formatExtraction(extraction);
  }

  async saveCorrections(organizationId: string, actor: Actor, extractionId: string, dto: SaveOcrCorrectionDto) {
    this.assertOcr(actor);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({ where: { id: extractionId, organizationId } });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    const corrected = this.normalizeCorrectionPayload(dto);
    const updated = await this.prisma.ocrBusinessExtraction.update({
      where: { id: extraction.id },
      data: { correctedJson: corrected as Prisma.InputJsonValue, status: OcrBusinessExtractionStatus.REVIEWED },
      include: { ocrDocument: { include: { document: true } } },
    });
    return this.formatExtraction(updated);
  }

  async createReceptionFromExtraction(organizationId: string, actor: Actor, extractionId: string, dto: SaveOcrCorrectionDto) {
    this.assertOcr(actor);
    const extraction = await this.prisma.ocrBusinessExtraction.findFirst({
      where: { id: extractionId, organizationId },
      include: { ocrDocument: { include: { document: true } } },
    });
    if (!extraction) throw new NotFoundException('Extraction introuvable');
    if (dto.supplierId) await this.ensureSupplier(organizationId, dto.supplierId);
    if (dto.siteId) await this.ensureSite(organizationId, dto.siteId);
    if (dto.locationId) await this.ensureLocation(organizationId, dto.locationId);
    const corrected = this.normalizeCorrectionPayload(dto);
    const lines = corrected.lines.filter((line) => !line.ignored);
    if (!lines.length) throw new BadRequestException('Aucune ligne à réceptionner');
    for (const line of lines) {
      if (!line.productId) throw new BadRequestException('Chaque ligne validée doit être associée à un produit.');
      if (line.quantity == null || line.quantity <= 0) throw new BadRequestException('Chaque ligne validée doit avoir une quantité strictement positive.');
      if (!line.unitId && !line.unit) throw new BadRequestException('Chaque ligne validée doit avoir une unité.');
    }
    const reception = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockReception.create({
        data: {
          organizationId,
          supplierId: corrected.supplierId,
          supplierName: corrected.supplierName,
          documentId: extraction.ocrDocument.documentId,
          extractionId: extraction.id,
          invoiceNumber: corrected.invoiceNumber,
          deliveryNoteNumber: corrected.deliveryNoteNumber,
          purchaseOrderNumber: corrected.purchaseOrderNumber,
          documentDate: corrected.documentDate ? new Date(corrected.documentDate) : null,
          deliveryDate: corrected.deliveryDate ? new Date(corrected.deliveryDate) : null,
          totalExcludingTax: this.decimalOrNull(corrected.totalExcludingTax),
          totalTax: this.decimalOrNull(corrected.totalTax),
          totalIncludingTax: this.decimalOrNull(corrected.totalIncludingTax),
          status: StockReceptionStatus.VALIDATED,
          createdById: actor.id,
          siteId: corrected.siteId,
          locationId: corrected.locationId,
          validatedAt: new Date(),
        },
      });
      for (const line of lines) {
        const product = await tx.product.findFirst({ where: { id: line.productId!, organizationId, isArchived: false }, include: { unit: true } });
        if (!product) throw new BadRequestException('Produit introuvable sur une ligne de réception.');
        const unit = line.unitId ? await tx.unit.findFirst({ where: { id: line.unitId, organizationId } }) : product.unit;
        if (!unit) throw new BadRequestException('Unité introuvable sur une ligne de réception.');
        const lot = line.lotNumber || line.bestBeforeDate
          ? await tx.lot.upsert({
              where: { organizationId_lotNumber_productId: { organizationId, lotNumber: line.lotNumber || `OCR-${created.id}-${product.id}`, productId: product.id } },
              update: { supplierId: corrected.supplierId, expiresAt: line.bestBeforeDate ? new Date(line.bestBeforeDate) : undefined, siteId: corrected.siteId, locationId: corrected.locationId },
              create: { organizationId, productId: product.id, supplierId: corrected.supplierId, lotNumber: line.lotNumber || `OCR-${created.id}-${product.id}`, expiresAt: line.bestBeforeDate ? new Date(line.bestBeforeDate) : undefined, siteId: corrected.siteId, locationId: corrected.locationId },
            })
          : null;
        const quantity = await this.convertToProductUnitTx(tx, organizationId, unit.id, product.unitId, line.quantity!);
        const receptionLine = await tx.stockReceptionLine.create({
          data: {
            receptionId: created.id,
            productId: product.id,
            ocrLabel: line.ocrLabel || product.name,
            reference: line.reference,
            quantity: this.decimalOrNull(line.quantity),
            unit: line.unit,
            unitId: unit.id,
            unitPrice: this.decimalOrNull(line.unitPrice),
            lineTotal: this.decimalOrNull(line.lineTotal),
            vatRate: this.decimalOrNull(line.vatRate),
            lotNumber: line.lotNumber,
            bestBeforeDate: line.bestBeforeDate ? new Date(line.bestBeforeDate) : null,
            matchingStatus: line.matchingStatus,
            matchingScore: this.decimalOrNull(line.matchingScore),
            userCorrection: line as Prisma.InputJsonValue,
            lotId: lot?.id,
          },
        });
        await this.applyStock(tx, organizationId, product.id, lot?.id, corrected.siteId, corrected.locationId, quantity);
        await this.updateProductAveragePriceFromReceptionLineTx(tx, product.id, quantity, line);
        await tx.stockMovement.create({
          data: {
            organizationId,
            productId: product.id,
            lotId: lot?.id,
            supplierId: corrected.supplierId,
            type: StockMovementType.RECEPTION,
            quantity,
            inputQuantity: new Prisma.Decimal(line.quantity!),
            unitId: unit.id,
            unitSymbolSnapshot: unit.symbol,
            reason: `Réception OCR ${corrected.invoiceNumber || corrected.deliveryNoteNumber || extraction.ocrDocument.document.originalName}`,
            destinationSiteId: corrected.siteId,
            destinationLocationId: corrected.locationId,
            movementDate: corrected.deliveryDate ? new Date(corrected.deliveryDate) : new Date(),
            createdById: actor.id,
            stockReceptionLineId: receptionLine.id,
          },
        });
      }
      await tx.ocrBusinessExtraction.update({
        where: { id: extraction.id },
        data: { correctedJson: corrected as Prisma.InputJsonValue, status: OcrBusinessExtractionStatus.VALIDATED },
      });
      return tx.stockReception.findUnique({
        where: { id: created.id },
        include: { lines: { include: { product: { include: { unit: true } }, movements: true, lot: true } }, supplier: true, document: true, extraction: true },
      });
    });
    return reception;
  }

  private async processOcr(organizationId: string, actor: Actor, documentId: string, ocrDocumentId: string) {
    const started = Date.now();
    try {
      const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
      if (!document) throw new NotFoundException('Document introuvable');
      await this.prisma.document.update({ where: { id: document.id }, data: { status: DocumentStatus.PROCESSING } });
      await this.prisma.ocrDocument.update({ where: { id: ocrDocumentId }, data: { status: OcrProcessingStatus.PROCESSING } });
      const result = await this.callMistral(organizationId, document);
      const rawText = this.rawTextFromOcr(result.rawJson);
      const updatedOcr = await this.prisma.ocrDocument.update({
        where: { id: ocrDocumentId },
        data: {
          status: OcrProcessingStatus.COMPLETED,
          rawText,
          rawMarkdown: result.markdown,
          rawJson: result.rawJson as Prisma.InputJsonValue,
          pageCount: result.pageCount,
          processingDurationMs: result.durationMs,
        },
      });
      const extracted = await this.extractBusinessData(organizationId, result.markdown || rawText);
      const extraction = await this.prisma.ocrBusinessExtraction.create({
        data: {
          organizationId,
          ocrDocumentId: updatedOcr.id,
          type: extracted.documentType === 'invoice' ? OcrExtractionType.INVOICE : extracted.documentType === 'delivery_note' ? OcrExtractionType.DELIVERY_NOTE : OcrExtractionType.UNKNOWN,
          extractedJson: extracted as unknown as Prisma.InputJsonValue,
          confidenceScore: this.decimalOrNull(this.confidenceForExtraction(extracted)),
        },
      });
      await this.prisma.document.update({ where: { id: document.id }, data: { status: DocumentStatus.PROCESSED, sourceId: extraction.id } });
      this.logger.log(`OCR stocks terminé document=${document.id} org=${organizationId} user=${actor.id} pages=${result.pageCount ?? 0} durée=${Date.now() - started}ms lignes=${extracted.lines.length}`);
    } catch (error: any) {
      const message = error?.message || 'Erreur OCR';
      await this.prisma.ocrDocument.update({ where: { id: ocrDocumentId }, data: { status: OcrProcessingStatus.FAILED, errorCode: error?.code || 'OCR_FAILED', errorMessage: message, processingDurationMs: Date.now() - started } }).catch(() => undefined);
      await this.prisma.document.update({ where: { id: documentId }, data: { status: DocumentStatus.FAILED } }).catch(() => undefined);
      this.logger.error(`OCR stocks échoué document=${documentId} org=${organizationId}: ${message}`);
    }
  }

  private async callMistral(organizationId: string, document: { storagePath: string; mimeType: string; sizeBytes: number; id: string }) {
    if (OCR_PROVIDER !== 'mistral') throw new BadRequestException('Provider OCR non configuré');
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Configuration OCR absente');
    const started = Date.now();
    const buffer = await readFile(join(STOCKS_OCR_UPLOAD_ROOT, document.storagePath));
    const mimeType = this.mimeForDocument(document.mimeType, document.storagePath);
    const isPdf = mimeType === 'application/pdf';
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const body = {
      model: OCR_MODEL,
      document: isPdf ? { type: 'document_url', document_url: dataUrl } : { type: 'image_url', image_url: dataUrl },
      include_image_base64: false,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.OCR_TIMEOUT_MS ?? 60_000));
    try {
      const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new BadRequestException('Le document n’a pas pu être analysé. Vérifiez qu’il est lisible et réessayez.');
      const pages = Array.isArray((json as any).pages) ? (json as any).pages : [];
      return {
        rawJson: json,
        markdown: pages.map((page: any) => page.markdown).filter(Boolean).join('\n\n'),
        pageCount: pages.length || (json as any).usage_info?.pages_processed || null,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async extractBusinessData(organizationId: string, markdown: string): Promise<BusinessExtraction> {
    const text = markdown || '';
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const supplierName = this.extractSupplier(lines);
    const supplierMatch = await this.matchSupplier(organizationId, supplierName, lines);
    const totals = this.extractTotals(text);
    const extraction: BusinessExtraction = {
      documentType: /\bfacture\b/i.test(text) ? 'invoice' : /\b(bon de livraison|bl\b|livraison)\b/i.test(text) ? 'delivery_note' : 'unknown',
      supplier: {
        name: supplierName,
        supplierId: supplierMatch.supplierId,
        supplierName: supplierMatch.supplierName,
        matchingStatus: supplierMatch.matchingStatus,
        matchingScore: supplierMatch.matchingScore,
        candidates: supplierMatch.candidates,
      },
      supplierId: supplierMatch.supplierId,
      supplierName: supplierMatch.supplierName || supplierName,
      supplierMatchingStatus: supplierMatch.matchingStatus,
      supplierMatchingScore: supplierMatch.matchingScore,
      supplierCandidates: supplierMatch.candidates,
      document: {
        invoiceNumber: this.extractInvoiceNumber(text),
        deliveryNoteNumber: this.extractDeliveryNoteNumber(text),
        purchaseOrderNumber: this.extractPurchaseOrderNumber(text),
        documentDate: this.extractDocumentDate(text),
        deliveryDate: this.extractDeliveryDate(text),
      },
      totals,
      lines: [],
    };
    extraction.lines = this.extractLines(lines);
    const matched = await this.matchLines(organizationId, extraction.lines, supplierMatch.supplierId);
    return { ...extraction, lines: matched };
  }

  private extractLines(lines: string[]) {
    const tableRows = this.extractTableRows(lines);
    const productTableRows = tableRows.filter((row) => row.labelSource && row.quantity != null && /[a-zA-ZÀ-ÿ]/.test(row.labelSource));
    const plainRows: ExtractedLineRow[] = productTableRows.length ? [] : lines.filter((line) => !line.includes('|')).map((source) => ({ source }));
    const candidates = [...productTableRows, ...plainRows].filter((row) => !EXCLUDED_LINE_RE.test(row.source) && /\d/.test(row.source) && row.source.length > 4);
    const seen = new Set<string>();
    return candidates.map((row) => {
      const line = row.source;
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
      const source = cells.length >= 3 ? cells.join(' ') : line;
      const labelSource = row.labelSource || this.bestLabelSource(cells, source);
      const numbers = [...source.matchAll(/(?:^|\s)([0-9]+(?:[.,][0-9]{1,4})?)(?:\s|€|$)/g)].map((match) => this.parseFrenchNumber(match[1])).filter((value): value is number => value != null);
      const quantityMatch = source.match(/([0-9]+(?:[.,][0-9]{1,3})?)\s*(kg|g|l|ml|pi[eè]ce?s?|pcs?|cartons?|caisse?s?|barquettes?|colis|u)\b/i);
      const dateMatch = source.match(/([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/);
      const unitPrice = row.labelSource ? row.unitPrice ?? null : row.unitPrice ?? (numbers.length >= 2 ? numbers[numbers.length - 2] : null);
      const total = row.labelSource ? row.total ?? null : row.total ?? (numbers.length >= 1 ? numbers[numbers.length - 1] : null);
      const quantity = row.quantity ?? (quantityMatch ? this.parseFrenchNumber(quantityMatch[1]) : numbers[0] ?? null);
      const unit = row.unit ?? quantityMatch?.[2] ?? null;
      const label = (row.labelSource ? labelSource.replace(/[#|]/g, ' ') : labelSource
        .replace(/[#|]/g, ' ')
        .replace(/[0-9]+(?:[.,][0-9]+)?\s*(kg|g|l|ml|pi[eè]ce?s?|pcs?|cartons?|caisse?s?|barquettes?|colis|u)\b/ig, ' ')
        .replace(/[0-9\s.,]+€?/g, ' ')
        .replace(/\b(ref|r[eé]f|reference|lot)\s*[:#-]?\s*[A-Z0-9-_/]+\b/ig, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (!label || label.length < 3) return null;
      const dedupeKey = this.normalize(`${label} ${quantity ?? ''} ${total ?? ''}`);
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      return {
        label: label || null,
        reference: row.reference ?? this.extractAfter(source, /(ref|réf|reference)\s*[:#-]?\s*([A-Z0-9-_/]+)/i, 2),
        quantity,
        unit,
        unitPrice,
        total,
        vatRate: this.extractMoney(source, /([0-9]+(?:[.,][0-9]+)?)\s*%/i),
        lotNumber: row.lotNumber ?? this.extractAfter(source, /(lot)\s*[:#-]?\s*([A-Z0-9-_/]+)/i, 2),
        bestBeforeDate: row.bestBeforeDate ?? (dateMatch ? this.normalizeDate(dateMatch[1]) : null),
      };
    }).filter((line): line is ExtractedLine => Boolean(line?.label)).slice(0, 80);
  }

  private extractTableRows(lines: string[]) {
    const rows: ExtractedLineRow[] = [];
    let headers: string[] = [];
    for (const line of lines) {
      if (!line.includes('|')) continue;
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
      if (cells.length < 3 || cells.every((cell) => /^[-: ]+$/.test(cell))) continue;
      if (cells.some((cell) => LINE_HEADER_RE.test(cell)) && cells.filter((cell) => /\d/.test(cell)).length <= 1) {
        headers = cells.map((cell) => this.normalize(cell));
        continue;
      }
      const source = cells.join(' ');
      if (/^\d+\/?$/.test(cells[0]) && /^[A-Z0-9-_/]{3,}$/.test(cells[1] || '') && /[a-zA-ZÀ-ÿ]/.test(cells[2] || '')) {
        const delivered = this.parseQuantityAndUnit(cells[3]);
        const billed = this.parseQuantityAndUnit(cells[4]);
        const priceIndex = billed.unit ? 5 : 6;
        rows.push({
          source,
          labelSource: cells[2],
          reference: cells[1],
          quantity: billed.quantity ?? delivered.quantity,
          unit: billed.unit || (/^[A-Za-zÀ-ÿ]+$/.test(cells[5] || '') ? cells[5] : delivered.unit),
          unitPrice: this.parseFrenchNumber(cells[priceIndex] || ''),
          total: this.parseFrenchNumber(cells[cells.length - 1] || ''),
        });
        continue;
      }
      const byHeader = (patterns: RegExp[]) => {
        const idx = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
        return idx >= 0 ? cells[idx] : undefined;
      };
      const labelSource = byHeader([/designation|libelle|article|produit/]) || this.bestLabelSource(cells, source);
      const quantityCell = byHeader([/quantite|qte|qt/]);
      const priceCell = byHeader([/prix|pu|p u/]);
      const totalCell = byHeader([/montant|total|net/]);
      const quantityMatch = quantityCell?.match(/([0-9]+(?:[.,][0-9]{1,3})?)\s*([a-zA-Zéè]+)?/);
      if (/article item|article/.test(headers[0] || '') && /designation|description/.test(headers.join(' ')) && /^\d{4,}$/.test(cells[0] || '')) {
        const shippedCell = cells[cells.length - 1] || '';
        const shipped = shippedCell.match(/([0-9]+(?:[.,][0-9]{1,3})?)/);
        const lotParts = (cells[3] || '').match(/^([A-Z0-9-_/]+)?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})?/i);
        rows.push({
          source,
          labelSource: cells[2],
          reference: cells[0],
          quantity: shipped ? this.parseFrenchNumber(shipped[1]) : null,
          unit: 'PU',
          lotNumber: lotParts?.[1] || null,
          bestBeforeDate: lotParts?.[2] ? this.normalizeDate(lotParts[2]) : null,
        });
        continue;
      }
      rows.push({
        source,
        labelSource,
        reference: byHeader([/code art|code|reference|ref/]),
        quantity: quantityMatch ? this.parseFrenchNumber(quantityMatch[1]) : null,
        unit: quantityMatch?.[2] || byHeader([/unit|unite|uv|uc/]) || null,
        unitPrice: priceCell ? this.parseFrenchNumber(priceCell) : null,
        total: totalCell ? this.parseFrenchNumber(totalCell) : null,
      });
    }
    return rows;
  }

  private parseQuantityAndUnit(value?: string) {
    const match = value?.match(/([0-9]+(?:[.,][0-9]{1,3})?)\s*([a-zA-ZÀ-ÿ]+)?/);
    return { quantity: match ? this.parseFrenchNumber(match[1]) : null, unit: match?.[2] || null };
  }

  private bestLabelSource(cells: string[], fallback: string) {
    const usefulCells = cells.filter((cell) => {
      const normalized = this.normalize(cell);
      if (!normalized || LINE_HEADER_RE.test(cell) || EXCLUDED_LINE_RE.test(cell)) return false;
      if (/^[0-9\s.,€%/-]+$/.test(cell)) return false;
      return /[a-zA-ZÀ-ÿ]/.test(cell);
    });
    return usefulCells.sort((a, b) => b.length - a.length)[0] || fallback;
  }

  private async matchLines(organizationId: string, lines: ExtractedLine[], supplierId?: string | null) {
    const products = await this.prisma.product.findMany({ where: { organizationId, isArchived: false }, include: { unit: true, category: true, primarySupplier: true } });
    return lines.map((line) => {
      const ranked = products
        .map((product) => ({ product, score: this.productMatchScore(line, product, supplierId) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const status = !best || best.score < 0.58 ? StockReceptionLineMatchingStatus.NOT_FOUND : best.score >= 0.84 ? StockReceptionLineMatchingStatus.RECOGNIZED : StockReceptionLineMatchingStatus.NEEDS_REVIEW;
      return {
        ...line,
        productId: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.id,
        productName: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.name,
        unitId: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.unitId,
        matchedUnitSymbol: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.product.unit.symbol,
        matchingScore: best?.score ?? 0,
        matchingStatus: status,
        productCandidates: ranked.slice(0, 8).filter((candidate) => candidate.score >= 0.38).map((candidate) => ({
          id: candidate.product.id,
          name: candidate.product.name,
          sku: candidate.product.sku,
          categoryId: candidate.product.categoryId,
          categoryName: candidate.product.category?.name,
          unitId: candidate.product.unitId,
          unitSymbol: candidate.product.unit.symbol,
          supplierId: candidate.product.primarySupplierId,
          supplierName: candidate.product.primarySupplier?.name,
          score: candidate.score,
        })),
      };
    });
  }

  private productMatchScore(line: ExtractedLine, product: { name: string; sku?: string | null; primarySupplierId?: string | null }, supplierId?: string | null) {
    const label = line.label || '';
    const cleanedLabel = this.normalizeProductText(label);
    const cleanedProduct = this.normalizeProductText(product.name);
    const base = this.matchScore(cleanedLabel || label, cleanedProduct || product.name, product.sku || undefined);
    const tokenScore = this.tokenSimilarity(cleanedLabel, cleanedProduct);
    const sku = product.sku ? this.normalize(product.sku) : '';
    const reference = line.reference ? this.normalize(line.reference) : '';
    let score = Math.max(base, tokenScore);
    if (sku && reference && sku === reference) score = Math.max(score, 0.99);
    else if (sku && reference && (sku.includes(reference) || reference.includes(sku))) score = Math.max(score, 0.94);
    else if (sku && this.normalize(label).includes(sku)) score = Math.max(score, 0.94);
    if (supplierId && product.primarySupplierId === supplierId) score += 0.04;
    if (line.unit && cleanedProduct.includes(this.normalizeProductUnit(line.unit))) score += 0.02;
    return Math.min(1, score);
  }

  private async matchSupplier(organizationId: string, extractedName: string | null, lines: string[]) {
    const suppliers = await this.prisma.supplier.findMany({ where: { organizationId, isArchived: false } });
    const supplierCandidates = this.supplierCandidates(extractedName, lines);
    const ranked = suppliers
      .map((supplier) => {
        const score = Math.max(...supplierCandidates.map((candidate) => this.matchScore(candidate, supplier.name)), 0);
        return { supplier, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const status = !best || best.score < 0.68 ? StockReceptionLineMatchingStatus.NOT_FOUND : best.score >= 0.86 ? StockReceptionLineMatchingStatus.RECOGNIZED : StockReceptionLineMatchingStatus.NEEDS_REVIEW;
    return {
      supplierId: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.supplier.id,
      supplierName: status === StockReceptionLineMatchingStatus.NOT_FOUND ? null : best.supplier.name,
      matchingStatus: status,
      matchingScore: best?.score ?? 0,
      candidates: ranked.slice(0, 3).filter((candidate) => candidate.score >= 0.45).map((candidate) => ({ id: candidate.supplier.id, name: candidate.supplier.name, score: candidate.score })),
    };
  }

  private matchScore(label: string, productName: string, sku?: string) {
    const a = this.normalize(label);
    const b = this.normalize(productName);
    if (!a || !b) return 0;
    if (sku && a.includes(this.normalize(sku))) return 0.95;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    const ta = new Set(a.split(' ').filter((token) => token.length > 2));
    const tb = new Set(b.split(' ').filter((token) => token.length > 2));
    const common = [...ta].filter((token) => tb.has(token)).length;
    const dice = common ? (2 * common) / (ta.size + tb.size) : 0;
    return Math.max(dice, 1 - this.levenshtein(a, b) / Math.max(a.length, b.length, 1));
  }

  private tokenSimilarity(a: string, b: string) {
    const ta = new Set(this.productTokens(a));
    const tb = new Set(this.productTokens(b));
    if (!ta.size || !tb.size) return 0;
    const common = [...ta].filter((token) => tb.has(token)).length;
    const coverage = common / Math.min(ta.size, tb.size);
    const dice = (2 * common) / (ta.size + tb.size);
    return Math.max(dice, coverage * 0.92);
  }

  private normalizeProductText(value: string) {
    return this.normalize(value)
      .replace(/\b(?:lot|dlc|ddm|prix|total|montant|tva|ht|ttc|net|brut|colis|carton|cartons|pieces|piece|unite|unites|kg|kgs|g|gr|l|litre|litres|ml|cl|x)\b/g, ' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|l|ml|cl|pc|pcs|u|x)\b/g, ' ')
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeProductUnit(value: string) {
    const unit = this.normalize(value);
    if (['pu', 'u', 'unite', 'unites', 'piece', 'pieces', 'pc', 'pcs'].includes(unit)) return 'piece';
    if (['col', 'colis', 'carton', 'cartons', 'caisse'].includes(unit)) return 'carton';
    return unit;
  }

  private productTokens(value: string) {
    return this.normalizeProductText(value).split(' ').filter((token) => token.length > 2 && !/^\d+$/.test(token));
  }

  private supplierCandidates(extractedName: string | null, lines: string[]) {
    const candidates = new Set<string>();
    if (extractedName) candidates.add(extractedName);
    for (const line of lines.slice(0, 24)) {
      const clean = line.replace(/[|#]/g, ' ').replace(/\s+/g, ' ').trim();
      if (/^!\[.*\]\(.*\)$/.test(line) || /^#+\s*/.test(line)) continue;
      if (clean.length < 4 || clean.length > 90) continue;
      if (SUPPLIER_EXCLUDED_RE.test(clean)) continue;
      if (/^[0-9\s.,€%/-]+$/.test(clean)) continue;
      if (!/[a-zA-ZÀ-ÿ]/.test(clean)) continue;
      candidates.add(clean);
    }
    return [...candidates].slice(0, 20);
  }

  private normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private levenshtein(a: string, b: string) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return dp[a.length][b.length];
  }

  private validateFile(file: UploadedFile) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException('Le fichier dépasse la taille maximale autorisée.');
    const ext = extname(file.originalname).toLowerCase();
    const mimeAccepted = ACCEPTED_MIME.has(file.mimetype) || (!file.mimetype && ACCEPTED_EXT.has(ext)) || (file.mimetype === 'application/octet-stream' && ACCEPTED_EXT.has(ext));
    if (!mimeAccepted || !ACCEPTED_EXT.has(ext)) throw new BadRequestException('Format non supporté. Utilisez PDF, PNG, JPEG, WEBP, HEIC, HEIF ou AVIF.');
  }

  private safeExtension(file: UploadedFile) {
    const ext = extname(file.originalname).toLowerCase();
    if (ext === '.jpeg') return '.jpg';
    return ext;
  }

  private mimeForDocument(mimeType: string, storagePath: string) {
    if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
    const ext = extname(storagePath).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.heic') return 'image/heic';
    if (ext === '.heif') return 'image/heif';
    if (ext === '.avif') return 'image/avif';
    return mimeType || 'application/octet-stream';
  }

  private async resolveMistralApiKey(organizationId: string) {
    const envKey = process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY;
    if (envKey) return envKey;
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { mistralApiKey: true } });
    return organization?.mistralApiKey?.trim() || null;
  }

  private uiState(documentStatus: DocumentStatus, ocrStatus?: OcrProcessingStatus, extractionId?: string) {
    if (documentStatus === DocumentStatus.FAILED || ocrStatus === OcrProcessingStatus.FAILED) return 'erreur';
    if (extractionId) return 'prêt à vérifier';
    if (ocrStatus === OcrProcessingStatus.COMPLETED) return 'matching produits';
    if (ocrStatus === OcrProcessingStatus.PROCESSING) return 'OCR en cours';
    if (ocrStatus === OcrProcessingStatus.PENDING) return 'en attente';
    return 'upload';
  }

  private rawTextFromOcr(raw: any) {
    const pages = Array.isArray(raw?.pages) ? raw.pages : [];
    return pages.map((page: any) => page.markdown || page.text).filter(Boolean).join('\n\n');
  }

  private extractSupplier(lines: string[]) {
    const explicit = lines
      .map((line) => line.match(/^(?:fournisseur|vendeur|supplier)\s*[:#-]\s*([^\n|]{3,90})$/i)?.[1]?.trim())
      .find((value): value is string => Boolean(value));
    if (explicit && !SUPPLIER_EXCLUDED_RE.test(explicit)) return explicit;
    const candidates = this.supplierCandidates(null, lines);
    return candidates
      .map((candidate, index) => ({ candidate, score: this.supplierLineScore(candidate) - index * 0.08 }))
      .sort((a, b) => b.score - a.score)[0]?.candidate || null;
  }

  private supplierLineScore(line: string) {
    let score = 0;
    if (/passion\s*froid|passionfroid/i.test(line)) score += 4;
    if (/^groupe\b/i.test(line)) score -= 1;
    if (/^[A-Z0-9 &.'-]{4,80}$/.test(line)) score += 2;
    if (/\b(sas|sarl|sa|eurl|ets|groupe|distribution|grossiste|primeur|viande|boucherie|mar[eé]e|frais)\b/i.test(line)) score += 2;
    if (/[a-zA-ZÀ-ÿ]{4,}/.test(line)) score += 1;
    score -= Math.max(0, line.length - 60) / 30;
    return score;
  }

  private extractAfter(text: string, regex: RegExp, index = 3) {
    const match = text.match(regex);
    return match?.[index]?.replace(/\s+/g, ' ').trim() || null;
  }

  private extractInvoiceNumber(text: string) {
    if (!/\bfacture\b|\binvoice\b/i.test(text)) return null;
    return this.extractAfter(text, /(?:facture|invoice)[\s\S]{0,120}?(?:num[eé]ro|n[°.])\s*[:#-]?\s*([A-Z0-9-_/]+)/i, 1);
  }

  private extractDeliveryNoteNumber(text: string) {
    return this.extractAfter(text, /(?:bordereau de livraison|bon de livraison|\bbl\b)[^\n]{0,80}?(?:num[eé]ro|n[°.])\s*[:#-]?\s*([A-Z0-9-_/]+)/i, 1)
      || this.extractAfter(text, /(?:bon de livraison\s*\/\s*delivery note|delivery note|bon de livraison)\s*[\r\n]+([0-9][A-Z0-9-_/]+)/i, 1);
  }

  private extractPurchaseOrderNumber(text: string) {
    const values = [
      ...this.extractAll(text, /ref\.?\s*cde\.?\s*(?:cii)?\s*[:#-]?\s*[0-9]*\s*commande\s*n[°.]?\s*([A-Z0-9-_/]+)/ig, 1),
      ...this.extractAll(text, /(?:bon de commande|commande|purchase order)\s*n[°.]?\s*[:#-]?\s*([A-Z0-9-_/]+)/ig, 1),
      ...this.extractAll(text, /n[°.]?\s*commande(?:\(s\))?\s*(?:[A-Za-z]+)?\s*([0-9][0-9\s-]+)/ig, 1),
      ...this.extractAll(text, /r[eé]f[eé]rence client\s*[:#-]?\s*(?:France\s*)?([A-Z0-9-_/]+)/ig, 1),
    ]
      .map((value) => value.replace(/\s+/g, ' ').replace(/\s+-\s+/g, ' - ').trim())
      .filter((value) => /[0-9]/.test(value) || /^[A-Z]{2,}[A-Z0-9-_/]*$/.test(value));
    return [...new Set(values)].slice(0, 4).join(' / ') || null;
  }

  private extractDocumentDate(text: string) {
    return this.extractDate(text, /date\s*(facture|document)\s*[:#-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i)
      || this.extractDate(text, /(bordereau de livraison|bon de livraison|\bbl\b)[^\n]{0,120}\bdu\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i);
  }

  private extractDeliveryDate(text: string) {
    return this.extractDate(text, /date\s*(?:de\s*)?(livraison|réception|reception|exp[eé]dition)\s*[:#-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i);
  }

  private extractAll(text: string, regex: RegExp, index: number) {
    return [...text.matchAll(regex)].map((match) => match[index]?.trim()).filter((value): value is string => Boolean(value));
  }

  private extractMoney(text: string, regex: RegExp) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const global = new RegExp(regex.source, flags);
    const values = [...text.matchAll(global)]
      .map((match) => this.parseFrenchNumber(match[match.length - 1] || ''))
      .filter((value): value is number => value != null);
    return [...values].reverse().find((value) => value > 0) ?? values.at(-1) ?? null;
  }

  private extractTotals(text: string) {
    const totalTable = this.extractTotalsFromTable(text);
    return {
      totalExcludingTax: totalTable.totalExcludingTax ?? this.extractMoney(text, /(total\s*(ht|hors taxe))\s*[:#-]?\s*([0-9\s.,]+)/i),
      totalTax: totalTable.totalTax ?? this.extractMoney(text, /(total\s*tva|tva)\s*[:#-]?\s*([0-9\s.,]+)/i),
      totalIncludingTax: this.extractMoney(text, /(total\s*(ttc|a payer|à payer)|net\s*a payer|net\s*à payer)\s*[:#-]?\s*([0-9\s.,]+)/i),
    };
  }

  private extractTotalsFromTable(text: string) {
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    for (let i = 0; i < lines.length; i += 1) {
      if (!/TOTAL\s*HT/i.test(lines[i]) || !/TOTAL\s*TVA/i.test(lines[i])) continue;
      const next = lines.slice(i + 1, i + 5).find((line) => line.includes('|') && /\d/.test(line));
      const values = next?.split('|').map((cell) => this.parseFrenchNumber(cell)).filter((value): value is number => value != null) ?? [];
      if (values.length >= 2) return { totalExcludingTax: values[0], totalTax: values[values.length - 1] };
    }
    return { totalExcludingTax: null, totalTax: null };
  }

  private extractDate(text: string, regex: RegExp) {
    const match = text.match(regex);
    return match?.[match.length - 1] ? this.normalizeDate(match[match.length - 1]) : null;
  }

  private parseFrenchNumber(value: string) {
    const normalized = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.') return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeDate(value: string) {
    const parts = value.split(/[./-]/).map(Number);
    if (parts.length !== 3) return null;
    const [day, month, rawYear] = parts;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!day || !month || !year) return null;
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  private confidenceForExtraction(extraction: BusinessExtraction) {
    if (!extraction.lines.length) return 0.2;
    const recognized = extraction.lines.filter((line: any) => line.matchingStatus === StockReceptionLineMatchingStatus.RECOGNIZED).length;
    return Math.min(0.99, Math.max(0.3, recognized / extraction.lines.length));
  }

  private normalizeCorrectionPayload(dto: SaveOcrCorrectionDto) {
    return {
      supplierId: dto.supplierId || null,
      supplierName: dto.supplierName || null,
      invoiceNumber: dto.invoiceNumber || null,
      deliveryNoteNumber: dto.deliveryNoteNumber || null,
      purchaseOrderNumber: dto.purchaseOrderNumber || null,
      documentDate: dto.documentDate || null,
      deliveryDate: dto.deliveryDate || null,
      totalExcludingTax: dto.totalExcludingTax ?? null,
      totalTax: dto.totalTax ?? null,
      totalIncludingTax: dto.totalIncludingTax ?? null,
      siteId: dto.siteId || null,
      locationId: dto.locationId || null,
      lines: (dto.lines || []).map((line) => ({
        ...line,
        productId: line.productId || null,
        unitId: line.unitId || null,
        quantity: line.quantity ?? null,
        unitPrice: line.unitPrice ?? null,
        lineTotal: line.lineTotal ?? null,
        vatRate: line.vatRate ?? null,
        bestBeforeDate: line.bestBeforeDate || null,
        matchingStatus: line.productId ? StockReceptionLineMatchingStatus.RECOGNIZED : StockReceptionLineMatchingStatus.NOT_FOUND,
        matchingScore: line.productId ? 1 : 0,
      })),
    };
  }

  private formatExtraction(extraction: any) {
    const source = (extraction.correctedJson || extraction.extractedJson) as any;
    return {
      id: extraction.id,
      status: extraction.status,
      type: extraction.type,
      confidenceScore: extraction.confidenceScore,
      extractedJson: extraction.extractedJson,
      correctedJson: extraction.correctedJson,
      data: source,
      document: extraction.ocrDocument?.document,
      ocrDocument: extraction.ocrDocument,
    };
  }

  private decimalOrNull(value: number | null | undefined) {
    return value == null ? null : new Prisma.Decimal(value);
  }

  private async ensureSupplier(organizationId: string, id: string) {
    const item = await this.prisma.supplier.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Fournisseur introuvable');
    return item;
  }

  private async ensureSite(organizationId: string, id: string) {
    const item = await this.prisma.site.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Site introuvable');
    return item;
  }

  private async ensureLocation(organizationId: string, id: string) {
    const item = await this.prisma.location.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Emplacement introuvable');
    return item;
  }

  private async convertToProductUnitTx(tx: Tx, organizationId: string, fromUnitId: string, toUnitId: string, quantity: number) {
    if (fromUnitId === toUnitId) return new Prisma.Decimal(quantity);
    const conversion = await tx.unitConversion.findFirst({ where: { organizationId, fromUnitId, toUnitId } });
    if (!conversion) throw new BadRequestException('Conversion d’unité incompatible sur une ligne de réception.');
    return new Prisma.Decimal(quantity).mul(conversion.factor);
  }

  private async updateProductAveragePriceFromReceptionLineTx(tx: Tx, productId: string, convertedQuantity: Prisma.Decimal, line: any) {
    let nextPrice: Prisma.Decimal | null = null;
    if (line.lineTotal != null && !convertedQuantity.isZero()) {
      nextPrice = new Prisma.Decimal(line.lineTotal).div(convertedQuantity);
    } else if (line.unitPrice != null) {
      nextPrice = new Prisma.Decimal(line.unitPrice);
    }
    if (nextPrice && nextPrice.greaterThanOrEqualTo(0)) {
      await tx.product.update({ where: { id: productId }, data: { averagePrice: nextPrice } });
    }
  }

  private async applyStock(tx: Tx, organizationId: string, productId: string, lotId: string | undefined | null, siteId: string | undefined | null, locationId: string | undefined | null, delta: Prisma.Decimal) {
    const existing = await tx.stock.findFirst({ where: { organizationId, productId, lotId: lotId ?? null, siteId: siteId ?? null, locationId: locationId ?? null } });
    if (existing) return tx.stock.update({ where: { id: existing.id }, data: { quantity: existing.quantity.add(delta) } });
    return tx.stock.create({ data: { organizationId, productId, lotId, siteId, locationId, quantity: delta } });
  }
}
