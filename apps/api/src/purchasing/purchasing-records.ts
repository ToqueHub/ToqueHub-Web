import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type DecimalLike = Prisma.Decimal | number | string;

export type SerializablePurchaseReceipt = Record<string, unknown> & {
  lines?: Array<
    Record<string, unknown> & {
      deliveredQuantity: DecimalLike;
      acceptedQuantity: DecimalLike;
      unitsPerOrderUnit: DecimalLike;
      unitPrice: DecimalLike | null;
    }
  >;
};

export type SerializablePurchaseOrder = Record<string, unknown> & {
  deliveryFeeSnapshot: DecimalLike;
  totalExcludingTax: DecimalLike;
  totalTax: DecimalLike;
  totalIncludingTax: DecimalLike;
  lines?: Array<
    Record<string, unknown> & {
      orderedQuantity: DecimalLike;
      unitsPerOrderUnit: DecimalLike;
      expectedStockQuantity: DecimalLike;
      receivedQuantity: DecimalLike;
      unitPrice: DecimalLike;
      vatRate: DecimalLike;
      lineExcludingTax: DecimalLike;
      lineTax: DecimalLike;
      lineIncludingTax: DecimalLike;
    }
  >;
  receipts?: SerializablePurchaseReceipt[];
};

export type PurchaseOrderSnapshotSource = {
  id: string;
  number: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string | null;
  expectedDeliveryDate: Date | null;
  currency: string;
  deliveryFeeSnapshot: DecimalLike;
  totalExcludingTax: DecimalLike;
  totalTax: DecimalLike;
  totalIncludingTax: DecimalLike;
  version: number;
  lines: Array<{
    productId: string;
    productNameSnapshot: string;
    supplierReferenceSnapshot: string | null;
    orderedQuantity: DecimalLike;
    unitPrice: DecimalLike;
    lineIncludingTax: DecimalLike;
  }>;
};

export function serializePurchaseReceipt<T extends SerializablePurchaseReceipt>(receipt: T) {
  return {
    ...receipt,
    lines: receipt.lines?.map((line) => ({
      ...line,
      deliveredQuantity: Number(line.deliveredQuantity),
      acceptedQuantity: Number(line.acceptedQuantity),
      unitsPerOrderUnit: Number(line.unitsPerOrderUnit),
      unitPrice: line.unitPrice == null ? null : Number(line.unitPrice),
    })),
  } as const;
}

export function serializePurchaseOrder<T extends SerializablePurchaseOrder>(order: T) {
  return {
    ...order,
    deliveryFeeSnapshot: Number(order.deliveryFeeSnapshot ?? 0),
    totalExcludingTax: Number(order.totalExcludingTax),
    totalTax: Number(order.totalTax),
    totalIncludingTax: Number(order.totalIncludingTax),
    lines: order.lines?.map((line) => ({
      ...line,
      orderedQuantity: Number(line.orderedQuantity),
      unitsPerOrderUnit: Number(line.unitsPerOrderUnit),
      expectedStockQuantity: Number(line.expectedStockQuantity),
      receivedQuantity: Number(line.receivedQuantity),
      unitPrice: Number(line.unitPrice),
      vatRate: Number(line.vatRate),
      lineExcludingTax: Number(line.lineExcludingTax),
      lineTax: Number(line.lineTax),
      lineIncludingTax: Number(line.lineIncludingTax),
    })),
    receipts: order.receipts?.map(serializePurchaseReceipt),
  } as const;
}

export function purchaseOrderSnapshot(order: PurchaseOrderSnapshotSource) {
  return {
    id: order.id,
    number: order.number,
    supplier: order.supplierNameSnapshot,
    recipient: order.supplierEmailSnapshot,
    deliveryDate: order.expectedDeliveryDate,
    currency: order.currency,
    totals: {
      deliveryFee: Number(order.deliveryFeeSnapshot ?? 0),
      excludingTax: Number(order.totalExcludingTax),
      tax: Number(order.totalTax),
      includingTax: Number(order.totalIncludingTax),
    },
    lines: order.lines.map((line) => ({
      productId: line.productId,
      name: line.productNameSnapshot,
      reference: line.supplierReferenceSnapshot,
      quantity: Number(line.orderedQuantity),
      unitPrice: Number(line.unitPrice),
      total: Number(line.lineIncludingTax),
    })),
    version: order.version,
    generatedAt: new Date().toISOString(),
  } as const;
}

export function purchaseReceiptInclude() {
  return {
    lines: {
      include: { orderLine: true, product: { include: { unit: true } }, unit: true },
      orderBy: { createdAt: 'asc' },
    },
    order: { include: { supplier: true, lines: true } },
    site: true,
    location: true,
    document: true,
    stockReception: true,
  } as const;
}

export function purchaseOrderInclude(full = false) {
  return {
    supplier: { include: { purchasingProfile: true } },
    site: true,
    createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    sentBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    lines: {
      include: { product: { include: { category: true, unit: true } }, unit: true },
      orderBy: { position: 'asc' },
    },
    receipts: { include: purchaseReceiptInclude(), orderBy: { createdAt: 'desc' } },
    dispatches: { orderBy: { createdAt: 'desc' }, take: full ? 50 : 3 },
    ...(full
      ? {
          events: {
            include: {
              actor: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' as const },
            take: 100,
          },
        }
      : {}),
  } as const;
}

export const purchaseOrderDetailArgs = Prisma.validator<Prisma.PurchaseOrderDefaultArgs>()({
  include: {
    supplier: { include: { purchasingProfile: true } },
    site: true,
    createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    sentBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    lines: {
      include: { product: { include: { category: true, unit: true } }, unit: true },
      orderBy: { position: 'asc' },
    },
    receipts: {
      include: purchaseReceiptInclude(),
      orderBy: { createdAt: 'desc' },
    },
    dispatches: { orderBy: { createdAt: 'desc' }, take: 50 },
    events: {
      include: {
        actor: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    },
  },
});

export function createPurchaseOrderEvent(
  client: PrismaService | Prisma.TransactionClient,
  organizationId: string,
  orderId: string,
  actorUserId: string | null,
  type: string,
  summary: string,
  details?: Prisma.InputJsonValue,
) {
  return client.purchaseOrderEvent.create({
    data: { organizationId, orderId, actorUserId, type, summary, details },
  });
}
