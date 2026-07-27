import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductionDayClosureStatus, ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CloseProductionDayDto,
  ProductionDayClosureQueryDto,
} from './dto/production-day-closure.dto';

type Actor = { id: string; role?: string; permissions?: string[] };

const WRITE_ROLES = new Set(['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second']);

@Injectable()
export class ProductionDayClosureService {
  constructor(private readonly prisma: PrismaService) {}

  async carryOver(
    organizationId: string,
    query: ProductionDayClosureQueryDto,
  ) {
    const date = this.day(query.date);
    await this.site(organizationId, query.siteId);
    const previousClosure = await this.prisma.productionDayClosure.findFirst({
      where: {
        organizationId,
        siteId: query.siteId,
        date: { lt: date },
        status: ProductionDayClosureStatus.CLOSED,
      },
      include: { items: true },
      orderBy: { date: 'desc' },
    });
    const grouped = new Map<string, {
      outputProductId: string;
      productName: string;
      portions: number;
    }>();
    for (const item of previousClosure?.items ?? []) {
      if (!item.outputProductId || Number(item.carryOverNextPortions) <= 0) continue;
      const current = grouped.get(item.outputProductId);
      grouped.set(item.outputProductId, {
        outputProductId: item.outputProductId,
        productName: item.productNameSnapshot,
        portions:
          (current?.portions ?? 0) + Number(item.carryOverNextPortions),
      });
    }
    return {
      siteId: query.siteId,
      date: date.toISOString(),
      previousClosureDate: previousClosure?.date ?? null,
      items: [...grouped.values()],
    };
  }

