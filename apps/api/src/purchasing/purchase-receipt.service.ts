import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PurchaseOrderStatus,
  PurchaseReceiptLineStatus,
  PurchaseReceiptStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseReceiptDto,
  PurchasingListQueryDto,
  UpdatePurchaseReceiptDto,
} from './dto/purchasing.dto';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchaseReceiptMatchingService } from './purchase-receipt-matching.service';
import { PurchasingContextService } from './purchasing-context.service';
import { PurchasingDeliveryService } from './purchasing-delivery.service';
import {
  createPurchaseOrderEvent,
  purchaseReceiptInclude,
  serializePurchaseReceipt,
} from './purchasing-records';

const RECEIVABLE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class PurchaseReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PurchasingContextService,
    private readonly policy: PurchaseOrderPolicy,
    private readonly delivery: PurchasingDeliveryService,
    private readonly matching: PurchaseReceiptMatchingService,
  ) {}

  async create(
    organizationId: string,
    actor: AuthenticatedUser,
    orderId: string,
    dto: CreatePurchaseReceiptDto,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.receive');
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: orderId, organizationId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (!RECEIVABLE_ORDER_STATUSES.includes(order.status))
      throw new BadRequestException('La commande doit être envoyée avant sa réception.');
    await Promise.all([
      this.context.ensureSite(organizationId, dto.siteId),
      dto.locationId
        ? this.context.ensureLocation(organizationId, dto.locationId, dto.siteId)
        : Promise.resolve(null),
    ]);
    const lines = this.matching.normalize(organizationId, order.lines, dto.lines);
    const status = this.status(lines);
    const receipt = await this.prisma.purchaseReceipt.create({
      data: {
        organizationId,
        orderId,
        siteId: dto.siteId,
        locationId: dto.locationId,
        deliveryNoteDocumentId: dto.deliveryNoteDocumentId,
        extractionId: dto.extractionId,
        deliveryNoteNumber: dto.deliveryNoteNumber,
        deliveryDate: dto.deliveryDate ? this.delivery.dateOnly(dto.deliveryDate) : null,
        notes: dto.notes,
        status,
        createdById: actor.id,
        lines: { create: lines },
      },
      include: purchaseReceiptInclude(),
    });
    await createPurchaseOrderEvent(
      this.prisma,
      organizationId,
      orderId,
      actor.id,
      'RECEIPT_CREATED',
      `Réception créée pour ${order.number}`,
      { receiptId: receipt.id },
    );
    return serializePurchaseReceipt(receipt);
  }

  async update(
    organizationId: string,
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePurchaseReceiptDto,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.receive');
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, organizationId },
      include: { order: { include: { lines: true } } },
    });
    if (!receipt) throw new NotFoundException('Réception introuvable.');
    if (receipt.status === PurchaseReceiptStatus.VALIDATED)
      throw new BadRequestException('Une réception validée ne peut plus être modifiée.');
    await Promise.all([
      this.context.ensureSite(organizationId, dto.siteId),
      dto.locationId
        ? this.context.ensureLocation(organizationId, dto.locationId, dto.siteId)
        : Promise.resolve(null),
    ]);
    const lines = this.matching.normalize(organizationId, receipt.order.lines, dto.lines);
    const status = this.status(lines);
    return this.prisma
      .$transaction(async (tx) => {
        await tx.purchaseReceiptLine.deleteMany({ where: { receiptId: id, organizationId } });
        const updated = await tx.purchaseReceipt.update({
          where: { id, organizationId },
          data: {
            siteId: dto.siteId,
            locationId: dto.locationId,
            deliveryNoteDocumentId: dto.deliveryNoteDocumentId,
            extractionId: dto.extractionId,
            deliveryNoteNumber: dto.deliveryNoteNumber,
            deliveryDate: dto.deliveryDate ? this.delivery.dateOnly(dto.deliveryDate) : null,
            notes: dto.notes,
            status,
            lines: { create: lines },
          },
          include: purchaseReceiptInclude(),
        });
        await createPurchaseOrderEvent(
          tx,
          organizationId,
          receipt.orderId,
          actor.id,
          'RECEIPT_UPDATED',
          'Comparaison de réception mise à jour',
          { receiptId: id },
        );
        return updated;
      })
      .then(serializePurchaseReceipt);
  }

  async list(organizationId: string, actor: AuthenticatedUser, orderId?: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.read');
    const items = await this.prisma.purchaseReceipt.findMany({
      where: { organizationId, orderId },
      include: purchaseReceiptInclude(),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return items.map(serializePurchaseReceipt);
  }

  async listPage(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PurchasingListQueryDto,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.read');
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 100);
    const status =
      query.status && Object.values(PurchaseReceiptStatus).includes(query.status as PurchaseReceiptStatus)
        ? (query.status as PurchaseReceiptStatus)
        : undefined;
    const where: Prisma.PurchaseReceiptWhereInput = {
      organizationId,
      status,
      ...(query.search
        ? {
            OR: [
              { deliveryNoteNumber: { contains: query.search, mode: 'insensitive' as const } },
              { order: { number: { contains: query.search, mode: 'insensitive' as const } } },
              {
                order: {
                  supplierNameSnapshot: { contains: query.search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseReceipt.findMany({
        where,
        include: {
          order: { select: { id: true, number: true, supplierNameSnapshot: true } },
          _count: {
            select: {
              lines: { where: { status: { not: PurchaseReceiptLineStatus.MATCHED } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseReceipt.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...receipt }) => ({
        ...receipt,
        anomalyCount: _count.lines,
      })),
      total,
      page,
      pageSize,
    };
  }

  async detail(organizationId: string, actor: AuthenticatedUser, id: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.read');
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id, organizationId },
      include: purchaseReceiptInclude(),
    });
    if (!receipt) throw new NotFoundException('Réception introuvable.');
    return serializePurchaseReceipt(receipt);
  }

  async createFromExtraction(
    organizationId: string,
    actor: AuthenticatedUser,
    orderId: string,
    extractionId: string,
    siteId: string,
    locationId?: string,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.receive');
    const [order, extraction] = await Promise.all([
      this.prisma.purchaseOrder.findFirst({
        where: { id: orderId, organizationId },
        include: { lines: true },
      }),
      this.prisma.ocrBusinessExtraction.findFirst({
        where: { id: extractionId, organizationId },
        include: { ocrDocument: { include: { document: true } } },
      }),
    ]);
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (!extraction) throw new NotFoundException('Extraction OCR introuvable.');
    const data = this.matching.fromOcr(extraction.correctedJson || extraction.extractedJson);
    const lines = this.matching.matchOcrLines(order.lines, data);
    return this.create(organizationId, actor, orderId, {
      siteId,
      locationId,
      deliveryNoteDocumentId: extraction.ocrDocument.documentId,
      extractionId,
      deliveryNoteNumber: data.deliveryNoteNumber,
      deliveryDate: data.deliveryDate,
      lines,
    });
  }

  private status(
    lines: Array<{
      status: PurchaseReceiptLineStatus;
      productId?: string | null;
      unitId?: string | null;
    }>,
  ) {
    return lines.some(
      (line) =>
        line.status === PurchaseReceiptLineStatus.NEEDS_REVIEW || !line.productId || !line.unitId,
    )
      ? PurchaseReceiptStatus.REVIEW_NEEDED
      : PurchaseReceiptStatus.DRAFT;
  }
}
