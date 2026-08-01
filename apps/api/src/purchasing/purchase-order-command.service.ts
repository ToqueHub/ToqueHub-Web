import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderLineDto,
  UpdatePurchaseOrderDto,
} from './dto/purchasing.dto';
import { PurchaseOrderNumberService } from './purchase-order-number.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchaseOrderQueryService } from './purchase-order-query.service';
import { addDeliveryFee, calculateLineTotals, sumTotals } from './purchasing-calculations';
import { PurchasingContextService } from './purchasing-context.service';
import { PurchasingDeliveryService } from './purchasing-delivery.service';
import {
  createPurchaseOrderEvent,
  purchaseOrderInclude,
  serializePurchaseOrder,
} from './purchasing-records';

@Injectable()
export class PurchaseOrderCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PurchasingContextService,
    private readonly policy: PurchaseOrderPolicy,
    private readonly delivery: PurchasingDeliveryService,
    private readonly orderNumbers: PurchaseOrderNumberService,
    private readonly orderQueries: PurchaseOrderQueryService,
  ) {}

  async create(organizationId: string, actor: AuthenticatedUser, dto: CreatePurchaseOrderDto) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.draft');
    const [supplier, site, settings] = await Promise.all([
      this.context.ensureSupplier(organizationId, dto.supplierId),
      this.context.ensureSite(organizationId, dto.siteId),
      this.context.ensureSettings(organizationId),
    ]);
    this.delivery.assertOrderable(supplier.purchasingProfile);
    const built = await this.buildOrderLines(organizationId, supplier.id, dto.lines);
    if (dto.expectedDeliveryDate)
      this.delivery.assertAllowed(supplier.purchasingProfile, dto.expectedDeliveryDate);
    const totals = addDeliveryFee(built.totals, supplier.purchasingProfile?.deliveryFee);
    return this.prisma
      .$transaction(async (tx) => {
        const number = await this.orderNumbers.next(tx, organizationId);
        const order = await tx.purchaseOrder.create({
          data: {
            organizationId,
            number,
            supplierId: supplier.id,
            siteId: site.id,
            currency: (dto.currency || settings.defaultCurrency).toUpperCase(),
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? this.delivery.dateOnly(dto.expectedDeliveryDate)
              : null,
            supplierNameSnapshot: supplier.name,
            supplierEmailSnapshot: supplier.purchasingProfile?.orderEmail || null,
            customerCodeSnapshot: supplier.purchasingProfile?.customerCode || null,
            deliveryAddressSnapshot: site.address || null,
            deliveryFeeSnapshot: totals.deliveryFeeSnapshot,
            notes: dto.notes,
            supplierMessage: dto.supplierMessage,
            createdById: actor.id,
            ...totals.orderTotals,
            lines: { create: built.lines },
          },
          include: purchaseOrderInclude(),
        });
        await createPurchaseOrderEvent(
          tx,
          organizationId,
          order.id,
          actor.id,
          'CREATED',
          `Commande ${number} créée`,
        );
        return order;
      })
      .then(serializePurchaseOrder);
  }

  async update(
    organizationId: string,
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePurchaseOrderDto,
  ) {
    await this.context.assertInstalled(organizationId);
    const existing = await this.context.ensureOrder(organizationId, id);
    this.policy.assertDraftOwner(actor, existing);
    this.policy.assertMutable(existing.status);
    const [supplier, site, settings] = await Promise.all([
      this.context.ensureSupplier(organizationId, dto.supplierId),
      this.context.ensureSite(organizationId, dto.siteId),
      this.context.ensureSettings(organizationId),
    ]);
    const built = await this.buildOrderLines(organizationId, supplier.id, dto.lines);
    if (dto.expectedDeliveryDate)
      this.delivery.assertAllowed(supplier.purchasingProfile, dto.expectedDeliveryDate);
    const totals = addDeliveryFee(built.totals, supplier.purchasingProfile?.deliveryFee);
    return this.prisma
      .$transaction(async (tx) => {
        const claimed = await tx.purchaseOrder.updateMany({
          where: {
            id,
            organizationId,
            status: PurchaseOrderStatus.DRAFT,
            version: dto.expectedVersion,
          },
          data: { version: { increment: 1 } },
        });
        if (!claimed.count)
          throw new ConflictException(
            'Le contenu de cette commande a été modifié ailleurs. Rechargez-la avant de continuer.',
          );
        await tx.purchaseOrderLine.deleteMany({ where: { orderId: id, organizationId } });
        const updated = await tx.purchaseOrder.update({
          where: { id, organizationId },
          data: {
            supplierId: supplier.id,
            siteId: site.id,
            currency: (dto.currency || settings.defaultCurrency).toUpperCase(),
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? this.delivery.dateOnly(dto.expectedDeliveryDate)
              : null,
            supplierNameSnapshot: supplier.name,
            supplierEmailSnapshot: supplier.purchasingProfile?.orderEmail || null,
            customerCodeSnapshot: supplier.purchasingProfile?.customerCode || null,
            deliveryAddressSnapshot: site.address || null,
            deliveryFeeSnapshot: totals.deliveryFeeSnapshot,
            notes: dto.notes,
            supplierMessage: dto.supplierMessage,
            ...totals.orderTotals,
            lines: { create: built.lines },
          },
          include: purchaseOrderInclude(),
        });
        await createPurchaseOrderEvent(
          tx,
          organizationId,
          id,
          actor.id,
          'UPDATED',
          `Commande ${updated.number} enregistrée`,
        );
        return updated;
      })
      .then(serializePurchaseOrder);
  }

  async duplicate(organizationId: string, actor: AuthenticatedUser, id: string) {
    const source = await this.orderQueries.detail(organizationId, actor, id);
    this.policy.assertPermission(actor, 'purchasing.draft');
    const duplicated = await this.create(organizationId, actor, {
      supplierId: source.supplierId,
      siteId: source.siteId,
      currency: source.currency,
      notes: source.notes ?? undefined,
      supplierMessage: source.supplierMessage ?? undefined,
      lines: (source.lines ?? []).map((line) => ({
        productId: line.productId,
        unitId: line.unitId ?? undefined,
        supplierReference: line.supplierReferenceSnapshot ?? undefined,
        supplierLabel: line.supplierLabelSnapshot ?? undefined,
        quantity: Number(line.orderedQuantity),
        unitsPerOrderUnit: Number(line.unitsPerOrderUnit),
        vatRate: Number(line.vatRate),
      })),
    });
    await createPurchaseOrderEvent(
      this.prisma,
      organizationId,
      duplicated.id,
      actor.id,
      'DUPLICATED',
      `Commande ${duplicated.number} dupliquée depuis ${source.number}`,
      { sourceOrderId: id },
    );
    return duplicated;
  }

  async acknowledge(organizationId: string, actor: AuthenticatedUser, id: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.write');
    const order = await this.context.ensureOrder(organizationId, id);
    this.policy.assertTransition(order.status, PurchaseOrderStatus.ACKNOWLEDGED);
    const updated = await this.prisma.purchaseOrder.update({
      where: { id, organizationId },
      data: { status: PurchaseOrderStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
    });
    await createPurchaseOrderEvent(
      this.prisma,
      organizationId,
      id,
      actor.id,
      'ACKNOWLEDGED',
      `Commande ${order.number} confirmée par le fournisseur`,
    );
    return updated;
  }

  async cancel(organizationId: string, actor: AuthenticatedUser, id: string, reason: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.write');
    const order = await this.context.ensureOrder(organizationId, id);
    this.policy.assertTransition(order.status, PurchaseOrderStatus.CANCELLED);
    const updated = await this.prisma.purchaseOrder.update({
      where: { id, organizationId },
      data: { status: PurchaseOrderStatus.CANCELLED, cancelledAt: new Date(), closeReason: reason },
    });
    await createPurchaseOrderEvent(
      this.prisma,
      organizationId,
      id,
      actor.id,
      'CANCELLED',
      `Commande ${order.number} annulée`,
      { reason },
    );
    return updated;
  }

  async close(organizationId: string, actor: AuthenticatedUser, id: string, reason: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.write');
    const order = await this.context.ensureOrder(organizationId, id);
    this.policy.assertTransition(order.status, PurchaseOrderStatus.CLOSED);
    const updated = await this.prisma.purchaseOrder.update({
      where: { id, organizationId },
      data: { status: PurchaseOrderStatus.CLOSED, closedAt: new Date(), closeReason: reason },
    });
    await createPurchaseOrderEvent(
      this.prisma,
      organizationId,
      id,
      actor.id,
      'CLOSED',
      `Reliquat de ${order.number} clôturé`,
      { reason },
    );
    return updated;
  }

  async buildOrderLines(organizationId: string, supplierId: string, input: PurchaseOrderLineDto[]) {
    const productIds = [...new Set(input.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { organizationId, id: { in: productIds }, isArchived: false },
      include: { unit: true },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const calculated: Array<{
      excludingTax: Prisma.Decimal;
      tax: Prisma.Decimal;
      includingTax: Prisma.Decimal;
    }> = [];
    const lines = input.map((line, position) => {
      const product = productMap.get(line.productId);
      if (!product)
        throw new BadRequestException('Un produit de la commande est introuvable ou archivé.');
      if (product.primarySupplierId !== supplierId)
        throw new BadRequestException(
          `Le produit « ${product.name} » n’est pas rattaché à ce fournisseur dans Stocks.`,
        );
      const quantity = new Prisma.Decimal(line.quantity);
      const factor = new Prisma.Decimal(product.unitsPerPackage ?? 1);
      const unitPrice = new Prisma.Decimal(product.averagePrice);
      const vatRate = new Prisma.Decimal(line.vatRate ?? 0);
      const totals = calculateLineTotals(quantity, unitPrice, vatRate);
      calculated.push(totals);
      return {
        organizationId,
        productId: product.id,
        unitId: product.unitId,
        position,
        productNameSnapshot: product.name,
        supplierReferenceSnapshot: product.sku,
        supplierLabelSnapshot: product.name,
        unitSymbolSnapshot: product.unit.symbol,
        orderedQuantity: quantity,
        unitsPerOrderUnit: factor,
        expectedStockQuantity: quantity.mul(factor),
        unitPrice,
        vatRate,
        lineExcludingTax: totals.excludingTax,
        lineTax: totals.tax,
        lineIncludingTax: totals.includingTax,
      };
    });
    return { lines, totals: sumTotals(calculated) };
  }
}
