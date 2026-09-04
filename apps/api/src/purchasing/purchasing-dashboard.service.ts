import { BadRequestException, Injectable } from '@nestjs/common';
import { PurchaseOrderStatus, PurchaseReceiptStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';

const OPEN_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class PurchasingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PurchaseOrderPolicy,
  ) {}

  async get(organizationId: string, actor: AuthenticatedUser) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, purchasingInstalledAt: { not: null } },
      select: { id: true },
    });
    if (!organization) throw new BadRequestException('Le module Achats n’est pas installé.');
    this.policy.assertPermission(actor, 'purchasing.read');
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const visibility = this.policy.orderVisibility(actor);
    const [orders, drafts, expected, reviewReceipts, recent] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: {
          organizationId,
          ...visibility,
          createdAt: { gte: start },
          status: { not: PurchaseOrderStatus.CANCELLED },
        },
        _sum: { totalIncludingTax: true },
        _count: true,
      }),
      this.prisma.purchaseOrder.count({
        where: { organizationId, ...visibility, status: PurchaseOrderStatus.DRAFT },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          organizationId,
          ...visibility,
          status: { in: OPEN_ORDER_STATUSES },
          expectedDeliveryDate: { lte: nextWeek },
        },
      }),
      this.prisma.purchaseReceipt.count({
        where: {
          organizationId,
          status: { in: [PurchaseReceiptStatus.DRAFT, PurchaseReceiptStatus.REVIEW_NEEDED] },
          order: visibility,
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { organizationId, ...visibility },
        include: { site: true, _count: { select: { lines: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
    ]);
    return {
      stats: {
        drafts,
        ordersThisMonth: orders._count,
        amountThisMonth: Number(orders._sum.totalIncludingTax ?? 0),
        expectedNext7Days: expected,
        receiptsToReview: reviewReceipts,
      },
      recent: recent.map(({ _count, ...order }) => ({
        ...order,
        deliveryFeeSnapshot: Number(order.deliveryFeeSnapshot ?? 0),
        totalExcludingTax: Number(order.totalExcludingTax),
        totalTax: Number(order.totalTax),
        totalIncludingTax: Number(order.totalIncludingTax),
        lineCount: _count.lines,
      })),
    };
  }
}