  async preview(
    organizationId: string,
    query: ProductionDayClosureQueryDto,
  ) {
    const date = this.day(query.date);
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    await this.site(organizationId, query.siteId);

    const existing = await this.prisma.productionDayClosure.findUnique({
      where: {
        organizationId_siteId_date: {
          organizationId,
          siteId: query.siteId,
          date,
        },
      },
      include: {
        site: true,
        items: {
          include: { order: true, outputProduct: true },
          orderBy: { productNameSnapshot: 'asc' },
        },
      },
    });
    if (existing?.status === ProductionDayClosureStatus.CLOSED) {
      return this.serialize(existing);
    }

    const [orders, previousClosure] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where: {
          organizationId,
          siteId: query.siteId,
          productionDate: { gte: date, lt: next },
          status: { not: ProductionOrderStatus.CANCELLED },
        },
        include: {
          site: true,
          technicalSheet: true,
          outputProduct: true,
          batches: true,
          menuProductionLinks: true,
        },
        orderBy: [{ plannedTime: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.productionDayClosure.findFirst({
        where: {
          organizationId,
          siteId: query.siteId,
          date: { lt: date },
          status: ProductionDayClosureStatus.CLOSED,
        },
        include: { items: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    const carryByProduct = new Map<string, number>();
    for (const item of previousClosure?.items ?? []) {
      if (!item.outputProductId) continue;
      carryByProduct.set(
        item.outputProductId,
        (carryByProduct.get(item.outputProductId) ?? 0) + Number(item.carryOverNextPortions),
      );
    }

    const items = orders.map((order) => {
      const outputKey = order.outputProductId ?? '';
      const openingCarryOverPortions = outputKey ? carryByProduct.get(outputKey) ?? 0 : 0;
      if (outputKey) carryByProduct.set(outputKey, 0);
      const batchProduced = order.batches.reduce(
        (sum, batch) => sum + Number(batch.actualQuantity ?? 0),
        0,
      );
      const producedPortions =
        order.realizedPortions == null ? batchProduced : Number(order.realizedPortions);
      const menuTargetPortions = (order.menuProductionLinks ?? [])
        .flatMap((link: any) =>
          Array.isArray(link.snapshot?.lines) ? link.snapshot.lines : [],
        )
        .reduce(
          (sum: number, line: any) =>
            sum + Number(line.targetPortions ?? line.portions ?? 0),
          0,
        );
      const targetPortions =
        menuTargetPortions > 0
          ? menuTargetPortions
          : Math.max(
              Number(order.grossRequirement ?? 0),
              Number(order.plannedPortions ?? 0),
            );
      return {
        orderId: order.id,
        orderNumber: order.number,
        outputProductId: order.outputProductId,
        productName:
          order.outputProduct?.name ?? order.technicalSheet?.name ?? order.name,
        plannedTime: order.plannedTime,
        status: order.status,
        targetPortions,
        openingCarryOverPortions,
        producedPortions,
        totalAvailablePortions: openingCarryOverPortions + producedPortions,
        remainingPortions: 0,
        discardedPortions: 0,
        estimatedOutPortions: openingCarryOverPortions + producedPortions,
        carryOverNextPortions: 0,
        lossReason: '',
        notes: '',
      };
    });

    return {
      id: existing?.id ?? null,
      organizationId,
      siteId: query.siteId,
      site: orders[0]?.site ?? (await this.site(organizationId, query.siteId)),
      date: date.toISOString(),
      status: existing?.status ?? ProductionDayClosureStatus.DRAFT,
      closedAt: existing?.closedAt ?? null,
      previousClosureDate: previousClosure?.date ?? null,
      items,
    };
  }

  async close(organizationId: string, actor: Actor, dto: CloseProductionDayDto) {
    this.assertWrite(actor);
    const date = this.day(dto.date);
    const preview = await this.preview(organizationId, dto);
    if (!preview.items.length) {
      throw new BadRequestException('Aucune fabrication à clôturer pour cette journée.');
    }
    const existing = await this.prisma.productionDayClosure.findUnique({
      where: {
        organizationId_siteId_date: {
          organizationId,
          siteId: dto.siteId,
          date,
        },
      },
    });
    if (existing?.status === ProductionDayClosureStatus.CLOSED) {
      throw new ConflictException('Cette journée de fabrication est déjà clôturée.');
    }

    const submitted = new Map(dto.items.map((item) => [item.orderId, item]));
    if (
      submitted.size !== preview.items.length ||
      preview.items.some((item: any) => !submitted.has(item.orderId))
    ) {
      throw new BadRequestException('Tous les produits de la journée doivent être renseignés.');
    }

    const rows = preview.items.map((item: any) => {
      const entry = submitted.get(item.orderId)!;
      const remaining = Number(entry.remainingPortions);
      const discarded = Number(entry.discardedPortions);
      const carryOverNext = Number(entry.carryOverNextPortions);
      if (remaining + discarded > item.totalAvailablePortions + 0.0001) {
        throw new BadRequestException(
          `${item.productName} : le restant et le jeté dépassent le total disponible.`,
        );
      }
      if (carryOverNext > remaining + 0.0001) {
        throw new BadRequestException(
          `${item.productName} : le report ne peut pas dépasser le restant physique.`,
        );
      }
      if (discarded > 0 && !entry.lossReason?.trim()) {
        throw new BadRequestException(
          `${item.productName} : indiquez un motif pour la quantité jetée.`,
        );
      }
      return {
        organizationId,
        orderId: item.orderId,
        outputProductId: item.outputProductId,
        productNameSnapshot: item.productName,
        targetPortions: new Prisma.Decimal(item.targetPortions),
        openingCarryOverPortions: new Prisma.Decimal(item.openingCarryOverPortions),
        producedPortions: new Prisma.Decimal(item.producedPortions),
        totalAvailablePortions: new Prisma.Decimal(item.totalAvailablePortions),
        remainingPortions: new Prisma.Decimal(remaining),
        discardedPortions: new Prisma.Decimal(discarded),
        estimatedOutPortions: new Prisma.Decimal(
          Math.max(item.totalAvailablePortions - remaining - discarded, 0),
        ),
        carryOverNextPortions: new Prisma.Decimal(carryOverNext),
        lossReason: entry.lossReason?.trim() || null,
        notes: entry.notes?.trim() || null,
      };
    });

    const closure = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.productionDayClosure.upsert({
        where: {
          organizationId_siteId_date: {
            organizationId,
            siteId: dto.siteId,
            date,
          },
        },
        create: {
          organizationId,
          siteId: dto.siteId,
          date,
          status: ProductionDayClosureStatus.CLOSED,
          createdById: actor.id,
          closedById: actor.id,
          closedAt: new Date(),
          notes: dto.notes?.trim() || null,
        },
        update: {
          status: ProductionDayClosureStatus.CLOSED,
          closedById: actor.id,
          closedAt: new Date(),
          notes: dto.notes?.trim() || null,
        },
      });
      await tx.productionDayClosureItem.deleteMany({ where: { closureId: saved.id } });
      await tx.productionDayClosureItem.createMany({
        data: rows.map((row: any) => ({ ...row, closureId: saved.id })),
      });
      await this.rebaseNextProductionDay(
        tx,
        organizationId,
        actor.id,
        dto.siteId,
        date,
        rows,
      );
      return tx.productionDayClosure.findUniqueOrThrow({
        where: { id: saved.id },
        include: {
          site: true,
          items: {
            include: { order: true, outputProduct: true },
            orderBy: { productNameSnapshot: 'asc' },
          },
        },
      });
    });

    return this.serialize(closure);
  }

  private async rebaseNextProductionDay(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    siteId: string,
    closedDate: Date,
    closureRows: Array<any>,
  ) {
    const nextDate = new Date(closedDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const endDate = new Date(nextDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const carryByProduct = new Map<string, number>();
    closureRows.forEach((row) => {
      if (!row.outputProductId || Number(row.carryOverNextPortions) <= 0) return;
      carryByProduct.set(
        row.outputProductId,
        (carryByProduct.get(row.outputProductId) ?? 0) +
          Number(row.carryOverNextPortions),
      );
    });
    if (!carryByProduct.size) return;

    const orders = await tx.productionOrder.findMany({
      where: {
        organizationId,
        siteId,
        productionDate: { gte: nextDate, lt: endDate },
        outputProductId: { in: [...carryByProduct.keys()] },
        status: {
          in: [
            ProductionOrderStatus.DRAFT,
            ProductionOrderStatus.PROPOSED,
            ProductionOrderStatus.PLANNED,
            ProductionOrderStatus.BLOCKED,
          ],
        },
      },
      include: {
        requirements: true,
        batches: true,
        needAllocations: true,
        menuProductionLinks: true,
      },
      orderBy: [{ plannedTime: 'asc' }, { createdAt: 'asc' }],
    });

    for (const order of orders) {
      const availableCarry = carryByProduct.get(order.outputProductId ?? '') ?? 0;
      if (availableCarry <= 0) continue;
      const link: any = (order.menuProductionLinks as any[])?.find((entry: any) =>
        Array.isArray(entry.snapshot?.lines),
      );
      const snapshot: Record<string, any> =
        link?.snapshot &&
        typeof link.snapshot === 'object' &&
        !Array.isArray(link.snapshot)
          ? link.snapshot
          : {};
      const snapshotLines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
      const targetPortions = snapshotLines.reduce(
        (sum: number, line: any) =>
          sum + Number(line.targetPortions ?? line.portions ?? 0),
        0,
      );
      if (targetPortions <= 0) continue;

      const carryUsed = Math.min(availableCarry, targetPortions);
      const adjustedProduction = Math.max(targetPortions - carryUsed, 0);
      const currentProduction = Number(order.plannedPortions ?? 0);
      const ratio = currentProduction > 0 ? adjustedProduction / currentProduction : 0;
      carryByProduct.set(
        order.outputProductId!,
        Math.max(availableCarry - carryUsed, 0),
      );

      for (const requirement of order.requirements ?? []) {
        const requiredQuantity = Number(requirement.requiredQuantity) * ratio;
        const stockAvailable =
          requirement.stockAvailable == null
            ? null
            : Number(requirement.stockAvailable);
        await tx.productionMaterialRequirement.update({
          where: { id: requirement.id },
          data: {
            requiredQuantity: new Prisma.Decimal(requiredQuantity),
            varianceQuantity:
              stockAvailable == null
                ? null
                : new Prisma.Decimal(stockAvailable - requiredQuantity),
            estimatedCost:
              requirement.estimatedCost == null
                ? null
                : new Prisma.Decimal(Number(requirement.estimatedCost) * ratio),
          },
        });
      }
      for (const batch of order.batches ?? []) {
        await tx.productionBatch.update({
          where: { id: batch.id },
          data: {
            plannedQuantity: new Prisma.Decimal(
              Number(batch.plannedQuantity) * ratio,
            ),
          },
        });
      }
      for (const allocation of order.needAllocations ?? []) {
        await tx.productionNeedAllocation.update({
          where: { id: allocation.id },
          data: {
            plannedQuantity: new Prisma.Decimal(
              Number(allocation.plannedQuantity) * ratio,
            ),
          },
        });
        await tx.productionNeed.update({
          where: { id: allocation.needId },
          data: { quantity: new Prisma.Decimal(adjustedProduction) },
        });
      }
      if (link) {
        await tx.menuProductionLink.update({
          where: { id: link.id },
          data: {
            snapshot: {
              ...snapshot,
              lines: snapshotLines.map((line: any) => ({
                ...line,
                openingCarryOverPortions: carryUsed,
                plannedProductionPortions: adjustedProduction,
              })),
              carryOverAdjustedAt: new Date().toISOString(),
            },
          },
        });
      }
      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          plannedPortions: new Prisma.Decimal(adjustedProduction),
          grossRequirement: new Prisma.Decimal(adjustedProduction),
          netRequirement: new Prisma.Decimal(adjustedProduction),
          proposedQuantity: new Prisma.Decimal(adjustedProduction),
          validatedQuantity: new Prisma.Decimal(adjustedProduction),
          status:
            adjustedProduction <= 0
              ? ProductionOrderStatus.COMPLETED
              : order.status,
          source:
            adjustedProduction <= 0
              ? 'CARRY_OVER_COVERAGE'
              : order.source,
          completedAt: adjustedProduction <= 0 ? new Date() : order.completedAt,
          completedById: adjustedProduction <= 0 ? actorUserId : order.completedById,
          updatedById: actorUserId,
          optimisticVersion: { increment: 1 },
        },
      });
      await tx.productionHistory.create({
        data: {
          organizationId,
          orderId: order.id,
          actorUserId,
          action: 'UPDATED',
          summary: `Objectif ajusté avec ${carryUsed} portion(s) reportée(s)`,
          details: {
            targetPortions,
            carryOverPortions: carryUsed,
            previousPlannedProduction: currentProduction,
            adjustedProduction,
            sourceClosureDate: closedDate.toISOString(),
          },
        },
      });
    }
  }

  private day(value: string) {
    const day = value.slice(0, 10);
    const parsed = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Date de clôture invalide.');
    }
    return parsed;
  }

  private async site(organizationId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, isArchived: false },
    });
    if (!site) throw new NotFoundException('Site introuvable.');
    return site;
  }

  private assertWrite(actor: Actor) {
    if (
      !WRITE_ROLES.has(actor.role ?? '') &&
      !actor.permissions?.includes('production.campaign.validate')
    ) {
      throw new ForbiddenException('Droits Production insuffisants.');
    }
  }

  private serialize(closure: any) {
    return {
      ...closure,
      items: (closure.items ?? []).map((item: any) => ({
        ...item,
        productName: item.productNameSnapshot,
        targetPortions: Number(item.targetPortions),
        openingCarryOverPortions: Number(item.openingCarryOverPortions),
        producedPortions: Number(item.producedPortions),
        totalAvailablePortions: Number(item.totalAvailablePortions),
        remainingPortions: Number(item.remainingPortions),
        discardedPortions: Number(item.discardedPortions),
        estimatedOutPortions: Number(item.estimatedOutPortions),
        carryOverNextPortions: Number(item.carryOverNextPortions),
      })),
    };
  }
}
