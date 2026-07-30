import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OcrBusinessExtractionStatus,
  Prisma,
  PurchaseOrderStatus,
  PurchaseReceiptLineStatus,
  PurchaseReceiptStatus,
  HaccpReceptionControlStatus,
  StockReceptionStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { StocksReceptionInventoryService } from '../stocks/stocks-reception-inventory.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchasingContextService } from './purchasing-context.service';
import {
  createPurchaseOrderEvent,
  purchaseReceiptInclude,
  serializePurchaseReceipt,
} from './purchasing-records';

@Injectable()
export class PurchaseReceiptValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PurchasingContextService,
    private readonly policy: PurchaseOrderPolicy,
    private readonly receptionInventory: StocksReceptionInventoryService,
  ) {}

  async validate(organizationId: string, actor: AuthenticatedUser, id: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.receive');
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, organizationId },
      include: purchaseReceiptInclude(),
    });
    if (!receipt) throw new NotFoundException('Réception introuvable.');
    if (receipt.status === PurchaseReceiptStatus.VALIDATED)
      return serializePurchaseReceipt(receipt);
    const blocking = receipt.lines.filter(
      (line) =>
        Number(line.acceptedQuantity) > 0 &&
        (!line.productId || !line.unitId || line.status === PurchaseReceiptLineStatus.NEEDS_REVIEW),
    );
    if (blocking.length)
      throw new BadRequestException(
        'Résolvez toutes les correspondances produit et unité avant validation.',
      );

    return this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase-receipt:${id}`})::bigint)`;
        const lockedReceipt = await tx.purchaseReceipt.findFirst({
          where: { id, organizationId },
          include: purchaseReceiptInclude(),
        });
        if (!lockedReceipt) throw new NotFoundException('Réception introuvable.');
        const duplicate = await tx.stockReception.findFirst({
          where: { purchaseReceiptId: id, organizationId },
        });
        if (duplicate) return lockedReceipt;

        const order = lockedReceipt.order;
        const acceptedLines = lockedReceipt.lines.filter(
          (line) => Number(line.acceptedQuantity) > 0 && line.productId && line.unitId,
        );
        const [products, units] = await Promise.all([
          tx.product.findMany({
            where: {
              organizationId,
              isArchived: false,
              id: {
                in: acceptedLines.flatMap((line) => (line.productId ? [line.productId] : [])),
              },
            },
            include: { unit: true },
          }),
          tx.unit.findMany({
            where: {
              organizationId,
              isArchived: false,
              id: { in: acceptedLines.flatMap((line) => (line.unitId ? [line.unitId] : [])) },
            },
          }),
        ]);
        const productsById = new Map(products.map((product) => [product.id, product]));
        const unitsById = new Map(units.map((unit) => [unit.id, unit]));
        const acceptedTotal = lockedReceipt.lines.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0);
        const deliveredTotal = lockedReceipt.lines.reduce((sum, line) => sum + Number(line.deliveredQuantity || 0), 0);
        const controlStatus = acceptedTotal <= 0
          ? HaccpReceptionControlStatus.REJECTED
          : (!lockedReceipt.controlConforming || acceptedTotal < deliveredTotal)
            ? HaccpReceptionControlStatus.PARTIAL
            : HaccpReceptionControlStatus.CONFORMING;
        const stockReception = await tx.stockReception.create({
          data: {
            organizationId,
            supplierId: order.supplierId,
            supplierName: order.supplierNameSnapshot,
            documentId: lockedReceipt.deliveryNoteDocumentId,
            extractionId: lockedReceipt.extractionId,
            deliveryNoteNumber: lockedReceipt.deliveryNoteNumber,
            purchaseOrderNumber: order.number,
            documentDate: lockedReceipt.deliveryDate,
            deliveryDate: lockedReceipt.deliveryDate || new Date(),
            totalExcludingTax: order.totalExcludingTax,
            totalTax: order.totalTax,
            totalIncludingTax: order.totalIncludingTax,
            status: acceptedTotal > 0 ? StockReceptionStatus.VALIDATED : StockReceptionStatus.CANCELLED,
            createdById: actor.id,
            siteId: lockedReceipt.siteId,
            locationId: lockedReceipt.locationId,
            validatedAt: new Date(),
            purchaseReceiptId: id,
            deliveryTemperature: lockedReceipt.deliveryTemperature,
            controlStatus,
            controlNotes: lockedReceipt.controlNotes || lockedReceipt.notes,
          },
        });

        const receivedByOrderLine = new Map<string, Prisma.Decimal>();
        for (const line of lockedReceipt.lines) {
          const accepted = new Prisma.Decimal(line.acceptedQuantity);
          if (accepted.lte(0)) {
            await tx.stockReceptionLine.create({
              data: {
                receptionId: stockReception.id,
                productId: line.productId,
                unitId: line.unitId,
                ocrLabel: line.label,
                reference: line.reference,
                quantity: accepted,
                documentedQuantity: line.orderLine?.orderedQuantity ?? line.deliveredQuantity,
                deliveredQuantity: line.deliveredQuantity,
                acceptedQuantity: accepted,
                unitPrice: line.unitPrice,
                matchingStatus: line.productId && line.unitId ? 'RECOGNIZED' : 'NEEDS_REVIEW',
                userCorrection: { source: 'PURCHASING', purchaseReceiptLineId: line.id, refused: true },
              },
            });
            continue;
          }
          if (!line.productId || !line.unitId) continue;
          const product = productsById.get(line.productId);
          const unit = unitsById.get(line.unitId);
          if (!product || !unit)
            throw new BadRequestException(`Produit ou unité introuvable pour « ${line.label} »`);
          const baseQuantity = accepted.mul(line.unitsPerOrderUnit);
          const effectiveOrderUnitPrice = new Prisma.Decimal(
            line.unitPrice ?? line.orderLine?.unitPrice ?? product.averagePrice,
          );
          const baseUnitPrice = effectiveOrderUnitPrice.div(line.unitsPerOrderUnit);
          await this.receptionInventory.applyValidatedLineTx(tx, {
            organizationId,
            receptionId: stockReception.id,
            product,
            unit,
            supplierId: order.supplierId,
            siteId: lockedReceipt.siteId,
            locationId: lockedReceipt.locationId,
            stockQuantity: baseQuantity,
            inputQuantity: accepted,
            documentedQuantity: new Prisma.Decimal(
              line.orderLine?.orderedQuantity ?? line.deliveredQuantity,
            ),
            deliveredQuantity: new Prisma.Decimal(line.deliveredQuantity),
            acceptedQuantity: accepted,
            baseUnitPrice,
            unitPrice: effectiveOrderUnitPrice,
            lineTotal: accepted.mul(effectiveOrderUnitPrice),
            label: line.label,
            reference: line.reference,
            userCorrection: {
              source: 'PURCHASING',
              purchaseReceiptLineId: line.id,
            } as Prisma.InputJsonValue,
            movementReason: `Réception commande ${order.number}`,
            movementDate: lockedReceipt.deliveryDate || new Date(),
            actorId: actor.id,
            priceMode: 'weighted-average',
          });
          if (line.purchaseOrderLineId)
            receivedByOrderLine.set(
              line.purchaseOrderLineId,
              (receivedByOrderLine.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0)).add(
                accepted,
              ),
            );
        }
        for (const [orderLineId, quantity] of receivedByOrderLine)
          await tx.purchaseOrderLine.updateMany({
            where: { id: orderLineId, organizationId },
            data: { receivedQuantity: { increment: quantity } },
          });

        const linesAfter = await tx.purchaseOrderLine.findMany({
          where: { orderId: order.id, organizationId },
        });
        const complete = linesAfter.every((line) =>
          new Prisma.Decimal(line.receivedQuantity).gte(line.orderedQuantity),
        );
        const partial = linesAfter.some((line) =>
          new Prisma.Decimal(line.receivedQuantity).gt(0),
        );
        const nextStatus = acceptedTotal <= 0
          ? order.status
          : complete
          ? PurchaseOrderStatus.RECEIVED
          : partial
            ? PurchaseOrderStatus.PARTIALLY_RECEIVED
            : order.status;
        if (nextStatus !== order.status) this.policy.assertTransition(order.status, nextStatus);
        await tx.purchaseOrder.updateMany({
          where: { id: order.id, organizationId },
          data: { status: nextStatus, receivedAt: complete ? new Date() : null },
        });
        const validated = await tx.purchaseReceipt.update({
          where: { id, organizationId },
          data: {
            status: acceptedTotal > 0 ? PurchaseReceiptStatus.VALIDATED : PurchaseReceiptStatus.CANCELLED,
            validatedAt: new Date(),
            validatedById: actor.id,
          },
          include: purchaseReceiptInclude(),
        });
        if (lockedReceipt.extractionId)
          await tx.ocrBusinessExtraction.update({
            where: { id: lockedReceipt.extractionId, organizationId },
            data: { status: OcrBusinessExtractionStatus.VALIDATED },
          });
        await createPurchaseOrderEvent(
          tx,
          organizationId,
          order.id,
          actor.id,
          'RECEIPT_VALIDATED',
          `Réception validée pour ${order.number}`,
          { receiptId: id, stockReceptionId: stockReception.id },
        );
        return validated;
      })
      .then(serializePurchaseReceipt);
  }
}
