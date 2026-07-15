import { Injectable } from '@nestjs/common';
import { PurchaseOrderStatus, StockMovementType } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchasingContextService } from './purchasing-context.service';

const OPEN_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class PurchasingSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PurchasingContextService,
    private readonly policy: PurchaseOrderPolicy,
  ) {}

  async list(organizationId: string, actor: AuthenticatedUser, supplierId?: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.draft');
    const settings = await this.context.ensureSettings(organizationId);
    const since = new Date();
    since.setDate(since.getDate() - settings.consumptionWindowDays);
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        isArchived: false,
        primarySupplierId: supplierId,
        primarySupplier: { isArchived: false },
      },
      include: { category: true, unit: true, primarySupplier: true, stocks: true },
    });
    const productIds = products.map((product) => product.id);
    const [movements, openLines] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: {
          organizationId,
          productId: { in: productIds },
          type: {
            in: [StockMovementType.OUT, StockMovementType.PRODUCTION, StockMovementType.LOSS],
          },
          movementDate: { gte: since },
        },
        select: { productId: true, quantity: true },
      }),
      this.prisma.purchaseOrderLine.findMany({
        where: {
          organizationId,
          productId: { in: productIds },
          order: { status: { in: OPEN_ORDER_STATUSES } },
        },
      }),
    ]);
    const consumed = new Map<string, number>();
    movements.forEach((movement) =>
      consumed.set(
        movement.productId,
        (consumed.get(movement.productId) ?? 0) + Math.abs(Number(movement.quantity)),
      ),
    );
    const ordered = new Map<string, number>();
    openLines.forEach((line) =>
      ordered.set(
        line.productId,
        (ordered.get(line.productId) ?? 0) +
          Math.max(0, Number(line.orderedQuantity) - Number(line.receivedQuantity)) *
            Number(line.unitsPerOrderUnit),
      ),
    );
    const items = products
      .map((product) => {
        const stock = product.stocks.reduce((sum, item) => sum + Number(item.quantity), 0);
        const daily = (consumed.get(product.id) ?? 0) / settings.consumptionWindowDays;
        const target = Math.max(Number(product.minimumStock), daily * settings.replenishmentDays);
        const needBase = Math.max(0, target - stock - (ordered.get(product.id) ?? 0));
        const rounded = needBase > 0 ? Math.ceil(needBase) : 0;
        return {
          product: {
            ...product,
            averagePrice: Number(product.averagePrice),
            minimumStock: Number(product.minimumStock),
            unitsPerPackage: product.unitsPerPackage ? Number(product.unitsPerPackage) : null,
            stockQuantity: stock,
          },
          currentStock: stock,
          averageDailyConsumption: daily,
          targetStock: target,
          openOrderQuantity: ordered.get(product.id) ?? 0,
          recommendedQuantity: rounded,
          estimatedAmount: rounded * Number(product.averagePrice),
        };
      })
      .filter((item) => item.recommendedQuantity > 0)
      .sort((a, b) => b.estimatedAmount - a.estimatedAmount);
    return {
      windowDays: settings.consumptionWindowDays,
      coverageDays: settings.replenishmentDays,
      items,
    };
  }
}
