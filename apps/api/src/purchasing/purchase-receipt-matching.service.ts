import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PurchaseReceiptLineStatus } from '@prisma/client';
import type { CreatePurchaseReceiptDto } from './dto/purchasing.dto';

export type ReceiptOrderLine = {
  id: string;
  productId: string;
  unitId: string | null;
  supplierReferenceSnapshot: string | null;
  supplierLabelSnapshot: string | null;
  productNameSnapshot: string;
  orderedQuantity: Prisma.Decimal;
  receivedQuantity: Prisma.Decimal;
  unitsPerOrderUnit: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
};

type OcrReceiptLine = {
  ignored: boolean;
  supplierProductCode?: string;
  reference?: string;
  productId?: string;
  unitId?: string;
  quantity: number;
  nameOriginal?: string;
  label?: string;
  unitPrice?: number;
};

export type ParsedReceiptExtraction = {
  lines: OcrReceiptLine[];
  deliveryNoteNumber?: string;
  deliveryDate?: string;
};

@Injectable()
export class PurchaseReceiptMatchingService {
  normalize(
    organizationId: string,
    orderLines: ReceiptOrderLine[],
    input: CreatePurchaseReceiptDto['lines'],
  ) {
    return input.map((line) => {
      const orderLine = line.purchaseOrderLineId
        ? orderLines.find((candidate) => candidate.id === line.purchaseOrderLineId)
        : undefined;
      if (line.purchaseOrderLineId && !orderLine)
        throw new BadRequestException('Une ligne de réception ne correspond pas à cette commande.');
      const delivered = new Prisma.Decimal(line.deliveredQuantity);
      const remaining = orderLine
        ? orderLine.orderedQuantity.sub(orderLine.receivedQuantity)
        : new Prisma.Decimal(0);
      const accepted = new Prisma.Decimal(line.acceptedQuantity);
      if (accepted.gt(delivered))
        throw new BadRequestException(
          `La quantité acceptée ne peut pas dépasser la quantité livrée pour « ${line.label} ».`,
        );
      const inferred = !orderLine
        ? PurchaseReceiptLineStatus.UNEXPECTED
        : delivered.lt(remaining)
          ? PurchaseReceiptLineStatus.SHORT
          : delivered.gt(remaining)
            ? PurchaseReceiptLineStatus.OVER
            : PurchaseReceiptLineStatus.MATCHED;
      return {
        organizationId,
        purchaseOrderLineId: orderLine?.id,
        productId: line.productId || orderLine?.productId,
        unitId: line.unitId || orderLine?.unitId,
        reference: line.reference || orderLine?.supplierReferenceSnapshot,
        label:
          line.label ||
          orderLine?.supplierLabelSnapshot ||
          orderLine?.productNameSnapshot ||
          'Ligne de livraison',
        deliveredQuantity: delivered,
        acceptedQuantity: accepted,
        unitsPerOrderUnit: new Prisma.Decimal(
          line.unitsPerOrderUnit ?? orderLine?.unitsPerOrderUnit ?? 1,
        ),
        unitPrice:
          line.unitPrice == null ? orderLine?.unitPrice : new Prisma.Decimal(line.unitPrice),
        status: line.status || inferred,
        notes: line.notes,
      };
    });
  }

  fromOcr(value: unknown): ParsedReceiptExtraction {
    if (!this.record(value))
      throw new BadRequestException('Le résultat OCR du bon de livraison est invalide.');
    const rawLines = Array.isArray(value.lines)
      ? value.lines
      : Array.isArray(value.items)
        ? value.items
        : null;
    if (!rawLines)
      throw new BadRequestException('Le résultat OCR ne contient aucune liste de lignes valide.');
    const lines = rawLines.map((raw, index) => this.ocrLine(raw, index));
    const document = this.record(value.document) ? value.document : {};
    return {
      lines,
      deliveryNoteNumber: this.optionalString(document.deliveryNoteNumber ?? value.deliveryNoteNumber),
      deliveryDate: this.optionalIsoDate(document.deliveryDate ?? value.deliveryDate),
    };
  }

  matchOcrLines(orderLines: ReceiptOrderLine[], extraction: ParsedReceiptExtraction) {
    return extraction.lines
      .filter((line) => !line.ignored)
      .map((line) => {
        const reference = (line.supplierProductCode || line.reference || '').trim();
        const matched =
          orderLines.find(
            (candidate) =>
              reference &&
              candidate.supplierReferenceSnapshot?.toLowerCase() === reference.toLowerCase(),
          ) || orderLines.find((candidate) => line.productId && candidate.productId === line.productId);
        const remaining = matched
          ? Math.max(0, Number(matched.orderedQuantity) - Number(matched.receivedQuantity))
          : 0;
        const status = !matched
          ? PurchaseReceiptLineStatus.UNEXPECTED
          : line.quantity < remaining
            ? PurchaseReceiptLineStatus.SHORT
            : line.quantity > remaining
              ? PurchaseReceiptLineStatus.OVER
              : PurchaseReceiptLineStatus.MATCHED;
        return {
          purchaseOrderLineId: matched?.id,
          productId: matched?.productId || line.productId,
          unitId: matched?.unitId || line.unitId,
          reference: reference || undefined,
          label: line.nameOriginal || line.label || 'Ligne OCR',
          deliveredQuantity: line.quantity,
          acceptedQuantity: line.quantity,
          unitsPerOrderUnit: matched ? Number(matched.unitsPerOrderUnit) : 1,
          unitPrice: line.unitPrice ?? (matched ? Number(matched.unitPrice) : undefined),
          status,
        };
      });
  }

  private ocrLine(value: unknown, index: number): OcrReceiptLine {
    if (!this.record(value))
      throw new BadRequestException(`La ligne OCR ${index + 1} n’est pas un objet valide.`);
    const quantity = Number(value.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0)
      throw new BadRequestException(`La quantité OCR de la ligne ${index + 1} est invalide.`);
    const unitPrice = value.unitPrice == null ? undefined : Number(value.unitPrice);
    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0))
      throw new BadRequestException(`Le prix OCR de la ligne ${index + 1} est invalide.`);
    return {
      ignored: value.ignored === true,
      supplierProductCode: this.optionalString(value.supplierProductCode),
      reference: this.optionalString(value.reference),
      productId: this.optionalString(value.productId),
      unitId: this.optionalString(value.unitId),
      quantity,
      nameOriginal: this.optionalString(value.nameOriginal),
      label: this.optionalString(value.label),
      unitPrice,
    };
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private optionalIsoDate(value: unknown) {
    const text = this.optionalString(value);
    if (!text) return undefined;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('La date OCR est invalide.');
    return text;
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
