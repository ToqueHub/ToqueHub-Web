import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus, PurchasingDeliveryMode } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasingListQueryDto, PurchasingReferenceQueryDto } from './dto/purchasing.dto';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { purchaseOrderDetailArgs, serializePurchaseOrder } from './purchasing-records';

const ORDERED_PRODUCT_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED,
  PurchaseOrderStatus.CLOSED,
];

@Injectable()
export class PurchaseOrderQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PurchaseOrderPolicy,
  ) {}

  async list(organizationId: string, actor: AuthenticatedUser, query: PurchasingListQueryDto) {
    await this.assertReadable(organizationId, actor);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 200);
    const status: Prisma.PurchaseOrderWhereInput['status'] = query.receivable
      ? { in: [PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.PARTIALLY_RECEIVED] }
      : this.status(query.status);
    const visibility = this.policy.orderVisibility(actor);
    const searchWhere: Prisma.PurchaseOrderWhereInput | undefined = query.search
      ? {
          OR: [
            { number: { contains: query.search, mode: 'insensitive' } },
            { supplierNameSnapshot: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : undefined;
    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      status,
      supplierId: query.supplierId,
      AND: [visibility, ...(searchWhere ? [searchWhere] : [])],
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { site: true, _count: { select: { lines: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...order }) => ({
        ...order,
        deliveryFeeSnapshot: Number(order.deliveryFeeSnapshot ?? 0),
        totalExcludingTax: Number(order.totalExcludingTax),
        totalTax: Number(order.totalTax),
        totalIncludingTax: Number(order.totalIncludingTax),
        lineCount: _count.lines,
      })),
      total,
      page,
      pageSize,
    };
  }

  async myDrafts(organizationId: string, actor: AuthenticatedUser) {
    await this.assertReadable(organizationId, actor);
    this.policy.assertPermission(actor, 'purchasing.draft');
    const drafts = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        createdById: actor.id,
        status: PurchaseOrderStatus.DRAFT,
      },
      include: { site: true, _count: { select: { lines: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return drafts.map(({ _count, ...order }) => ({
      ...order,
      deliveryFeeSnapshot: Number(order.deliveryFeeSnapshot ?? 0),
      totalExcludingTax: Number(order.totalExcludingTax),
      totalTax: Number(order.totalTax),
      totalIncludingTax: Number(order.totalIncludingTax),
      lineCount: _count.lines,
    }));
  }

  async suppliers(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PurchasingReferenceQueryDto,
  ) {
    await this.assertReadable(organizationId, actor);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 100);
    const where: Prisma.SupplierWhereInput = {
      organizationId,
      isArchived: false,
      AND: [
        {
          OR: [
            { purchasingProfile: { is: null } },
            {
              purchasingProfile: {
                is: {
                  orderingEnabled: true,
                  deliveryMode: { not: PurchasingDeliveryMode.NO_DELIVERY },
                },
              },
            },
          ],
        },
        ...(query.search
          ? [
              {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' as const } },
                  { email: { contains: query.search, mode: 'insensitive' as const } },
                  {
                    purchasingProfile: {
                      orderEmail: { contains: query.search, mode: 'insensitive' as const },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: { purchasingProfile: true, _count: { select: { primaryProducts: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...supplier }) => ({
        ...supplier,
        productCount: _count.primaryProducts,
      })),
      total,
      page,
      pageSize,
    };
  }

  async products(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PurchasingReferenceQueryDto,
  ) {
    await this.assertReadable(organizationId, actor);
    const supplier = await this.ensureSupplier(organizationId, query.supplierId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 100);
    const where: Prisma.ProductWhereInput = {
      organizationId,
      primarySupplierId: supplier.id,
      categoryId: query.categoryId,
      isArchived: false,
      ...(query.siteId
        ? { siteAssignments: { some: { siteId: query.siteId, isActive: true } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { gtin: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, unit: true, primarySupplier: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    const stockTotals = items.length
      ? await this.prisma.stock.groupBy({
          by: ['productId'],
          where: {
            organizationId,
            productId: { in: items.map(({ id }) => id) },
            ...(query.siteId ? { siteId: query.siteId } : {}),
          },
          _sum: { quantity: true },
        })
      : [];
    const totals = new Map(
      stockTotals.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]),
    );
    return {
      items: items.map((product) => ({
        ...product,
        stockQuantity: totals.get(product.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async categories(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PurchasingReferenceQueryDto,
  ) {
    await this.assertReadable(organizationId, actor);
    const supplier = await this.ensureSupplier(organizationId, query.supplierId);
    return this.prisma.category.findMany({
      where: {
        organizationId,
        isArchived: false,
        products: {
          some: {
            organizationId,
            primarySupplierId: supplier.id,
            isArchived: false,
            ...(query.siteId
              ? { siteAssignments: { some: { siteId: query.siteId, isActive: true } } }
              : {}),
          },
        },
      },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  async productHighlights(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PurchasingReferenceQueryDto,
  ) {
    await this.assertReadable(organizationId, actor);
    const supplier = await this.ensureSupplier(organizationId, query.supplierId);
    const usage = await this.prisma.purchaseOrderLine.groupBy({
      by: ['productId'],
      where: {
        organizationId,
        product: { organizationId, primarySupplierId: supplier.id, isArchived: false },
        order: {
          organizationId,
          status: { in: ORDERED_PRODUCT_STATUSES },
          ...(query.siteId ? { siteId: query.siteId } : {}),
        },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const recentUsage = [...usage]
      .sort(
        (left, right) =>
          (right._max.createdAt?.getTime() ?? 0) - (left._max.createdAt?.getTime() ?? 0),
      )
      .slice(0, 8);
    const frequentUsage = [...usage]
      .sort((left, right) => right._count._all - left._count._all)
      .slice(0, 8);
    const productIds = [
      ...new Set([...recentUsage, ...frequentUsage].map(({ productId }) => productId)),
    ];
    if (!productIds.length) return { recent: [], frequent: [] };
    const [products, stockTotals] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          organizationId,
          primarySupplierId: supplier.id,
          isArchived: false,
          ...(query.siteId
            ? { siteAssignments: { some: { siteId: query.siteId, isActive: true } } }
            : {}),
        },
        include: { category: true, unit: true, primarySupplier: true },
      }),
      this.prisma.stock.groupBy({
        by: ['productId'],
        where: {
          organizationId,
          productId: { in: productIds },
          ...(query.siteId ? { siteId: query.siteId } : {}),
        },
        _sum: { quantity: true },
      }),
    ]);
    const byId = new Map(products.map((product) => [product.id, product]));
    const stocks = new Map(
      stockTotals.map(({ productId, _sum }) => [productId, Number(_sum.quantity ?? 0)]),
    );
    const decorate = (item: (typeof usage)[number]) => {
      const product = byId.get(item.productId);
      return product
        ? {
            ...product,
            stockQuantity: stocks.get(product.id) ?? 0,
            orderCount: item._count._all,
            lastOrderedAt: item._max.createdAt,
          }
        : null;
    };
    return {
      recent: recentUsage.map(decorate).filter((product) => product !== null),
      frequent: frequentUsage.map(decorate).filter((product) => product !== null),
    };
  }

  async detail(organizationId: string, actor: AuthenticatedUser, id: string) {
    await this.assertReadable(organizationId, actor);
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId, ...this.policy.orderVisibility(actor) },
      ...purchaseOrderDetailArgs,
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return serializePurchaseOrder(order);
  }

  private async assertReadable(organizationId: string, actor: AuthenticatedUser) {
    const installed = await this.prisma.organization.findFirst({
      where: { id: organizationId, purchasingInstalledAt: { not: null } },
      select: { id: true },
    });
    if (!installed) throw new BadRequestException('Le module Achats n’est pas installé.');
    this.policy.assertPermission(actor, 'purchasing.read');
  }

  private async ensureSupplier(organizationId: string, supplierId?: string) {
    if (!supplierId)
      throw new BadRequestException(
        'Sélectionnez un fournisseur avant de rechercher ses produits.',
      );
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId, isArchived: false },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
    return supplier;
  }

  private status(value?: string) {
    return value && Object.values(PurchaseOrderStatus).includes(value as PurchaseOrderStatus)
      ? (value as PurchaseOrderStatus)
      : undefined;
  }
}
