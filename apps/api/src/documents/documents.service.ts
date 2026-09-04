import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, OcrBusinessExtractionStatus, Prisma } from '@prisma/client';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

const STOCKS_OCR_UPLOAD_ROOT = resolve(process.env.STOCKS_OCR_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads', 'stocks-ocr');

type Query = Record<string, string | undefined>;
type JsonObject = Record<string, any>;

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: Query = {}) {
    const take = Math.min(Math.max(Number(query.take ?? 200) || 200, 1), 500);
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        sourceModule: 'stocks',
        sourceType: 'ocr-reception',
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        ocrDocuments: {
          include: { extractions: { orderBy: { updatedAt: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stockReceptions: {
          include: { supplier: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    let items = documents.map((document) => this.formatDocument(document));
    items = this.applyFilters(items, query);

    const suppliers = Object.values(items.reduce<Record<string, { id: string | null; name: string; count: number }>>((acc, item) => {
      const name = item.supplierName || 'Non classé';
      const key = item.supplierId || name;
      acc[key] = acc[key] ?? { id: item.supplierId, name, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const months = Object.values(items.reduce<Record<string, { key: string; label: string; count: number }>>((acc, item) => {
      const date = new Date(item.documentDate || item.createdAt);
      const key = Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().slice(0, 7);
      acc[key] = acc[key] ?? { key, label: key === 'unknown' ? 'Date inconnue' : this.monthLabel(date), count: 0 };
      acc[key].count += 1;
      return acc;
    }, {})).sort((a, b) => b.key.localeCompare(a.key));

    return {
      items,
      summary: {
        total: items.length,
        ready: items.filter((item) => item.processingState === 'ready').length,
        processing: items.filter((item) => item.processingState === 'processing').length,
        failed: items.filter((item) => item.processingState === 'failed').length,
        suppliers,
        months,
      },
    };
  }

  async getForDownload(organizationId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new NotFoundException('Document introuvable');
    if (document.sourceModule !== 'stocks' || document.sourceType !== 'ocr-reception') {
      throw new BadRequestException('Ce type de document n’est pas encore téléchargeable depuis Mes Documents');
    }
    return { document, absolutePath: join(STOCKS_OCR_UPLOAD_ROOT, document.storagePath) };
  }

  private formatDocument(document: Prisma.DocumentGetPayload<{
    include: {
      uploadedBy: { select: { id: true; firstName: true; lastName: true; email: true } };
      ocrDocuments: { include: { extractions: true } };
      stockReceptions: { include: { supplier: true } };
    };
  }>) {
    const ocr = document.ocrDocuments[0] ?? null;
    const extraction = ocr?.extractions[0] ?? null;
    const reception = document.stockReceptions[0] ?? null;
    const data = this.extractionData(extraction);
    const documentData = this.object(data.document);
    const supplierData = this.object(data.supplier);
    const supplierName = reception?.supplier?.name || reception?.supplierName || this.string(data.supplierName) || this.string(supplierData.name) || this.string(supplierData.supplierName);
    const supplierId = reception?.supplierId || this.string(data.supplierId) || this.string(supplierData.supplierId);
    const invoiceNumber = reception?.invoiceNumber || this.string(data.invoiceNumber) || this.string(documentData.invoiceNumber);
    const deliveryNoteNumber = reception?.deliveryNoteNumber || this.string(data.deliveryNoteNumber) || this.string(documentData.deliveryNoteNumber);
    const receiptNumber = reception?.receiptNumber || this.string(data.receiptNumber) || this.string(documentData.receiptNumber);
    const documentDate = this.dateString(reception?.documentDate) || this.string(data.documentDate) || this.string(documentData.documentDate) || this.dateString(document.createdAt);
    const extractedType = this.string(data.documentType);
    const type: string = invoiceNumber
      ? 'invoice'
      : deliveryNoteNumber
        ? 'delivery_note'
        : receiptNumber
          ? 'receipt'
          : ['invoice', 'delivery_note', 'receipt', 'supplier_order', 'order_confirmation'].includes(extractedType || '')
            ? extractedType || 'unknown'
          : extraction?.type === 'INVOICE'
            ? 'invoice'
            : extraction?.type === 'DELIVERY_NOTE'
              ? 'delivery_note'
              : 'unknown';
    const processingState = document.status === DocumentStatus.FAILED || ocr?.status === 'FAILED'
      ? 'failed'
      : extraction?.status && extraction.status !== OcrBusinessExtractionStatus.VALIDATED
        ? 'ready'
        : ocr?.status === 'COMPLETED' || document.status === DocumentStatus.PROCESSED
          ? 'ready'
          : 'processing';

    return {
      id: document.id,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      sourceModule: document.sourceModule,
      sourceType: document.sourceType,
      status: document.status,
      processingState,
      type,
      supplierId: supplierId || null,
      supplierName: supplierName || null,
      invoiceNumber: invoiceNumber || null,
      deliveryNoteNumber: deliveryNoteNumber || null,
      receiptNumber: receiptNumber || null,
      documentDate,
      uploadedAt: document.createdAt.toISOString(),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      extractionId: extraction?.id ?? null,
      receptionId: reception?.id ?? null,
      receptionStatus: reception?.status ?? null,
      uploadedBy: document.uploadedBy,
    };
  }

  private applyFilters<T extends { supplierId: string | null; supplierName: string | null; type: string; documentDate: string | null; createdAt: string; originalName: string; invoiceNumber: string | null; deliveryNoteNumber: string | null; receiptNumber: string | null }>(items: T[], query: Query): T[] {
    const search = query.search?.trim().toLowerCase();
    const supplier = query.supplier?.trim().toLowerCase();
    const type = query.type?.trim();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
    const dateTo = query.dateTo ? new Date(query.dateTo) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    return items.filter((item) => {
      const haystack = `${item.originalName} ${item.supplierName ?? ''} ${item.invoiceNumber ?? ''} ${item.deliveryNoteNumber ?? ''} ${item.receiptNumber ?? ''}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (supplier && item.supplierId !== supplier && (item.supplierName ?? '').toLowerCase() !== supplier) return false;
      if (type && type !== 'all' && item.type !== type) return false;
      const date = new Date(item.documentDate || item.createdAt);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });
  }

  private extractionData(extraction?: { correctedJson: Prisma.JsonValue | null; extractedJson: Prisma.JsonValue } | null): JsonObject {
    return this.objectOrNull(extraction?.correctedJson) ?? this.objectOrNull(extraction?.extractedJson) ?? {};
  }

  private object(value: unknown): JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
  }

  private objectOrNull(value: unknown): JsonObject | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
  }

  private string(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private dateString(value?: Date | string | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private monthLabel(date: Date) {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
  }

  async update(organizationId: string, documentId: string, payload: { originalName: string }) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new NotFoundException('Document introuvable');

    let newName = payload.originalName.trim();
    if (!newName) throw new BadRequestException('Le nom du document ne peut pas être vide');

    const lastDotOld = document.originalName.lastIndexOf('.');
    const oldExt = lastDotOld !== -1 ? document.originalName.slice(lastDotOld) : '';

    const lastDotNew = newName.lastIndexOf('.');
    const newExt = lastDotNew !== -1 ? newName.slice(lastDotNew) : '';

    if (oldExt && oldExt.toLowerCase() !== newExt.toLowerCase()) {
      newName = newName + oldExt;
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { originalName: newName },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        ocrDocuments: {
          include: { extractions: { orderBy: { updatedAt: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stockReceptions: {
          include: { supplier: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    return this.formatDocument(updated);
  }
}
