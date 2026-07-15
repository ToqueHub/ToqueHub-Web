import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasingListQueryDto } from './dto/purchasing.dto';
import { PurchaseOrderPolicy } from './purchase-order.policy';

@Injectable()
export class PurchaseHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PurchaseOrderPolicy,
  ) {}

  async list(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PurchasingListQueryDto,
  ) {
    const installed = await this.prisma.organization.findFirst({
      where: { id: organizationId, purchasingInstalledAt: { not: null } },
      select: { id: true },
    });
    if (!installed) throw new BadRequestException('Le module Achats n’est pas installé.');
    this.policy.assertPermission(actor, 'purchasing.read');
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo
              ? new Date(`${query.dateTo.slice(0, 10)}T23:59:59.999Z`)
              : undefined,
          }
        : undefined;
    const status =
      query.status &&
      Object.values(PurchaseOrderStatus).includes(query.status as PurchaseOrderStatus)
        ? (query.status as PurchaseOrderStatus)
        : undefined;
    const where: Prisma.PurchaseOrderEventWhereInput = {
      organizationId,
      actorUserId: query.actorId,
      createdAt,
      order: {
        ...this.policy.orderVisibility(actor),
        supplierId: query.supplierId,
        status,
      },
      OR: query.search
        ? [
            { summary: { contains: query.search, mode: 'insensitive' } },
            { order: { number: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrderEvent.findMany({
        where,
        include: {
          order: { select: { id: true, number: true, supplierNameSnapshot: true } },
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseOrderEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
