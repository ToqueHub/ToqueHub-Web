import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConservationState,
  OperationalTaskStatus,
  Prisma,
  ProductionBatchStatus,
  ProductionHistoryAction,
  ProductionMaterialStatus,
  ProductionNeedSource,
  ProductionNeedStatus,
  ProductionOperationStatus,
  ProductionOperationType,
  ProductionOrderStatus,
  StockMovementType,
  StockReservationStatus,
  StockReservationTarget,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateProductionScenarios } from './production-calculations';
import {
  CompleteProductionBatchDto,
  CreateProductionCampaignDto,
  ProductionDayValidationQueryDto,
  ProductionStockQueryDto,
  StartProductionBatchDto,
  TransitionProductionStockDto,
  UpdateProductionOperationDto,
  ValidateProductionCampaignDto,
  ValidateProductionDayDto,
} from './dto/production-execution.dto';
import { ProductionQueryDto } from './dto/production.dto';
import { ProductionPlanningService } from './production-planning.service';
import { CatererEventLifecycleService } from './caterer-event-lifecycle.service';
import { ProductionIngredientTraceabilityService } from './production-ingredient-traceability.service';

type Actor = { id: string; role: string; permissions: string[] };
type Tx = Prisma.TransactionClient;

const LEGACY_WRITE_ROLES = new Set(['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second']);
const ACTIVE_RESERVATION = { status: StockReservationStatus.ACTIVE } as const;
const SERIALIZABLE_RETRIES = 3;
const REUSABLE_ORDER_STATUSES: ProductionOrderStatus[] = [
  ProductionOrderStatus.VALIDATED,
  ProductionOrderStatus.IN_PROGRESS,
  ProductionOrderStatus.PARTIALLY_COMPLETED,
];

@Injectable()
export class ProductionExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: ProductionPlanningService,
    private readonly catererLifecycle?: CatererEventLifecycleService,
    private readonly ingredientTraceability?: ProductionIngredientTraceabilityService,
  ) {}

  async listCampaigns(organizationId: string, query: ProductionQueryDto) {
    const take = Math.min(query.pageSize ?? 50, 200);
    const start = query.date
      ? new Date(query.date)
      : query.startDate
        ? new Date(query.startDate)
        : undefined;
    const end = query.date
      ? new Date(new Date(query.date).getTime() + 24 * 60 * 60 * 1000)
      : query.endDate
        ? new Date(query.endDate)
        : undefined;
    const where: Prisma.ProductionOrderWhereInput = {
      organizationId,
      siteId: query.siteId,
      status: query.status,
      serviceId: query.serviceId,
      responsibleEmployeeId: query.employeeId,
      productionDate: start || end ? { gte: start, lt: end } : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { number: { contains: query.search, mode: 'insensitive' } },
            { outputProduct: { name: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        include: this.campaignInclude(),
        orderBy: [{ productionDate: 'asc' }, { plannedTime: 'asc' }],
        take,
        skip: ((query.page ?? 1) - 1) * take,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return { items, total, page: query.page ?? 1, pageSize: take };
  }

  async getCampaign(organizationId: string, id: string) {
    const campaign = await this.prisma.productionOrder.findFirst({
      where: { id, organizationId },
      include: this.campaignInclude(true),
    });
    if (!campaign) throw new NotFoundException({ code: 'PRODUCTION_CAMPAIGN_NOT_FOUND' });
    return campaign;
  }

  async cancelCampaign(
    organizationId: string,
    actor: Actor,
    id: string,
    reason = 'Fabrication annulée depuis le dossier Traiteur',
  ) {
    this.assertPermission(actor, 'production.campaign.validate');
    const cancellableStatuses: ProductionOrderStatus[] = [
      ProductionOrderStatus.DRAFT,
      ProductionOrderStatus.PROPOSED,
      ProductionOrderStatus.PLANNED,
      ProductionOrderStatus.VALIDATED,
      ProductionOrderStatus.BLOCKED,
    ];
    const completed = await this.serializable(async (tx) => {
      const order = await tx.productionOrder.findFirst({
        where: { id, organizationId },
        include: {
          batches: { include: { operationalTasks: true } },
          needAllocations: true,
        },
      });
      if (!order) throw new NotFoundException({ code: 'PRODUCTION_CAMPAIGN_NOT_FOUND' });
      if (
        !cancellableStatuses.includes(order.status) ||
        order.batches.some(
          (batch) =>
            batch.status !== ProductionBatchStatus.TO_PREPARE ||
            batch.operationalTasks.some(
              (task) =>
                task.status === OperationalTaskStatus.IN_PROGRESS ||
                task.status === OperationalTaskStatus.COMPLETED,
            ),
        )
      ) {
        throw new ConflictException({
          code: 'PRODUCTION_CAMPAIGN_ALREADY_STARTED',
          status: order.status,
        });
      }
      const now = new Date();
      await tx.stockReservation.updateMany({
        where: { organizationId, orderId: id, status: StockReservationStatus.ACTIVE },
        data: {
          status: StockReservationStatus.RELEASED,
          releasedAt: now,
          reason,
        },
      });
      await tx.productionOperation.updateMany({
        where: {
          organizationId,
          batch: { orderId: id },
          status: { not: ProductionOperationStatus.COMPLETED },
        },
        data: { status: ProductionOperationStatus.CANCELLED, completedAt: now },
      });
      await tx.productionBatch.updateMany({
        where: { organizationId, orderId: id },
        data: {
          status: ProductionBatchStatus.CANCELLED,
          completedAt: now,
          optimisticVersion: { increment: 1 },
        },
      });
      await tx.operationalTask.updateMany({
        where: { organizationId, productionBatch: { orderId: id } },
        data: { status: OperationalTaskStatus.CANCELLED, completedAt: null },
      });
      await tx.productionOrder.update({
        where: { id },
        data: {
          status: ProductionOrderStatus.CANCELLED,
          cancelledAt: now,
          updatedById: actor.id,
          optimisticVersion: { increment: 1 },
        },
      });
      for (const needId of [...new Set(order.needAllocations.map((allocation) => allocation.needId))]) {
        const otherAllocations = await tx.productionNeedAllocation.count({
          where: {
            needId,
            orderId: { not: id },
            order: { status: { not: ProductionOrderStatus.CANCELLED } },
          },
        });
        if (!otherAllocations) {
          await tx.productionNeed.updateMany({
            where: {
              id: needId,
              organizationId,
              status: { not: ProductionNeedStatus.COVERED },
            },
            data: { status: ProductionNeedStatus.CANCELLED },
          });
        }
      }
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        ProductionHistoryAction.CANCELLED,
        reason,
        { stockReservationsReleased: true },
      );
      return this.getCampaignTx(tx, organizationId, id);
    });
    await this.catererLifecycle?.evaluateForOrder(organizationId, completed.id);
    return completed;
  }

  async cancelExpiredUnassignedCampaigns(organizationId: string, actor: Actor, now = new Date()) {
    this.assertPermission(actor, 'production.read');
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);

    return this.serializable(async (tx) => {
      const candidates = await tx.productionOrder.findMany({
        where: {
          organizationId,
          productionDate: { lt: cutoff },
          status: {
            in: [
              ProductionOrderStatus.DRAFT,
              ProductionOrderStatus.PROPOSED,
              ProductionOrderStatus.PLANNED,
              ProductionOrderStatus.VALIDATED,
              ProductionOrderStatus.BLOCKED,
            ],
          },
          batches: {
            some: {
              operationalTasks: {
                some: { status: { not: OperationalTaskStatus.CANCELLED } },
              },
            },
          },
        },
        select: {
          id: true,
          number: true,
          name: true,
          needAllocations: { select: { needId: true } },
          batches: {
            select: {
              operationalTasks: {
                where: { status: { not: OperationalTaskStatus.CANCELLED } },
                select: {
                  status: true,
                  endsAt: true,
                  isTimeScheduled: true,
                  assignedEmployeeId: true,
                  assignments: { select: { id: true } },
                },
              },
            },
          },
        },
      });
      const expired = candidates.filter((order) => {
        const tasks = order.batches.flatMap((batch) => batch.operationalTasks);
        return (
          tasks.length > 0 &&
          tasks.every(
            (task) =>
              task.status === OperationalTaskStatus.TODO &&
              task.endsAt < cutoff &&
              (!task.isTimeScheduled ||
                (!task.assignedEmployeeId && task.assignments.length === 0)),
          )
        );
      });
      const cancelled: Array<{ id: string; number: string; name: string }> = [];

      for (const order of expired) {
        const cancellation = await tx.productionOrder.updateMany({
          where: {
            id: order.id,
            organizationId,
            status: {
              in: [
                ProductionOrderStatus.DRAFT,
                ProductionOrderStatus.PROPOSED,
                ProductionOrderStatus.PLANNED,
                ProductionOrderStatus.VALIDATED,
                ProductionOrderStatus.BLOCKED,
              ],
            },
          },
          data: {
            status: ProductionOrderStatus.CANCELLED,
            cancelledAt: now,
            updatedById: actor.id,
            optimisticVersion: { increment: 1 },
          },
        });
        if (!cancellation.count) continue;

        await tx.stockReservation.updateMany({
          where: {
            organizationId,
            orderId: order.id,
            status: StockReservationStatus.ACTIVE,
          },
          data: {
            status: StockReservationStatus.RELEASED,
            releasedAt: now,
            reason: 'Fabrication annulée automatiquement : journée passée sans affectation.',
          },
        });
        await tx.productionOperation.updateMany({
          where: {
            organizationId,
            batch: { orderId: order.id },
            status: {
              notIn: [ProductionOperationStatus.COMPLETED, ProductionOperationStatus.CANCELLED],
            },
          },
          data: { status: ProductionOperationStatus.CANCELLED, completedAt: now },
        });
        await tx.productionBatch.updateMany({
          where: {
            organizationId,
            orderId: order.id,
            status: {
              notIn: [
                ProductionBatchStatus.COMPLETED,
                ProductionBatchStatus.PARTIALLY_LOST,
                ProductionBatchStatus.CANCELLED,
              ],
            },
          },
          data: {
            status: ProductionBatchStatus.CANCELLED,
            completedAt: now,
            optimisticVersion: { increment: 1 },
          },
        });
        await tx.operationalTask.updateMany({
          where: {
            organizationId,
            productionBatch: { orderId: order.id },
            status: { not: OperationalTaskStatus.COMPLETED },
          },
          data: { status: OperationalTaskStatus.CANCELLED, completedAt: null },
        });
        await tx.productionNeed.updateMany({
          where: {
            organizationId,
            source: ProductionNeedSource.SUB_RECIPE,
            sourceReferenceType: 'ProductionOrder',
            sourceReferenceId: order.id,
            status: {
              in: [
                ProductionNeedStatus.DRAFT,
                ProductionNeedStatus.CONFIRMED,
                ProductionNeedStatus.PARTIALLY_COVERED,
              ],
            },
          },
          data: { status: ProductionNeedStatus.CANCELLED },
        });

        for (const needId of [...new Set(order.needAllocations.map(({ needId }) => needId))]) {
          const activeAllocations = await tx.productionNeedAllocation.count({
            where: {
              needId,
              order: { status: { not: ProductionOrderStatus.CANCELLED } },
            },
          });
          if (!activeAllocations) {
            await tx.productionNeed.updateMany({
              where: {
                id: needId,
                organizationId,
                status: { not: ProductionNeedStatus.COVERED },
              },
              data: { status: ProductionNeedStatus.CANCELLED },
            });
          }
        }

        await this.history(
          tx,
          organizationId,
          order.id,
          actor.id,
          ProductionHistoryAction.CANCELLED,
          'Fabrication annulée automatiquement : journée passée sans placement ni affectation',
          { cutoff: cutoff.toISOString(), stockReservationsReleased: true },
        );
        cancelled.push({ id: order.id, number: order.number, name: order.name });
      }

      return {
        cutoff: cutoff.toISOString(),
        cancelledCount: cancelled.length,
        cancelled,
      };
    });
  }

  async createCampaign(organizationId: string, actor: Actor, dto: CreateProductionCampaignDto) {
    this.assertPermission(actor, 'production.campaign.validate');
    const neededAt = this.date(dto.neededAt, 'PRODUCTION_INVALID_NEEDED_AT');
    const productionDate = dto.productionDate
      ? this.date(dto.productionDate, 'PRODUCTION_INVALID_PRODUCTION_DATE')
      : neededAt;
    if (productionDate > neededAt) {
      throw new BadRequestException({ code: 'PRODUCTION_DATE_AFTER_NEEDED_AT' });
    }
    const profile = await this.prisma.productionProfile.findFirst({
      where: { id: dto.profileId, organizationId },
      include: {
        site: true,
        outputProduct: { include: { unit: true } },
        outputVariant: true,
        yieldUnit: true,
        technicalSheet: {
          include: {
            ingredients: {
              include: {
                product: { include: { unit: true, primarySupplier: true } },
                unit: true,
              },
              orderBy: { order: 'asc' },
            },
            steps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException({ code: 'PRODUCTION_PROFILE_NOT_FOUND' });
    if (dto.serviceId) {
      const service = await this.prisma.hrDepartment.findFirst({
        where: { id: dto.serviceId, organizationId, isArchived: false },
      });
      if (!service) throw new BadRequestException({ code: 'PRODUCTION_SERVICE_INVALID' });
    }
    if (dto.destinationLocationId) {
      const location = await this.prisma.location.findFirst({
        where: {
          id: dto.destinationLocationId,
          organizationId,
          siteId: profile.siteId,
          isArchived: false,
        },
      });
      if (!location)
        throw new BadRequestException({ code: 'PRODUCTION_DESTINATION_LOCATION_INVALID' });
    }
    const targetQuantity =
      dto.targetQuantity == null ? null : new Prisma.Decimal(dto.targetQuantity);
    if (targetQuantity && (!targetQuantity.isFinite() || targetQuantity.lte(0))) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_TARGET_QUANTITY' });
    }
    const grossRequirement = this.productionTargetToOutputQuantity(
      profile,
      dto.grossRequirement,
      dto.targetMode,
      targetQuantity,
    );
    if (!grossRequirement.isFinite() || grossRequirement.lte(0)) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_QUANTITY' });
    }

    const availability = await this.planning.getAvailability(
      organizationId,
      profile.siteId,
      profile.outputProductId,
      profile.outputVariantId,
      neededAt,
    );
    const needIds = [...new Set(dto.needIds ?? [])];
    const fulfillsExplicitNeeds = needIds.length > 0;
    const scenarios = generateProductionScenarios({
      grossRequirement,
      // Une fabrication libre est une consigne de produire la quantité saisie.
      // Seules les campagnes créées pour des besoins explicites doivent déduire
      // le stock disponible et les productions déjà confirmées.
      usableStock: fulfillsExplicitNeeds ? availability.usable : 0,
      confirmedProduction: fulfillsExplicitNeeds ? availability.confirmedProduction : 0,
      storageCapacity: dto.storageCapacity,
      optimizedTarget: dto.optimizedTarget,
      rules: this.planning.rulesForProfile(profile),
    });
    const selected =
      scenarios.find((scenario) => scenario.kind === (dto.scenarioKind ?? 'RECOMMENDED')) ??
      scenarios[0];
    if (!selected) throw new ConflictException({ code: 'PRODUCTION_NO_FEASIBLE_SCENARIO' });

    const needs = needIds.length
      ? await this.prisma.productionNeed.findMany({
          where: {
            id: { in: needIds },
            organizationId,
            siteId: profile.siteId,
            productId: profile.outputProductId,
            variantId: profile.outputVariantId,
            status: {
              in: [
                ProductionNeedStatus.DRAFT,
                ProductionNeedStatus.CONFIRMED,
                ProductionNeedStatus.PARTIALLY_COVERED,
              ],
            },
          },
          orderBy: [{ neededAt: 'asc' }, { priority: 'desc' }],
        })
      : [];
    if (needs.length !== needIds.length) {
      throw new BadRequestException({ code: 'PRODUCTION_NEEDS_INCOMPATIBLE_WITH_PROFILE' });
    }

    return this.serializable(async (tx) => {
      const recipeVersion = await this.planning.snapshotRecipeTx(
        tx,
        organizationId,
        profile.technicalSheetId,
      );
      const number = await this.nextCampaignNumber(tx, organizationId);
      const gross = grossRequirement;
      const proposed = new Prisma.Decimal(selected.quantity);
      const net = fulfillsExplicitNeeds
        ? Prisma.Decimal.max(
            0,
            gross.sub(availability.usable).sub(availability.confirmedProduction),
          )
        : gross;
      const order = await tx.productionOrder.create({
        data: {
          organizationId,
          siteId: profile.siteId,
          number,
          name: dto.name?.trim() || profile.technicalSheet.name,
          technicalSheetId: profile.technicalSheetId,
          recipeVersionId: recipeVersion.id,
          outputProductId: profile.outputProductId,
          outputVariantId: profile.outputVariantId,
          productionDate,
          plannedTime: dto.plannedTime ?? '08:00',
          status: proposed.lte(0)
            ? ProductionOrderStatus.COMPLETED
            : ProductionOrderStatus.PROPOSED,
          priority: dto.priority,
          serviceId: dto.serviceId,
          responsibleEmployeeId: dto.responsibleEmployeeId,
          targetMode: dto.targetMode,
          targetQuantity,
          plannedPortions: proposed,
          grossRequirement: gross,
          netRequirement: net,
          proposedQuantity: proposed,
          validatedQuantity: proposed,
          surplusQuantity: Prisma.Decimal.max(0, proposed.sub(net)),
          comments: dto.comments,
          source: needs.length ? 'NEEDS' : 'MANUAL_REACTIVE',
          createdById: actor.id,
        },
      });

      await this.createNeedAllocations(
        tx,
        organizationId,
        order.id,
        needs,
        proposed.lte(0) ? gross : Prisma.Decimal.min(net, proposed),
      );
      if (proposed.lte(0)) {
        const reservedFromStock = await this.reserveExistingOutputForCoverage(
          tx,
          organizationId,
          actor.id,
          order,
          profile.outputProduct.unitId,
        );
        if (reservedFromStock.lt(gross)) {
          throw new ConflictException({
            code: 'PRODUCTION_NEED_COVERED_BY_CONFIRMED_FUTURE_OUTPUT',
            message:
              'Le besoin est couvert par une production déjà planifiée mais doit lui être affecté.',
            reservedFromStock: reservedFromStock.toFixed(3),
            remaining: gross.sub(reservedFromStock).toFixed(3),
          });
        }
        await tx.productionOrder.update({
          where: { id: order.id },
          data: {
            reservedQuantity: reservedFromStock,
            completedAt: new Date(),
            completedById: actor.id,
            source: 'STOCK_COVERAGE',
          },
        });
        await this.history(
          tx,
          organizationId,
          order.id,
          actor.id,
          ProductionHistoryAction.CREATED,
          `Besoin couvert sans fabrication par le stock existant`,
          { availability, reservedFromStock: reservedFromStock.toFixed(3) },
        );
        return this.getCampaignTx(tx, organizationId, order.id);
      }
      await this.createRequirements(
        tx,
        organizationId,
        order.id,
        profile.siteId,
        profile.referenceYield,
        proposed,
        profile.technicalSheet.ingredients,
      );
      await this.createBatchesAndOperations(
        tx,
        organizationId,
        order.id,
        recipeVersion.id,
        profile.yieldUnitId,
        dto.destinationLocationId,
        productionDate,
        dto.plannedTime ?? '08:00',
        selected.batches,
        profile.technicalSheet.steps,
      );
      if (dto.createSubRecipeNeeds !== false) {
        await this.createSubRecipeNeeds(tx, organizationId, actor.id, order, profile.siteId);
      }
      await this.history(
        tx,
        organizationId,
        order.id,
        actor.id,
        ProductionHistoryAction.CREATED,
        `Campagne ${number} créée`,
        JSON.parse(
          JSON.stringify({ scenario: selected, availability, profileId: profile.id }),
        ) as Prisma.InputJsonValue,
      );
      return this.getCampaignTx(tx, organizationId, order.id);
    });
  }

  async attachNeedToCompatibleCampaign(
    organizationId: string,
    actor: Actor,
    needId: string,
  ) {
    this.assertPermission(actor, 'production.campaign.validate');
    return this.serializable(async (tx) => {
      const need = await tx.productionNeed.findFirst({
        where: {
          id: needId,
          organizationId,
          status: {
            in: [
              ProductionNeedStatus.DRAFT,
              ProductionNeedStatus.CONFIRMED,
              ProductionNeedStatus.PARTIALLY_COVERED,
            ],
          },
        },
        include: {
          allocations: {
            include: {
              order: {
                select: {
                  id: true,
                  status: true,
                  productionDate: true,
                },
              },
            },
          },
        },
      });
      if (!need) return null;

      const activeAllocations = need.allocations.filter(
        (allocation) =>
          REUSABLE_ORDER_STATUSES.includes(allocation.order.status) &&
          allocation.order.productionDate <= need.neededAt,
      );
      const outstandingPlanned = activeAllocations.reduce(
        (sum, allocation) =>
          sum.add(
            Prisma.Decimal.max(
              0,
              allocation.plannedQuantity
                .sub(allocation.reservedQuantity)
                .sub(allocation.consumedQuantity),
            ),
          ),
        new Prisma.Decimal(0),
      );
      const remaining = Prisma.Decimal.max(
        0,
        need.quantity.sub(need.coveredQuantity).sub(outstandingPlanned),
      );
      if (remaining.lte('0.001')) {
        const allocatedOrderId = activeAllocations[0]?.orderId;
        return allocatedOrderId
          ? this.getCampaignTx(tx, organizationId, allocatedOrderId)
          : null;
      }

      const candidates = await tx.productionOrder.findMany({
        where: {
          organizationId,
          siteId: need.siteId,
          outputProductId: need.productId,
          outputVariantId: need.variantId,
          status: { in: REUSABLE_ORDER_STATUSES },
          productionDate: { lte: need.neededAt },
        },
        include: {
          needAllocations: {
            where: {
              need: { status: { not: ProductionNeedStatus.CANCELLED } },
            },
            select: { plannedQuantity: true },
          },
        },
        orderBy: [{ productionDate: 'desc' }, { createdAt: 'asc' }],
      });
      const campaign = candidates.find((candidate) => {
        const capacity = candidate.validatedQuantity.gt(0)
          ? candidate.validatedQuantity
          : candidate.plannedPortions;
        const allocated = candidate.needAllocations.reduce(
          (sum, allocation) => sum.add(allocation.plannedQuantity),
          new Prisma.Decimal(0),
        );
        return Prisma.Decimal.max(0, capacity.sub(allocated)).gte(remaining);
      });
      if (!campaign) return null;

      await tx.productionNeedAllocation.upsert({
        where: {
          needId_orderId: {
            needId: need.id,
            orderId: campaign.id,
          },
        },
        create: {
          organizationId,
          needId: need.id,
          orderId: campaign.id,
          plannedQuantity: remaining,
        },
        update: {
          plannedQuantity: { increment: remaining },
        },
      });
      await tx.productionNeed.update({
        where: { id: need.id },
        data: {
          status: need.coveredQuantity.gte(need.quantity)
            ? ProductionNeedStatus.COVERED
            : ProductionNeedStatus.PARTIALLY_COVERED,
        },
      });
      await this.history(
        tx,
        organizationId,
        campaign.id,
        actor.id,
        ProductionHistoryAction.UPDATED,
        'Besoin du menu affecté à une fabrication déjà planifiée',
        {
          needId: need.id,
          plannedQuantity: remaining.toFixed(3),
        },
      );
      return this.getCampaignTx(tx, organizationId, campaign.id);
    });
  }

  async rescheduleCampaign(
    organizationId: string,
    actor: Actor,
    id: string,
    input: {
      grossRequirement: string;
      plannedTime: string;
      productionDate?: string;
      serviceId?: string;
      targetPortions?: string;
      targetMode?: 'PORTIONS' | 'MASS';
      targetQuantity?: string;
    },
  ) {
    this.assertPermission(actor, 'production.campaign.validate');
    const gross = new Prisma.Decimal(input.grossRequirement);
    const productionDate = input.productionDate
      ? this.date(input.productionDate, 'PRODUCTION_INVALID_PRODUCTION_DATE')
      : null;
    if (!gross.isFinite() || gross.lte(0)) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_QUANTITY' });
    }
    const targetPortions =
      input.targetPortions == null ? null : new Prisma.Decimal(input.targetPortions);
    if (targetPortions && (!targetPortions.isFinite() || targetPortions.lte(0))) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_TARGET_QUANTITY' });
    }
    const targetQuantity =
      input.targetQuantity == null ? null : new Prisma.Decimal(input.targetQuantity);
    if (targetQuantity && (!targetQuantity.isFinite() || targetQuantity.lte(0))) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_TARGET_QUANTITY' });
    }
    if (input.serviceId) {
      const service = await this.prisma.hrDepartment.findFirst({
        where: {
          id: input.serviceId,
          organizationId,
          isArchived: false,
        },
        select: { id: true },
      });
      if (!service) {
        throw new BadRequestException({ code: 'PRODUCTION_SERVICE_INVALID' });
      }
    }
    const current = await this.prisma.productionOrder.findFirst({
      where: { id, organizationId },
      include: { batches: true, needAllocations: { include: { need: true } } },
    });
    if (!current) throw new NotFoundException({ code: 'PRODUCTION_CAMPAIGN_NOT_FOUND' });
    const editableStatuses: ProductionOrderStatus[] = [
      ProductionOrderStatus.DRAFT,
      ProductionOrderStatus.PROPOSED,
      ProductionOrderStatus.PLANNED,
      ProductionOrderStatus.BLOCKED,
    ];
    if (
      !editableStatuses.includes(current.status) ||
      current.batches.some((batch) => batch.status !== ProductionBatchStatus.TO_PREPARE)
    ) {
      throw new ConflictException({
        code: 'PRODUCTION_CAMPAIGN_NOT_EDITABLE',
        status: current.status,
      });
    }
    if (
      productionDate &&
      current.needAllocations.some((allocation) => productionDate > allocation.need.neededAt)
    ) {
      throw new BadRequestException({ code: 'PRODUCTION_DATE_AFTER_NEEDED_AT' });
    }
    const profile = await this.prisma.productionProfile.findFirst({
      where: {
        organizationId,
        siteId: current.siteId ?? undefined,
        technicalSheetId: current.technicalSheetId,
        outputProductId: current.outputProductId ?? undefined,
        outputVariantId: current.outputVariantId,
      },
      include: {
        technicalSheet: {
          include: {
            ingredients: {
              include: {
                product: { include: { unit: true, primarySupplier: true } },
                unit: true,
              },
              orderBy: { order: 'asc' },
            },
            steps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!profile || !current.siteId) {
      throw new ConflictException({ code: 'PRODUCTION_PROFILE_REQUIRED_FOR_MENU' });
    }
    const [selected] = generateProductionScenarios({
      grossRequirement: gross,
      usableStock: 0,
      confirmedProduction: 0,
      rules: this.planning.rulesForProfile(profile),
    });
    if (!selected) {
      throw new ConflictException({ code: 'PRODUCTION_NO_FEASIBLE_SCENARIO' });
    }
    const proposed = new Prisma.Decimal(selected.quantity);

    return this.serializable(async (tx) => {
      const order = await tx.productionOrder.findFirst({
        where: { id, organizationId },
        include: {
          batches: true,
          needAllocations: { include: { need: true } },
          menuProductionLinks: true,
        },
      });
      if (
        !order ||
        !editableStatuses.includes(order.status) ||
        order.batches.some((batch) => batch.status !== ProductionBatchStatus.TO_PREPARE)
      ) {
        throw new ConflictException({
          code: 'PRODUCTION_CAMPAIGN_NOT_EDITABLE',
          status: order?.status,
        });
      }
      const taskCount = await tx.operationalTask.count({
        where: {
          organizationId,
          productionBatch: { orderId: id },
          status: { not: OperationalTaskStatus.CANCELLED },
        },
      });
      if (taskCount) {
        throw new ConflictException({ code: 'PRODUCTION_CAMPAIGN_NOT_EDITABLE' });
      }

      await tx.stockReservation.updateMany({
        where: { organizationId, orderId: id, status: StockReservationStatus.ACTIVE },
        data: { status: StockReservationStatus.RELEASED, releasedAt: new Date() },
      });
      await tx.productionMaterialRequirement.deleteMany({ where: { orderId: id } });
      await tx.productionBatch.deleteMany({ where: { orderId: id } });

      await tx.productionOrder.update({
        where: { id },
        data: {
          plannedTime: input.plannedTime,
          productionDate: productionDate ?? order.productionDate,
          serviceId: input.serviceId,
          targetMode: input.targetMode,
          targetQuantity,
          status: ProductionOrderStatus.PROPOSED,
          plannedPortions: proposed,
          grossRequirement: gross,
          netRequirement: gross,
          proposedQuantity: proposed,
          validatedQuantity: proposed,
          reservedQuantity: 0,
          surplusQuantity: Prisma.Decimal.max(0, proposed.sub(gross)),
          updatedById: actor.id,
          optimisticVersion: { increment: 1 },
        },
      });

      if (targetPortions && order.menuProductionLinks.length) {
        const linkedLines = order.menuProductionLinks.flatMap((link) => {
          const snapshot =
            link.snapshot && typeof link.snapshot === 'object' && !Array.isArray(link.snapshot)
              ? (link.snapshot as Record<string, any>)
              : {};
          const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
          return lines.map((line) => ({ linkId: link.id, line }));
        });
        const currentGrossTotal = linkedLines.reduce(
          (sum, entry) => sum.add(Number(entry.line?.portions ?? 0)),
          new Prisma.Decimal(0),
        );
        const currentTargetTotal = linkedLines.reduce(
          (sum, entry) => sum.add(Number(entry.line?.targetPortions ?? entry.line?.portions ?? 0)),
          new Prisma.Decimal(0),
        );
        const lineCount = Math.max(linkedLines.length, 1);

        for (const link of order.menuProductionLinks) {
          const snapshot =
            link.snapshot && typeof link.snapshot === 'object' && !Array.isArray(link.snapshot)
              ? (link.snapshot as Record<string, any>)
              : {};
          const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
          const updatedLines = lines.map((line) => {
            const grossWeight = currentGrossTotal.gt(0)
              ? new Prisma.Decimal(Number(line?.portions ?? 0)).div(currentGrossTotal)
              : new Prisma.Decimal(1).div(lineCount);
            const targetWeight = currentTargetTotal.gt(0)
              ? new Prisma.Decimal(Number(line?.targetPortions ?? line?.portions ?? 0)).div(
                  currentTargetTotal,
                )
              : grossWeight;
            return {
              ...line,
              portions: Number(gross.mul(grossWeight).toDecimalPlaces(3).toString()),
              targetPortions: Number(
                targetPortions.mul(targetWeight).toDecimalPlaces(3).toString(),
              ),
              plannedTime: input.plannedTime,
              productionDate: (productionDate ?? order.productionDate).toISOString(),
            };
          });
          await tx.menuProductionLink.update({
            where: { id: link.id },
            data: {
              snapshot: {
                ...snapshot,
                lines: updatedLines,
              } as Prisma.InputJsonValue,
            },
          });
          for (const line of updatedLines) {
            if (!line?.menuItemId) continue;
            await tx.menuItem.updateMany({
              where: {
                id: line.menuItemId,
                organizationId,
              },
              data: {
                portionsOverride: new Prisma.Decimal(line.targetPortions),
              },
            });
          }
        }
      }

      if (order.needAllocations.length === 1) {
        const allocation = order.needAllocations[0];
        await tx.productionNeedAllocation.update({
          where: { id: allocation.id },
          data: { plannedQuantity: gross, reservedQuantity: 0, consumedQuantity: 0 },
        });
        await tx.productionNeed.update({
          where: { id: allocation.needId },
          data: {
            quantity: gross,
            status: ProductionNeedStatus.PARTIALLY_COVERED,
          },
        });
      }

      await this.createRequirements(
        tx,
        organizationId,
        id,
        current.siteId!,
        profile.referenceYield,
        proposed,
        profile.technicalSheet.ingredients,
      );
      await this.createBatchesAndOperations(
        tx,
        organizationId,
        id,
        order.recipeVersionId!,
        profile.yieldUnitId,
        undefined,
        productionDate ?? order.productionDate,
        input.plannedTime,
        selected.batches,
        profile.technicalSheet.steps,
      );
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        ProductionHistoryAction.UPDATED,
        `Objectif de fabrication modifié à ${gross.toFixed(3)} portion(s)`,
        {
          previousGrossRequirement: order.grossRequirement.toFixed(3),
          grossRequirement: gross.toFixed(3),
          proposedQuantity: proposed.toFixed(3),
          productionDate: (productionDate ?? order.productionDate).toISOString(),
        },
      );
      return this.getCampaignTx(tx, organizationId, id);
    });
  }

  async validateCampaign(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: ValidateProductionCampaignDto,
  ) {
    this.assertPermission(actor, 'production.campaign.validate');
    if (dto.allowShortage) {
      this.assertPermission(actor, 'production.override');
      if (!dto.overrideReason?.trim()) {
        throw new BadRequestException({ code: 'PRODUCTION_OVERRIDE_REASON_REQUIRED' });
      }
    }
    return this.serializable(async (tx) => {
      const order = await tx.productionOrder.findFirst({
        where: { id, organizationId },
        include: {
          requirements: { include: { product: { include: { unit: true } }, unit: true } },
          stockReservations: { where: ACTIVE_RESERVATION },
          assignments: true,
          technicalSheet: { include: { steps: { orderBy: { order: 'asc' } } } },
          batches: {
            include: { operations: { orderBy: { position: 'asc' } }, unit: true },
            orderBy: { number: 'asc' },
          },
        },
      });
      if (!order) throw new NotFoundException({ code: 'PRODUCTION_CAMPAIGN_NOT_FOUND' });
      if (!order.siteId) throw new ConflictException({ code: 'PRODUCTION_CAMPAIGN_SITE_REQUIRED' });
      if (
        (
          [
            ProductionOrderStatus.VALIDATED,
            ProductionOrderStatus.IN_PROGRESS,
            ProductionOrderStatus.PARTIALLY_COMPLETED,
          ] as ProductionOrderStatus[]
        ).includes(order.status) &&
        order.stockReservations.length
      ) {
        await this.createOperationalTasksTx(tx, organizationId, actor.id, order);
        return this.getCampaignTx(tx, organizationId, id);
      }
      if (
        !(
          [
            ProductionOrderStatus.PROPOSED,
            ProductionOrderStatus.PLANNED,
            ProductionOrderStatus.DRAFT,
            ProductionOrderStatus.BLOCKED,
          ] as ProductionOrderStatus[]
        ).includes(order.status)
      ) {
        throw new ConflictException({
          code: 'PRODUCTION_CAMPAIGN_NOT_VALIDATABLE',
          status: order.status,
        });
      }

      await tx.stockReservation.updateMany({
        where: { organizationId, orderId: id, status: StockReservationStatus.ACTIVE },
        data: { status: StockReservationStatus.RELEASED, releasedAt: new Date() },
      });
      const shortages: Array<Record<string, string>> = [];
      for (const requirement of order.requirements) {
        const requiredStockUnit = await this.convertTx(
          tx,
          organizationId,
          requirement.unitId,
          requirement.product.unitId,
          requirement.requiredQuantity,
        );
        if (!requiredStockUnit) {
          shortages.push({
            productId: requirement.productId,
            productName: requirement.productNameSnapshot,
            shortage: requirement.requiredQuantity.toFixed(3),
            reason: 'UNIT_NOT_CONVERTIBLE',
          });
          await tx.productionMaterialRequirement.update({
            where: { id: requirement.id },
            data: { status: ProductionMaterialStatus.UNIT_NOT_CONVERTIBLE },
          });
          continue;
        }
        const result = await this.reserveProductFefo(
          tx,
          organizationId,
          actor.id,
          order,
          requirement.productId,
          requirement.product.unitId,
          requiredStockUnit,
          dto.idempotencyKey,
        );
        const shortage = requiredStockUnit.sub(result.reserved);
        if (shortage.gt(0)) {
          shortages.push({
            productId: requirement.productId,
            productName: requirement.productNameSnapshot,
            shortage: shortage.toFixed(3),
            reason: 'INSUFFICIENT_STOCK',
          });
        }
        await tx.productionMaterialRequirement.update({
          where: { id: requirement.id },
          data: {
            stockAvailable: result.reserved,
            varianceQuantity: result.reserved.sub(requiredStockUnit),
            status: shortage.gt(0)
              ? ProductionMaterialStatus.INSUFFICIENT_STOCK
              : ProductionMaterialStatus.OK,
          },
        });
      }
      if (shortages.length && !dto.allowShortage) {
        throw new ConflictException({ code: 'PRODUCTION_COMPONENT_SHORTAGE', shortages });
      }

      await tx.productionOrder.update({
        where: { id },
        data: {
          status: ProductionOrderStatus.VALIDATED,
          updatedById: actor.id,
          optimisticVersion: { increment: 1 },
        },
      });
      await this.createOperationalTasksTx(tx, organizationId, actor.id, order);
      if (shortages.length) {
        await tx.productionAlert.create({
          data: {
            organizationId,
            orderId: id,
            code: 'MISSING_MATERIAL',
            severity: 'CRITICAL',
            title: 'Composants insuffisants',
            message: `Validation dérogatoire : ${shortages.length} composant(s) incomplet(s).`,
            details: { shortages, overrideReason: dto.overrideReason },
          },
        });
      }
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        ProductionHistoryAction.VALIDATED,
        'Campagne validée et composants réservés en FEFO',
        { shortages, overrideReason: dto.overrideReason },
      );
      return this.getCampaignTx(tx, organizationId, id);
    });
  }

  async previewProductionDay(
    organizationId: string,
    actor: Actor,
    query: ProductionDayValidationQueryDto,
  ) {
    this.assertPermission(actor, 'production.read');
    return this.productionDaySnapshot(organizationId, query);
  }

  async validateProductionDay(organizationId: string, actor: Actor, dto: ValidateProductionDayDto) {
    this.assertPermission(actor, 'production.batch.execute');
    const preview = await this.productionDaySnapshot(organizationId, dto);
    if (preview.completed) return preview;
    if (!preview.orders.length) {
      throw new BadRequestException({ code: 'PRODUCTION_DAY_EMPTY' });
    }
    if (!preview.ready) {
      throw new ConflictException({
        code: 'PRODUCTION_DAY_NOT_READY',
        issues: preview.blockingIssues,
      });
    }

    for (const order of preview.orders) {
      for (const batch of order.batches) {
        if (
          (
            [
              ProductionBatchStatus.COMPLETED,
              ProductionBatchStatus.PARTIALLY_LOST,
              ProductionBatchStatus.CANCELLED,
            ] as ProductionBatchStatus[]
          ).includes(batch.status)
        ) {
          continue;
        }
        if (batch.status === ProductionBatchStatus.TO_PREPARE) {
          await this.startBatch(organizationId, actor, batch.id, {
            idempotencyKey: dto.idempotencyKey,
          });
        }
        await this.completeBatch(organizationId, actor, batch.id, {
          actualQuantity: new Prisma.Decimal(batch.plannedQuantity).toFixed(3),
          lostQuantity: '0',
          idempotencyKey: `${dto.idempotencyKey.slice(0, 70)}:${batch.id}`,
          notes: `Validation groupée de la journée de production du ${dto.date}`,
        });
      }
    }
    return this.productionDaySnapshot(organizationId, dto);
  }

  async startBatch(
    organizationId: string,
    actor: Actor,
    id: string,
    _dto: StartProductionBatchDto,
  ) {
    this.assertPermission(actor, 'production.batch.execute');
    return this.serializable(async (tx) => {
      const batch = await tx.productionBatch.findFirst({
        where: { id, organizationId },
        include: {
          order: { include: { outputProduct: { include: { unit: true } } } },
          unit: true,
          operations: { orderBy: { position: 'asc' } },
        },
      });
      if (!batch) throw new NotFoundException({ code: 'PRODUCTION_BATCH_NOT_FOUND' });
      if (
        (
          [
            ProductionBatchStatus.COMPLETED,
            ProductionBatchStatus.PARTIALLY_LOST,
          ] as ProductionBatchStatus[]
        ).includes(batch.status)
      ) {
        return batch;
      }
      if (
        !(
          [
            ProductionOrderStatus.VALIDATED,
            ProductionOrderStatus.IN_PROGRESS,
            ProductionOrderStatus.PARTIALLY_COMPLETED,
          ] as ProductionOrderStatus[]
        ).includes(batch.order.status)
      ) {
        throw new ConflictException({
          code: 'PRODUCTION_CAMPAIGN_NOT_READY',
          status: batch.order.status,
        });
      }
      const now = new Date();
      const firstOperation = batch.operations.find((operation) =>
        (
          [
            ProductionOperationStatus.PENDING,
            ProductionOperationStatus.READY,
          ] as ProductionOperationStatus[]
        ).includes(operation.status),
      );
      if (firstOperation) {
        await tx.productionOperation.update({
          where: { id: firstOperation.id },
          data: { status: ProductionOperationStatus.IN_PROGRESS, startedAt: now },
        });
        await tx.operationalTask.updateMany({
          where: { organizationId, productionOperationId: firstOperation.id },
          data: { status: OperationalTaskStatus.IN_PROGRESS, completedAt: null },
        });
      }
      await tx.operationalTask.updateMany({
        where: { organizationId, productionBatchId: batch.id, productionOperationId: null },
        data: { status: OperationalTaskStatus.IN_PROGRESS, completedAt: null },
      });
      await tx.productionOrder.update({
        where: { id: batch.orderId },
        data: { status: ProductionOrderStatus.IN_PROGRESS, updatedById: actor.id },
      });
      await this.syncHaccpProductionStartTx(tx, organizationId, actor.id, batch, now);
      return tx.productionBatch.update({
        where: { id },
        data: {
          status: ProductionBatchStatus.PREPARING,
          startedAt: batch.startedAt ?? now,
          producerUserId: actor.id,
          optimisticVersion: { increment: 1 },
        },
        include: { order: true, operations: { orderBy: { position: 'asc' } } },
      });
    });
  }

  /**
   * Restarts the execution workflow without touching HACCP ingredient evidence.
   * A completed batch cannot safely be reopened because it may already have
   * created stock movements and an output lot.
   */
  async restartBatch(organizationId: string, actor: Actor, id: string) {
    this.assertPermission(actor, 'production.batch.execute');
    return this.serializable(async (tx) => {
      const batch = await tx.productionBatch.findFirst({
        where: { id, organizationId },
        include: {
          order: { include: { batches: { select: { id: true, status: true } } } },
          operations: { orderBy: { position: 'asc' } },
        },
      });
      if (!batch) throw new NotFoundException({ code: 'PRODUCTION_BATCH_NOT_FOUND' });
      const terminalStatuses: ProductionBatchStatus[] = [
        ProductionBatchStatus.COMPLETED,
        ProductionBatchStatus.PARTIALLY_LOST,
      ];
      if (terminalStatuses.includes(batch.status)) {
        throw new ConflictException({
          code: 'PRODUCTION_BATCH_RESTART_NOT_ALLOWED',
          status: batch.status,
          message: 'Un lot clôturé ne peut pas être recommencé.',
        });
      }

      const firstOperation = batch.operations[0];
      await Promise.all(
        batch.operations.map((operation) =>
          tx.productionOperation.update({
            where: { id: operation.id },
            data: {
              status:
                operation.id === firstOperation?.id
                  ? ProductionOperationStatus.READY
                  : ProductionOperationStatus.PENDING,
              startedAt: null,
              completedAt: null,
            },
          }),
        ),
      );
      await tx.operationalTask.updateMany({
        where: { organizationId, productionBatchId: batch.id },
        data: { status: OperationalTaskStatus.TODO, completedAt: null },
      });

      const activeStatuses: ProductionBatchStatus[] = [
        ProductionBatchStatus.PREPARING,
        ProductionBatchStatus.COOKING,
        ProductionBatchStatus.COOLING,
        ProductionBatchStatus.FREEZING,
      ];
      const otherActiveBatches = batch.order.batches.some(
        (other) =>
          other.id !== batch.id &&
          activeStatuses.includes(other.status),
      );
      await tx.productionOrder.update({
        where: { id: batch.orderId },
        data: {
          status: otherActiveBatches ? ProductionOrderStatus.IN_PROGRESS : ProductionOrderStatus.VALIDATED,
          updatedById: actor.id,
        },
      });

      return tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          status: ProductionBatchStatus.TO_PREPARE,
          startedAt: null,
          producerUserId: null,
          optimisticVersion: { increment: 1 },
        },
        include: { order: true, operations: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async updateOperation(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: UpdateProductionOperationDto,
  ) {
    this.assertPermission(actor, 'production.batch.execute');
    return this.serializable(async (tx) => {
      const operation = await tx.productionOperation.findFirst({
        where: { id, organizationId },
        include: {
          dependencies: { include: { prerequisite: true } },
          batch: { include: { order: true } },
        },
      });
      if (!operation) throw new NotFoundException({ code: 'PRODUCTION_OPERATION_NOT_FOUND' });
      if (
        dto.status === ProductionOperationStatus.IN_PROGRESS &&
        operation.dependencies.some(
          ({ prerequisite }) => prerequisite.status !== ProductionOperationStatus.COMPLETED,
        )
      ) {
        throw new ConflictException({ code: 'PRODUCTION_OPERATION_PREREQUISITE_INCOMPLETE' });
      }
      const now = new Date();
      const updated = await tx.productionOperation.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes,
          responsibleEmployeeId: dto.responsibleEmployeeId,
          startedAt:
            dto.status === ProductionOperationStatus.IN_PROGRESS
              ? (operation.startedAt ?? now)
              : undefined,
          completedAt: dto.status === ProductionOperationStatus.COMPLETED ? now : undefined,
        },
      });
      const linkedTaskStatus =
        dto.status === ProductionOperationStatus.COMPLETED ||
        dto.status === ProductionOperationStatus.SKIPPED
          ? OperationalTaskStatus.COMPLETED
          : dto.status === ProductionOperationStatus.CANCELLED
            ? OperationalTaskStatus.CANCELLED
            : dto.status === ProductionOperationStatus.IN_PROGRESS ||
                dto.status === ProductionOperationStatus.BLOCKED
              ? OperationalTaskStatus.IN_PROGRESS
              : null;
      if (linkedTaskStatus) {
        await tx.operationalTask.updateMany({
          where: { organizationId, productionOperationId: operation.id },
          data: {
            status: linkedTaskStatus,
            completedAt: linkedTaskStatus === OperationalTaskStatus.COMPLETED ? now : null,
          },
        });
      }
      if (dto.status === ProductionOperationStatus.COMPLETED) {
        const next = await tx.productionOperation.findFirst({
          where: {
            batchId: operation.batchId,
            position: { gt: operation.position },
            status: ProductionOperationStatus.PENDING,
          },
          orderBy: { position: 'asc' },
        });
        if (next) {
          await tx.productionOperation.update({
            where: { id: next.id },
            data: { status: ProductionOperationStatus.READY },
          });
        }
      }
      return updated;
    });
  }

  async completeBatch(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: CompleteProductionBatchDto,
  ) {
    this.assertPermission(actor, 'production.batch.execute');
    const actualQuantity = new Prisma.Decimal(dto.actualQuantity);
    const lostQuantity = new Prisma.Decimal(dto.lostQuantity ?? 0);
    if (actualQuantity.lt(0) || lostQuantity.lt(0)) {
      throw new BadRequestException({ code: 'PRODUCTION_NEGATIVE_QUANTITY' });
    }
    const completed = await this.serializable(async (tx) => {
      const existing = await tx.productionBatch.findFirst({
        where: { organizationId, idempotencyKey: dto.idempotencyKey },
        include: { outputLots: { include: { stocks: true } }, order: true },
      });
      if (existing) return existing;
      const batch = await tx.productionBatch.findFirst({
        where: { id, organizationId },
        include: {
          order: {
            include: {
              outputProduct: { include: { unit: true } },
              requirements: { include: { product: { include: { unit: true } }, unit: true } },
              batches: true,
              needAllocations: { include: { need: true } },
            },
          },
          operations: true,
          unit: true,
        },
      });
      if (!batch) throw new NotFoundException({ code: 'PRODUCTION_BATCH_NOT_FOUND' });
      await this.ingredientTraceability?.assertCompleteTx(tx, organizationId, batch.id);
      if (
        !(
          [
            ProductionBatchStatus.PREPARING,
            ProductionBatchStatus.COOKING,
            ProductionBatchStatus.COOLING,
            ProductionBatchStatus.FREEZING,
          ] as ProductionBatchStatus[]
        ).includes(batch.status)
      ) {
        throw new ConflictException({
          code: 'PRODUCTION_BATCH_NOT_IN_PROGRESS',
          status: batch.status,
        });
      }
      if (!batch.order.siteId || !batch.order.outputProductId) {
        throw new ConflictException({ code: 'PRODUCTION_CAMPAIGN_OUTPUT_INCOMPLETE' });
      }
      const destinationLocationId = dto.destinationLocationId ?? batch.destinationLocationId;
      if (destinationLocationId) {
        const location = await tx.location.findFirst({
          where: {
            id: destinationLocationId,
            organizationId,
            siteId: batch.order.siteId,
            isArchived: false,
          },
        });
        if (!location)
          throw new BadRequestException({ code: 'PRODUCTION_DESTINATION_LOCATION_INVALID' });
      }

      const openBatches = batch.order.batches.filter(
        (item) =>
          item.id !== batch.id &&
          !(
            [
              ProductionBatchStatus.COMPLETED,
              ProductionBatchStatus.PARTIALLY_LOST,
              ProductionBatchStatus.CANCELLED,
            ] as ProductionBatchStatus[]
          ).includes(item.status),
      );
      for (const requirement of batch.order.requirements) {
        const totalStockUnit = await this.convertTx(
          tx,
          organizationId,
          requirement.unitId,
          requirement.product.unitId,
          requirement.requiredQuantity,
        );
        if (!totalStockUnit) {
          throw new ConflictException({
            code: 'PRODUCTION_UNIT_NOT_CONVERTIBLE',
            productId: requirement.productId,
          });
        }
        const target = openBatches.length
          ? totalStockUnit.mul(batch.plannedQuantity).div(batch.order.validatedQuantity)
          : await this.activeReservationTotal(
              tx,
              organizationId,
              batch.orderId,
              requirement.productId,
            );
        await this.consumeReservations(
          tx,
          organizationId,
          actor.id,
          batch,
          requirement.productId,
          requirement.product.unitId,
          target,
          dto.idempotencyKey,
        );
      }

      const producedAt = new Date();
      const state = dto.conservationState ?? ConservationState.CHILLED;
      const profile = await tx.productionProfile.findFirst({
        where: {
          organizationId,
          siteId: batch.order.siteId,
          technicalSheetId: batch.order.technicalSheetId,
          outputProductId: batch.order.outputProductId,
          outputVariantId: batch.order.outputVariantId,
        },
      });
      const expiresAt = dto.expiresAt
        ? this.date(dto.expiresAt, 'PRODUCTION_INVALID_EXPIRY')
        : this.defaultExpiry(producedAt, state, profile);
      const lot = await tx.lot.create({
        data: {
          organizationId,
          lotNumber: this.outputLotNumber(batch.order.number, batch.number, producedAt),
          productId: batch.order.outputProductId,
          variantId: batch.order.outputVariantId,
          productionBatchId: batch.id,
          recipeVersionId: batch.recipeVersionId,
          initialQuantity: actualQuantity,
          conservationState: state,
          producedAt,
          availableAt: state === ConservationState.COOLING ? null : producedAt,
          frozenAt: state === ConservationState.FROZEN ? producedAt : null,
          expiresAt,
          siteId: batch.order.siteId,
          locationId: destinationLocationId,
        },
      });
      await this.syncHaccpProductionCompletionTx(
        tx,
        organizationId,
        actor.id,
        batch,
        lot,
        actualQuantity,
        lostQuantity,
        state,
        expiresAt,
        producedAt,
        dto.notes,
      );
      const stock = await tx.stock.create({
        data: {
          organizationId,
          productId: batch.order.outputProductId,
          variantId: batch.order.outputVariantId,
          lotId: lot.id,
          siteId: batch.order.siteId,
          locationId: destinationLocationId,
          quantity: actualQuantity,
        },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          productId: batch.order.outputProductId,
          variantId: batch.order.outputVariantId,
          lotId: lot.id,
          type: StockMovementType.PRODUCTION,
          quantity: actualQuantity,
          inputQuantity: actualQuantity,
          unitId: batch.unitId,
          unitSymbolSnapshot: null,
          reason: `Production ${batch.reference}`,
          destinationState: state,
          sourceEntityType: 'ProductionBatch',
          sourceEntityId: batch.id,
          destinationSiteId: batch.order.siteId,
          destinationLocationId,
          createdById: actor.id,
          idempotencyKey: `production:${dto.idempotencyKey}`,
        },
      });
      if (lostQuantity.gt(0)) {
        await tx.stockMovement.create({
          data: {
            organizationId,
            productId: batch.order.outputProductId,
            variantId: batch.order.outputVariantId,
            lotId: lot.id,
            type: StockMovementType.LOSS,
            quantity: new Prisma.Decimal(0),
            inputQuantity: lostQuantity,
            unitId: batch.unitId,
            reason: dto.notes ?? `Perte de rendement ${batch.reference}`,
            sourceEntityType: 'ProductionBatchLoss',
            sourceEntityId: batch.id,
            sourceSiteId: batch.order.siteId,
            sourceLocationId: destinationLocationId,
            createdById: actor.id,
            idempotencyKey: `loss:${dto.idempotencyKey}`,
          },
        });
      }

      const reservedForNeeds = await this.reserveOutputForNeeds(
        tx,
        organizationId,
        actor.id,
        batch.order,
        stock,
        actualQuantity,
        dto.idempotencyKey,
      );
      await tx.productionOperation.updateMany({
        where: {
          batchId: batch.id,
          status: {
            notIn: [ProductionOperationStatus.CANCELLED, ProductionOperationStatus.SKIPPED],
          },
        },
        data: { status: ProductionOperationStatus.COMPLETED, completedAt: producedAt },
      });
      await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          actualQuantity,
          lostQuantity,
          status: lostQuantity.gt(0)
            ? ProductionBatchStatus.PARTIALLY_LOST
            : ProductionBatchStatus.COMPLETED,
          destinationLocationId,
          completedAt: producedAt,
          completedById: actor.id,
          idempotencyKey: dto.idempotencyKey,
          optimisticVersion: { increment: 1 },
        },
      });
      await tx.operationalTask.updateMany({
        where: { organizationId, productionBatchId: batch.id },
        data: { status: OperationalTaskStatus.COMPLETED, completedAt: producedAt },
      });
      const totals = await tx.productionBatch.aggregate({
        where: {
          orderId: batch.orderId,
          status: { in: [ProductionBatchStatus.COMPLETED, ProductionBatchStatus.PARTIALLY_LOST] },
        },
        _sum: { actualQuantity: true, lostQuantity: true },
        _count: true,
      });
      const allFinished =
        totals._count ===
        batch.order.batches.filter((item) => item.status !== ProductionBatchStatus.CANCELLED)
          .length;
      const realized = new Prisma.Decimal(totals._sum.actualQuantity ?? 0);
      await tx.productionOrder.update({
        where: { id: batch.orderId },
        data: {
          realizedPortions: realized,
          reservedQuantity: { increment: reservedForNeeds },
          surplusQuantity: Prisma.Decimal.max(0, realized.sub(batch.order.netRequirement)),
          actualCost: undefined,
          status: allFinished
            ? ProductionOrderStatus.COMPLETED
            : ProductionOrderStatus.PARTIALLY_COMPLETED,
          completedAt: allFinished ? producedAt : null,
          completedById: allFinished ? actor.id : null,
          updatedById: actor.id,
          optimisticVersion: { increment: 1 },
        },
      });
      await this.history(
        tx,
        organizationId,
        batch.orderId,
        actor.id,
        ProductionHistoryAction.REALIZATION_CLOSED,
        `Lot ${batch.reference} terminé`,
        {
          actualQuantity: actualQuantity.toFixed(3),
          lostQuantity: lostQuantity.toFixed(3),
          outputLotId: lot.id,
          reservedForNeeds: reservedForNeeds.toFixed(3),
        },
      );
      return tx.productionBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: {
          order: true,
          operations: { orderBy: { position: 'asc' } },
          consumptions: { include: { product: true, unit: true, lot: true } },
          outputLots: { include: { stocks: true, product: true, variant: true } },
        },
      });
    });
    await this.catererLifecycle?.evaluateForOrder(organizationId, completed.orderId);
    return completed;
  }

  private async productionDaySnapshot(
    organizationId: string,
    query: ProductionDayValidationQueryDto,
  ) {
    const day = String(query.date).slice(0, 10);
    const start = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_DAY' });
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return this.prisma.$transaction(async (tx) => {
      const site = await tx.site.findFirst({
        where: {
          id: query.siteId,
          organizationId,
          isArchived: false,
        },
        select: { id: true, name: true },
      });
      if (!site) throw new NotFoundException({ code: 'PRODUCTION_SITE_NOT_FOUND' });

      const orders = await tx.productionOrder.findMany({
        where: {
          organizationId,
          siteId: query.siteId,
          serviceId: query.serviceId,
          OR: [
            { productionDate: { gte: start, lt: end } },
            {
              batches: {
                some: {
                  operationalTasks: {
                    some: {
                      source: 'PRODUCTION',
                      status: { not: OperationalTaskStatus.CANCELLED },
                      startsAt: { lt: end },
                      endsAt: { gt: start },
                    },
                  },
                },
              },
            },
          ],
          status: { not: ProductionOrderStatus.CANCELLED },
        },
        include: {
          service: { select: { id: true, name: true } },
          technicalSheet: {
            select: {
              id: true,
              name: true,
              yieldMode: true,
              referencePortions: true,
              totalMassGrams: true,
            },
          },
          requirements: {
            include: {
              product: { include: { unit: true } },
              unit: true,
            },
            orderBy: { productNameSnapshot: 'asc' },
          },
          assignments: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              planningAssignment: {
                select: {
                  id: true,
                  status: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          },
          stockReservations: {
            where: ACTIVE_RESERVATION,
          },
          batches: {
            include: {
              unit: true,
              consumptions: true,
              operationalTasks: {
                where: {
                  source: 'PRODUCTION',
                  status: { not: OperationalTaskStatus.CANCELLED },
                },
                select: {
                  id: true,
                  title: true,
                  status: true,
                  startsAt: true,
                  endsAt: true,
                  productionOperationId: true,
                },
              },
            },
            orderBy: { number: 'asc' },
          },
        },
        orderBy: [{ plannedTime: 'asc' }, { name: 'asc' }],
      });

      const blockingIssues: Array<{
        code: string;
        orderId: string;
        orderName: string;
        message: string;
      }> = [];
      const totals = new Map<
        string,
        {
          productId: string;
          productName: string;
          quantity: Prisma.Decimal;
          unitId: string;
          unitSymbol: string;
        }
      >();
      let pendingBatchCount = 0;

      const serializedOrders = [];
      for (const order of orders) {
        const executable = (
          [
            ProductionOrderStatus.VALIDATED,
            ProductionOrderStatus.IN_PROGRESS,
            ProductionOrderStatus.PARTIALLY_COMPLETED,
            ProductionOrderStatus.COMPLETED,
          ] as ProductionOrderStatus[]
        ).includes(order.status);
        if (!executable) {
          blockingIssues.push({
            code: 'CAMPAIGN_NOT_VALIDATED',
            orderId: order.id,
            orderName: order.name,
            message: `${order.name} doit être validée pour réserver ses ingrédients.`,
          });
        }
        if (!order.serviceId) {
          blockingIssues.push({
            code: 'SERVICE_REQUIRED',
            orderId: order.id,
            orderName: order.name,
            message: `${order.name} n’a pas de service responsable.`,
          });
        }

        const activeAssignments = order.assignments.filter(
          (assignment) =>
            assignment.planningAssignment && assignment.planningAssignment.status !== 'CANCELLED',
        );
        if (order.status !== ProductionOrderStatus.COMPLETED && !order.assignments.length) {
          blockingIssues.push({
            code: 'TEAM_REQUIRED',
            orderId: order.id,
            orderName: order.name,
            message: `${order.name} doit être affectée à au moins une personne.`,
          });
        } else if (
          order.status !== ProductionOrderStatus.COMPLETED &&
          activeAssignments.length !== order.assignments.length
        ) {
          blockingIssues.push({
            code: 'TEAM_NOT_SCHEDULED',
            orderId: order.id,
            orderName: order.name,
            message: `Toutes les personnes affectées à ${order.name} doivent travailler sur ce créneau.`,
          });
        }

        const reservedByProduct = new Map<string, Prisma.Decimal>();
        for (const reservation of order.stockReservations) {
          reservedByProduct.set(
            reservation.productId,
            (reservedByProduct.get(reservation.productId) ?? new Prisma.Decimal(0)).add(
              reservation.quantity,
            ),
          );
        }
        const consumedByProduct = new Map<string, Prisma.Decimal>();
        for (const batch of order.batches) {
          if (
            !(
              [
                ProductionBatchStatus.COMPLETED,
                ProductionBatchStatus.PARTIALLY_LOST,
                ProductionBatchStatus.CANCELLED,
              ] as ProductionBatchStatus[]
            ).includes(batch.status)
          ) {
            pendingBatchCount += 1;
          }
          for (const consumption of batch.consumptions) {
            consumedByProduct.set(
              consumption.productId,
              (consumedByProduct.get(consumption.productId) ?? new Prisma.Decimal(0)).add(
                consumption.quantity,
              ),
            );
          }
        }
        const deferredSteps = order.batches.flatMap((batch) =>
          (batch.operationalTasks ?? []).filter(
            (task) =>
              Boolean(task.productionOperationId) &&
              task.endsAt.getTime() >= end.getTime() &&
              task.status !== OperationalTaskStatus.COMPLETED,
          ),
        );
        if (deferredSteps.length) {
          const lastStep = [...deferredSteps].sort(
            (left, right) => right.endsAt.getTime() - left.endsAt.getTime(),
          )[0];
          blockingIssues.push({
            code: 'PRODUCTION_STEPS_DEFERRED',
            orderId: order.id,
            orderName: order.name,
            message:
              `${order.name} comporte encore ${deferredSteps.length} étape(s) planifiée(s) après cette journée` +
              ` (jusqu’au ${lastStep.endsAt.toLocaleDateString('fr-FR')}). Les ingrédients restent réservés jusqu’à la fin de la recette.`,
          });
        }

        const ingredients = [];
        for (const requirement of order.requirements) {
          const requiredStockUnit = await this.convertTx(
            tx,
            organizationId,
            requirement.unitId,
            requirement.product.unitId,
            requirement.requiredQuantity,
          );
          if (!requiredStockUnit) {
            blockingIssues.push({
              code: 'UNIT_NOT_CONVERTIBLE',
              orderId: order.id,
              orderName: order.name,
              message: `${requirement.productNameSnapshot} ne peut pas être converti dans son unité de stock.`,
            });
            continue;
          }
          const consumed = consumedByProduct.get(requirement.productId) ?? new Prisma.Decimal(0);
          const remaining =
            order.status === ProductionOrderStatus.COMPLETED
              ? new Prisma.Decimal(0)
              : Prisma.Decimal.max(0, requiredStockUnit.sub(consumed));
          const reserved = reservedByProduct.get(requirement.productId) ?? new Prisma.Decimal(0);
          if (
            executable &&
            order.status !== ProductionOrderStatus.COMPLETED &&
            reserved.lt(remaining)
          ) {
            blockingIssues.push({
              code: 'INGREDIENT_NOT_RESERVED',
              orderId: order.id,
              orderName: order.name,
              message: `${requirement.productNameSnapshot} : ${reserved.toFixed(
                3,
              )} ${requirement.product.unit.symbol} réservé sur ${remaining.toFixed(
                3,
              )} nécessaire.`,
            });
          }
          ingredients.push({
            productId: requirement.productId,
            productName: requirement.productNameSnapshot,
            quantity: remaining.toFixed(3),
            reservedQuantity: reserved.toFixed(3),
            consumedQuantity: consumed.toFixed(3),
            unitId: requirement.product.unitId,
            unitSymbol: requirement.product.unit.symbol,
          });
          if (remaining.gt(0)) {
            const key = `${requirement.productId}:${requirement.product.unitId}`;
            const total = totals.get(key) ?? {
              productId: requirement.productId,
              productName: requirement.productNameSnapshot,
              quantity: new Prisma.Decimal(0),
              unitId: requirement.product.unitId,
              unitSymbol: requirement.product.unit.symbol,
            };
            total.quantity = total.quantity.add(remaining);
            totals.set(key, total);
          }
        }

        const requestedQuantity = new Prisma.Decimal(
          order.grossRequirement ?? order.plannedPortions,
        );
        const configuredReferenceYield = new Prisma.Decimal(
          order.technicalSheet.yieldMode === 'MASS'
            ? (order.technicalSheet.totalMassGrams ?? 0)
            : (order.technicalSheet.referencePortions ?? 0),
        );
        if (configuredReferenceYield.lte(0)) {
          blockingIssues.push({
            code: 'RECIPE_YIELD_REQUIRED',
            orderId: order.id,
            orderName: order.name,
            message: `${order.name} doit avoir un rendement renseigné dans sa fiche technique.`,
          });
        }
        const referenceYield = configuredReferenceYield.gt(0)
          ? configuredReferenceYield
          : new Prisma.Decimal(1);
        const quantityMode = order.technicalSheet.yieldMode;
        const quantityUnitLabel = quantityMode === 'MASS' ? 'g' : 'portions';
        serializedOrders.push({
          id: order.id,
          number: order.number,
          name: order.name,
          status: order.status,
          plannedTime: order.plannedTime,
          service: order.service,
          quantityMode,
          quantityUnitLabel,
          requestedQuantity: requestedQuantity.toFixed(3),
          referenceYield: referenceYield.toFixed(3),
          requestedPortions: requestedQuantity.toFixed(3),
          plannedPortions: order.plannedPortions.toFixed(3),
          referencePortions: referenceYield.toFixed(3),
          recipeMultiplier: requestedQuantity.div(referenceYield).toFixed(3),
          team: order.assignments.map((assignment) => ({
            id: assignment.employeeId,
            name:
              [assignment.employee.firstName, assignment.employee.lastName]
                .filter(Boolean)
                .join(' ')
                .trim() ||
              assignment.employee.email ||
              'Collaborateur',
            isLead: assignment.isLead,
            worksDuringProduction: Boolean(
              assignment.planningAssignment && assignment.planningAssignment.status !== 'CANCELLED',
            ),
          })),
          ingredients,
          batches: order.batches.map((batch) => ({
            id: batch.id,
            reference: batch.reference,
            status: batch.status,
            plannedQuantity: batch.plannedQuantity.toFixed(3),
            unitSymbol: batch.unit.symbol,
          })),
        });
      }

      const completed =
        serializedOrders.length > 0 &&
        pendingBatchCount === 0 &&
        orders.every((order) => order.status === ProductionOrderStatus.COMPLETED);
      return {
        site,
        date: day,
        serviceId: query.serviceId ?? null,
        ready: serializedOrders.length > 0 && pendingBatchCount > 0 && blockingIssues.length === 0,
        completed,
        pendingBatchCount,
        blockingIssues,
        totals: [...totals.values()]
          .map((total) => ({
            ...total,
            quantity: total.quantity.toFixed(3),
          }))
          .sort((left, right) => left.productName.localeCompare(right.productName, 'fr')),
        orders: serializedOrders,
      };
    });
  }

  private async ensureHaccpProductTx(
    tx: Tx,
    organizationId: string,
    actorId: string,
    product: {
      id: string;
      name: string;
      description?: string | null;
      unit?: { symbol?: string | null } | null;
    },
  ) {
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { haccpInstalledAt: true },
    });
    if (!organization?.haccpInstalledAt) return null;

    const linked = await tx.haccpProduct.findFirst({
      where: { organizationId, sourceProductId: product.id, deletedAt: null },
    });
    if (linked) return linked;

    const sameName = await tx.haccpProduct.findFirst({
      where: {
        organizationId,
        sourceProductId: null,
        deletedAt: null,
        name: { equals: product.name, mode: 'insensitive' },
      },
    });
    if (sameName) {
      return tx.haccpProduct.update({
        where: { id: sameName.id },
        data: {
          sourceProductId: product.id,
          unit: sameName.unit ?? product.unit?.symbol,
          syncVersion: { increment: 1 },
        },
      });
    }

    return tx.haccpProduct.create({
      data: {
        organizationId,
        createdById: actorId,
        sourceProductId: product.id,
        name: product.name,
        type: 'Produit fini',
        description: product.description,
        unit: product.unit?.symbol,
      },
    });
  }

  private async syncHaccpProductionStartTx(
    tx: Tx,
    organizationId: string,
    actorId: string,
    batch: any,
    startedAt: Date,
  ) {
    if (!batch.order?.outputProduct) return;
    const product = await this.ensureHaccpProductTx(
      tx,
      organizationId,
      actorId,
      batch.order.outputProduct,
    );
    if (!product) return;
    return tx.haccpProductionSession.upsert({
      where: { productionBatchId: batch.id },
      update: {
        createdById: batch.producerUserId ?? actorId,
        lotNumber: batch.reference,
        finishedProductId: product.id,
        plannedQuantity: batch.plannedQuantity,
        quantity: batch.actualQuantity ?? batch.plannedQuantity,
        unit: batch.unit.symbol,
        productionDate: batch.startedAt ?? startedAt,
        startTime: batch.startedAt ?? startedAt,
        status: 'en_cours',
        source: 'planning',
        syncVersion: { increment: 1 },
      },
      create: {
        organizationId,
        createdById: batch.producerUserId ?? actorId,
        productionBatchId: batch.id,
        lotNumber: batch.reference,
        finishedProductId: product.id,
        plannedQuantity: batch.plannedQuantity,
        quantity: batch.actualQuantity ?? batch.plannedQuantity,
        unit: batch.unit.symbol,
        productionDate: batch.startedAt ?? startedAt,
        startTime: batch.startedAt ?? startedAt,
        status: 'en_cours',
        source: 'planning',
        photos: [],
      },
    });
  }

  private async syncHaccpProductionCompletionTx(
    tx: Tx,
    organizationId: string,
    actorId: string,
    batch: any,
    lot: { id: string; lotNumber: string },
    actualQuantity: Prisma.Decimal,
    lostQuantity: Prisma.Decimal,
    conservationState: ConservationState,
    expiresAt: Date | null,
    completedAt: Date,
    notes?: string,
  ) {
    const haccpSession = await this.syncHaccpProductionStartTx(
      tx,
      organizationId,
      actorId,
      batch,
      batch.startedAt ?? completedAt,
    );
    if (!haccpSession) return;
    const startedAt = batch.startedAt ?? completedAt;
    await tx.haccpProductionSession.updateMany({
      where: { organizationId, productionBatchId: batch.id },
      data: {
        outputLotId: lot.id,
        lotNumber: lot.lotNumber,
        quantity: actualQuantity,
        lostQuantity,
        conservationState,
        expiresAt,
        endTime: completedAt,
        duration: Math.max(
          0,
          Math.round((completedAt.getTime() - new Date(startedAt).getTime()) / 60_000),
        ),
        notes,
        status: 'termine',
        syncVersion: { increment: 1 },
      },
    });
    await tx.haccpProcessSession.updateMany({
      where: { organizationId, productionSessionId: haccpSession.id },
      data: {
        lotNumber: lot.lotNumber,
        quantity: actualQuantity,
        unit: batch.unit.symbol,
        syncVersion: { increment: 1 },
      },
    });
  }

  async listProductionStock(organizationId: string, query: ProductionStockQueryDto) {
    const take = Math.min(query.pageSize ?? 50, 200);
    const where: Prisma.StockWhereInput = {
      organizationId,
      siteId: query.siteId,
      productId: query.productId,
      variantId: query.variantId,
      quantity: { gt: 0 },
      lot: {
        productionBatchId: { not: null },
        conservationState: query.state,
      },
      OR: query.search
        ? [
            { product: { name: { contains: query.search, mode: 'insensitive' } } },
            { variant: { name: { contains: query.search, mode: 'insensitive' } } },
            { lot: { lotNumber: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const profileWhere: Prisma.ProductionProfileWhereInput = {
      organizationId,
      siteId: query.siteId,
      outputProductId: query.productId,
      outputVariantId: query.variantId,
      OR: query.search
        ? [
            { outputProduct: { name: { contains: query.search, mode: 'insensitive' } } },
            { outputVariant: { name: { contains: query.search, mode: 'insensitive' } } },
            { technicalSheet: { name: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const completedBatchWhere: Prisma.ProductionBatchWhereInput = {
      organizationId,
      status: { in: [ProductionBatchStatus.COMPLETED, ProductionBatchStatus.PARTIALLY_LOST] },
      actualQuantity: { not: null },
      order: {
        siteId: query.siteId,
        outputProductId: query.productId,
        outputVariantId: query.variantId,
        OR: query.search
          ? [
              { outputProduct: { name: { contains: query.search, mode: 'insensitive' } } },
              { outputVariant: { name: { contains: query.search, mode: 'insensitive' } } },
              { technicalSheet: { name: { contains: query.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
    };
    const [stocks, total, summaryStocks, profiles, completedBatches] = await Promise.all([
      this.prisma.stock.findMany({
        where,
        include: {
          product: { include: { unit: true } },
          variant: true,
          lot: true,
          site: true,
          location: true,
          reservations: { where: ACTIVE_RESERVATION },
        },
        orderBy: [{ lot: { expiresAt: 'asc' } }, { createdAt: 'asc' }],
        take,
        skip: ((query.page ?? 1) - 1) * take,
      }),
      this.prisma.stock.count({ where }),
      this.prisma.stock.findMany({
        where,
        include: {
          product: { include: { unit: true } },
          variant: true,
          reservations: { where: ACTIVE_RESERVATION },
        },
      }),
      this.prisma.productionProfile.findMany({
        where: profileWhere,
        include: {
          technicalSheet: { select: { id: true, name: true, mode: true } },
          outputProduct: { include: { unit: true } },
          outputVariant: true,
        },
      }),
      this.prisma.productionBatch.findMany({
        where: completedBatchWhere,
        select: {
          actualQuantity: true,
          completedAt: true,
          order: {
            select: {
              technicalSheetId: true,
              outputProductId: true,
              outputVariantId: true,
              technicalSheet: { select: { id: true, name: true, mode: true } },
              outputProduct: {
                select: { id: true, name: true, unit: { select: { symbol: true } } },
              },
              outputVariant: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);
    type ProductionStockSummary = {
      technicalSheetId: string | null;
      technicalSheetName: string;
      mode: string | null;
      productId: string;
      productName: string;
      variantId: string | null;
      variantName: string | null;
      unitSymbol: string | null;
      producedQuantity: Prisma.Decimal;
      storedQuantity: Prisma.Decimal;
      reservedQuantity: Prisma.Decimal;
      batchCount: number;
      lastProducedAt: Date | null;
    };
    const summaryByOutput = new Map<string, ProductionStockSummary>();
    const summaryKey = (productId: string, variantId?: string | null) =>
      `${productId}:${variantId ?? ''}`;
    for (const profile of profiles) {
      summaryByOutput.set(summaryKey(profile.outputProductId, profile.outputVariantId), {
        technicalSheetId: profile.technicalSheetId,
        technicalSheetName: profile.technicalSheet.name,
        mode: profile.technicalSheet.mode,
        productId: profile.outputProductId,
        productName: profile.outputProduct.name,
        variantId: profile.outputVariantId,
        variantName: profile.outputVariant?.name ?? null,
        unitSymbol: profile.outputProduct.unit?.symbol ?? null,
        producedQuantity: new Prisma.Decimal(0),
        storedQuantity: new Prisma.Decimal(0),
        reservedQuantity: new Prisma.Decimal(0),
        batchCount: 0,
        lastProducedAt: null,
      });
    }
    for (const batch of completedBatches) {
      if (!batch.order.outputProductId || !batch.order.outputProduct || !batch.actualQuantity)
        continue;
      const key = summaryKey(batch.order.outputProductId, batch.order.outputVariantId);
      const summary = summaryByOutput.get(key) ?? {
        technicalSheetId: batch.order.technicalSheetId,
        technicalSheetName: batch.order.technicalSheet.name,
        mode: batch.order.technicalSheet.mode,
        productId: batch.order.outputProductId,
        productName: batch.order.outputProduct.name,
        variantId: batch.order.outputVariantId,
        variantName: batch.order.outputVariant?.name ?? null,
        unitSymbol: batch.order.outputProduct.unit?.symbol ?? null,
        producedQuantity: new Prisma.Decimal(0),
        storedQuantity: new Prisma.Decimal(0),
        reservedQuantity: new Prisma.Decimal(0),
        batchCount: 0,
        lastProducedAt: null,
      };
      summary.producedQuantity = summary.producedQuantity.add(batch.actualQuantity);
      summary.batchCount += 1;
      if (
        batch.completedAt &&
        (!summary.lastProducedAt || batch.completedAt > summary.lastProducedAt)
      ) {
        summary.lastProducedAt = batch.completedAt;
      }
      summaryByOutput.set(key, summary);
    }
    for (const stock of summaryStocks) {
      const key = summaryKey(stock.productId, stock.variantId);
      const summary = summaryByOutput.get(key) ?? {
        technicalSheetId: null,
        technicalSheetName: stock.product.name,
        mode: null,
        productId: stock.productId,
        productName: stock.product.name,
        variantId: stock.variantId,
        variantName: stock.variant?.name ?? null,
        unitSymbol: stock.product.unit?.symbol ?? null,
        producedQuantity: new Prisma.Decimal(0),
        storedQuantity: new Prisma.Decimal(0),
        reservedQuantity: new Prisma.Decimal(0),
        batchCount: 0,
        lastProducedAt: null,
      };
      const reserved = stock.reservations.reduce(
        (sum, reservation) => sum.add(reservation.quantity),
        new Prisma.Decimal(0),
      );
      summary.storedQuantity = summary.storedQuantity.add(stock.quantity);
      summary.reservedQuantity = summary.reservedQuantity.add(reserved);
      summaryByOutput.set(key, summary);
    }
    const summary = [...summaryByOutput.values()]
      .map((item) => ({
        ...item,
        producedQuantity: item.producedQuantity.toFixed(3),
        storedQuantity: item.storedQuantity.toFixed(3),
        reservedQuantity: item.reservedQuantity.toFixed(3),
        availableQuantity: Prisma.Decimal.max(
          0,
          item.storedQuantity.sub(item.reservedQuantity),
        ).toFixed(3),
      }))
      .sort((left, right) => left.productName.localeCompare(right.productName, 'fr'));
    return {
      items: stocks.map((stock) => {
        const reserved = stock.reservations.reduce(
          (sum, reservation) => sum.add(reservation.quantity),
          new Prisma.Decimal(0),
        );
        return {
          ...stock,
          physicalQuantity: stock.quantity.toFixed(3),
          reservedQuantity: reserved.toFixed(3),
          freeQuantity: Prisma.Decimal.max(0, stock.quantity.sub(reserved)).toFixed(3),
        };
      }),
      total,
      summary,
      page: query.page ?? 1,
      pageSize: take,
    };
  }

  async transitionStock(
    organizationId: string,
    actor: Actor,
    stockId: string,
    dto: TransitionProductionStockDto,
  ) {
    this.assertPermission(actor, 'production.stock.adjust');
    const quantity = new Prisma.Decimal(dto.quantity);
    if (quantity.lte(0))
      throw new BadRequestException({ code: 'PRODUCTION_QUANTITY_MUST_BE_POSITIVE' });
    return this.serializable(async (tx) => {
      const duplicate = await tx.stockMovement.findFirst({
        where: { organizationId, idempotencyKey: dto.idempotencyKey },
        include: { lot: true },
      });
      if (duplicate) return duplicate;
      const stock = await tx.stock.findFirst({
        where: { id: stockId, organizationId },
        include: {
          lot: true,
          product: { include: { unit: true } },
          reservations: { where: ACTIVE_RESERVATION },
        },
      });
      if (!stock?.lot) throw new NotFoundException({ code: 'PRODUCTION_STOCK_LOT_NOT_FOUND' });
      const reserved = stock.reservations.reduce(
        (sum, reservation) => sum.add(reservation.quantity),
        new Prisma.Decimal(0),
      );
      if (quantity.gt(stock.quantity.sub(reserved))) {
        throw new ConflictException({
          code: 'PRODUCTION_STOCK_RESERVED',
          freeQuantity: Prisma.Decimal.max(0, stock.quantity.sub(reserved)).toFixed(3),
        });
      }
      this.assertStateTransition(stock.lot.conservationState, dto.destinationState);
      const profile = stock.siteId
        ? await tx.productionProfile.findFirst({
            where: {
              organizationId,
              siteId: stock.siteId,
              outputProductId: stock.productId,
              outputVariantId: stock.variantId,
            },
          })
        : null;
      if (dto.destinationState === ConservationState.FROZEN && !profile?.canFreeze) {
        throw new ConflictException({ code: 'PRODUCTION_PRODUCT_NOT_FREEZABLE' });
      }
      const now = new Date();
      const availableAt = dto.availableAt
        ? this.date(dto.availableAt, 'PRODUCTION_INVALID_AVAILABLE_AT')
        : dto.destinationState === ConservationState.THAWING && profile?.thawingTimeMinutes
          ? new Date(now.getTime() + profile.thawingTimeMinutes * 60_000)
          : dto.destinationState === ConservationState.THAWED
            ? now
            : null;
      const expiresAt = dto.expiresAt
        ? this.date(dto.expiresAt, 'PRODUCTION_INVALID_EXPIRY')
        : this.defaultExpiry(now, dto.destinationState, profile);
      const lotTotal = await tx.stock.aggregate({
        where: { organizationId, lotId: stock.lotId },
        _sum: { quantity: true },
      });
      let targetLot = stock.lot;
      if (quantity.eq(lotTotal._sum.quantity ?? 0)) {
        targetLot = await tx.lot.update({
          where: { id: stock.lot.id },
          data: {
            conservationState: dto.destinationState,
            availableAt,
            expiresAt,
            frozenAt: dto.destinationState === ConservationState.FROZEN ? now : undefined,
            thawedAt: dto.destinationState === ConservationState.THAWED ? now : undefined,
          },
        });
      } else {
        const suffix = dto.destinationState === ConservationState.FROZEN ? 'FZ' : 'TH';
        targetLot = await tx.lot.create({
          data: {
            organizationId,
            lotNumber: `${stock.lot.lotNumber}-${suffix}-${Date.now().toString(36).toUpperCase()}`,
            productId: stock.productId,
            variantId: stock.variantId,
            supplierId: stock.lot.supplierId,
            productionBatchId: stock.lot.productionBatchId,
            recipeVersionId: stock.lot.recipeVersionId,
            initialQuantity: quantity,
            conservationState: dto.destinationState,
            producedAt: stock.lot.producedAt,
            availableAt,
            frozenAt: dto.destinationState === ConservationState.FROZEN ? now : null,
            thawedAt: dto.destinationState === ConservationState.THAWED ? now : null,
            receivedAt: stock.lot.receivedAt,
            expiresAt,
            siteId: stock.siteId,
            locationId: stock.locationId,
          },
        });
        const updated = await tx.stock.updateMany({
          where: { id: stock.id, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (updated.count !== 1)
          throw new ConflictException({ code: 'PRODUCTION_STOCK_CONCURRENT_UPDATE' });
        await tx.stock.create({
          data: {
            organizationId,
            productId: stock.productId,
            variantId: stock.variantId,
            lotId: targetLot.id,
            siteId: stock.siteId,
            locationId: stock.locationId,
            quantity,
          },
        });
      }
      const type =
        dto.destinationState === ConservationState.FROZEN
          ? StockMovementType.FREEZE
          : StockMovementType.THAW;
      return tx.stockMovement.create({
        data: {
          organizationId,
          productId: stock.productId,
          variantId: stock.variantId,
          lotId: targetLot.id,
          type,
          quantity: new Prisma.Decimal(0),
          inputQuantity: quantity,
          unitId: stock.product.unitId,
          unitSymbolSnapshot: stock.product.unit.symbol,
          reason: dto.reason ?? `${stock.lot.conservationState} → ${dto.destinationState}`,
          sourceState: stock.lot.conservationState,
          destinationState: dto.destinationState,
          sourceEntityType: 'ConservationTransition',
          sourceEntityId: stock.lot.id,
          sourceSiteId: stock.siteId,
          sourceLocationId: stock.locationId,
          destinationSiteId: stock.siteId,
          destinationLocationId: stock.locationId,
          createdById: actor.id,
          idempotencyKey: dto.idempotencyKey,
        },
        include: { lot: true },
      });
    });
  }

  async traceLot(organizationId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, organizationId },
      include: {
        product: { include: { unit: true } },
        variant: true,
        site: true,
        location: true,
        stocks: { include: { reservations: true } },
        movements: { orderBy: { movementDate: 'asc' } },
        productionBatch: {
          include: {
            order: { include: { technicalSheet: true, recipeVersion: true } },
            consumptions: {
              include: { product: true, variant: true, unit: true, lot: true, stockMovement: true },
              orderBy: { createdAt: 'asc' },
            },
            operations: { orderBy: { position: 'asc' } },
          },
        },
        batchConsumptions: {
          include: { batch: { include: { order: true } }, product: true, unit: true },
        },
      },
    });
    if (!lot) throw new NotFoundException({ code: 'PRODUCTION_LOT_NOT_FOUND' });
    return lot;
  }

  private async createNeedAllocations(
    tx: Tx,
    organizationId: string,
    orderId: string,
    needs: Array<{ id: string; quantity: Prisma.Decimal; coveredQuantity: Prisma.Decimal }>,
    net: Prisma.Decimal,
  ) {
    let remaining = net;
    for (const need of needs) {
      if (remaining.lte(0)) break;
      const uncovered = Prisma.Decimal.max(0, need.quantity.sub(need.coveredQuantity));
      const take = Prisma.Decimal.min(uncovered, remaining);
      if (take.lte(0)) continue;
      await tx.productionNeedAllocation.create({
        data: { organizationId, needId: need.id, orderId, plannedQuantity: take },
      });
      await tx.productionNeed.update({
        where: { id: need.id },
        data: { status: ProductionNeedStatus.PARTIALLY_COVERED },
      });
      remaining = remaining.sub(take);
    }
  }

  private async createRequirements(
    tx: Tx,
    organizationId: string,
    orderId: string,
    siteId: string,
    referenceYield: Prisma.Decimal,
    proposed: Prisma.Decimal,
    ingredients: Array<{
      id: string;
      sourceTechnicalSheetId?: string | null;
      productId: string;
      unitId: string;
      quantity: Prisma.Decimal;
      product: {
        name: string;
        averagePrice: Prisma.Decimal;
        unitId: string;
        primarySupplierId: string | null;
        primarySupplier: { name: string } | null;
      };
      unit: { symbol: string };
    }>,
  ) {
    const ratio = proposed.div(referenceYield);
    for (const ingredient of ingredients) {
      const required = ingredient.quantity.mul(ratio);
      const stockQuantity = await this.convertTx(
        tx,
        organizationId,
        ingredient.unitId,
        ingredient.product.unitId,
        required,
      );
      const available = stockQuantity
        ? await this.freeStockTotal(tx, organizationId, siteId, ingredient.productId)
        : null;
      await tx.productionMaterialRequirement.create({
        data: {
          organizationId,
          orderId,
          technicalSheetIngredientId: ingredient.id,
          productId: ingredient.productId,
          unitId: ingredient.unitId,
          supplierId: ingredient.product.primarySupplierId,
          requiredQuantity: required,
          stockAvailable: available,
          varianceQuantity: available && stockQuantity ? available.sub(stockQuantity) : null,
          status: !stockQuantity
            ? ProductionMaterialStatus.UNIT_NOT_CONVERTIBLE
            : available!.gte(stockQuantity)
              ? ProductionMaterialStatus.OK
              : ProductionMaterialStatus.INSUFFICIENT_STOCK,
          estimatedCost: stockQuantity?.mul(ingredient.product.averagePrice),
          productNameSnapshot: ingredient.product.name,
          unitSymbolSnapshot: ingredient.unit.symbol,
          supplierNameSnapshot: ingredient.product.primarySupplier?.name,
          details: stockQuantity
            ? {
                stockUnitQuantity: stockQuantity.toFixed(3),
                sourceTechnicalSheetId: ingredient.sourceTechnicalSheetId ?? null,
              }
            : {
                conversionMissing: true,
                sourceTechnicalSheetId: ingredient.sourceTechnicalSheetId ?? null,
              },
        },
      });
    }
  }

  private async createBatchesAndOperations(
    tx: Tx,
    organizationId: string,
    orderId: string,
    recipeVersionId: string,
    unitId: string,
    destinationLocationId: string | undefined,
    productionDate: Date,
    plannedTime: string,
    batches: string[],
    steps: Array<{
      order: number;
      title: string;
      description: string;
      estimatedMinutes: number | null;
    }>,
  ) {
    const [hours, minutes] = plannedTime.split(':').map(Number);
    const plannedStartAt = new Date(productionDate);
    plannedStartAt.setHours(
      Number.isFinite(hours) ? hours : 8,
      Number.isFinite(minutes) ? minutes : 0,
      0,
      0,
    );
    for (let index = 0; index < batches.length; index += 1) {
      const batch = await tx.productionBatch.create({
        data: {
          organizationId,
          orderId,
          recipeVersionId,
          unitId,
          destinationLocationId,
          number: index + 1,
          reference: `${orderId.slice(0, 8).toUpperCase()}-L${String(index + 1).padStart(2, '0')}`,
          plannedQuantity: new Prisma.Decimal(batches[index]),
          plannedStartAt,
        },
      });
      let previousId: string | null = null;
      const operationSteps = steps.length
        ? steps
        : [
            {
              order: 0,
              title: 'Production',
              description: 'Exécuter le lot.',
              estimatedMinutes: null,
            },
          ];
      for (let position = 0; position < operationSteps.length; position += 1) {
        const step = operationSteps[position];
        const operation = await tx.productionOperation.create({
          data: {
            organizationId,
            batchId: batch.id,
            type: this.operationType(step.title),
            title: step.title,
            position,
            plannedAt: plannedStartAt,
            activeMinutes: step.estimatedMinutes,
            notes: step.description,
            status:
              position === 0 ? ProductionOperationStatus.READY : ProductionOperationStatus.PENDING,
          },
        });
        if (previousId) {
          await tx.productionOperationDependency.create({
            data: {
              organizationId,
              operationId: operation.id,
              prerequisiteId: previousId,
            },
          });
        }
        previousId = operation.id;
      }
    }
  }

  private async createOperationalTasksTx(
    tx: Tx,
    organizationId: string,
    actorId: string,
    order: any,
  ) {
    if (!order.serviceId || !order.batches?.length) return;
    const team = [...(order.assignments ?? [])];
    const lead =
      team.find((assignment: any) => assignment.isLead) ??
      team.find((assignment: any) => assignment.employeeId === order.responsibleEmployeeId) ??
      team[0];
    const employeeIds = [
      ...new Set([
        ...team.map((assignment: any) => assignment.employeeId),
        ...(order.responsibleEmployeeId ? [order.responsibleEmployeeId] : []),
      ]),
    ] as string[];
    const batchIds = order.batches.map((batch: any) => batch.id);
    const primaryBatch = order.batches[0];
    let primaryStartsAt = primaryBatch.plannedStartAt
      ? new Date(primaryBatch.plannedStartAt)
      : this.productionDateTime(order.productionDate, order.plannedTime);
    let primaryEndsAt = new Date(primaryStartsAt);

    for (const batch of order.batches) {
      const base = batch.plannedStartAt
        ? new Date(batch.plannedStartAt)
        : this.productionDateTime(order.productionDate, order.plannedTime);
      let cursor = new Date(base);
      for (const operation of batch.operations ?? []) {
        const minutes = Math.max(5, operation.activeMinutes ?? 15);
        const startsAt = new Date(cursor);
        const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
        cursor = endsAt;
        await tx.productionOperation.update({
          where: { id: operation.id },
          data: { plannedAt: startsAt },
        });
      }
      if (batch.id === primaryBatch.id) {
        primaryStartsAt = base;
        primaryEndsAt = cursor;
      }
    }

    // Le moteur peut répartir une quantité en plusieurs lots techniques. Pour le
    // chef, cela reste une seule recette à organiser dans son planning.
    const existing = await tx.operationalTask.findFirst({
      where: {
        organizationId,
        productionBatchId: { in: batchIds },
        status: { not: OperationalTaskStatus.CANCELLED },
      },
      select: { id: true },
    });
    if (existing) return;

    const totalMinutes = Math.max(
      5,
      Math.round((primaryEndsAt.getTime() - primaryStartsAt.getTime()) / 60_000),
    );
    const totalQuantity = new Prisma.Decimal(
      order.validatedQuantity ??
        order.proposedQuantity ??
        order.batches.reduce(
          (sum: Prisma.Decimal, batch: any) => sum.add(batch.plannedQuantity),
          new Prisma.Decimal(0),
        ),
    );
    const task = await tx.operationalTask.create({
      data: {
        organizationId,
        title: `Recette complète · ${order.name}`.slice(0, 180),
        description:
          `Réaliser la fiche ${order.technicalSheet?.name ?? order.name} de A à Z. ` +
          `Vous pourrez la conserver entière ou la découper en ${Math.max(
            1,
            order.technicalSheet?.steps?.length ?? 1,
          )} étape(s) depuis la zone à planifier.`,
        category: 'KITCHEN',
        status: 'TODO',
        source: 'PRODUCTION',
        departmentId: order.serviceId,
        siteId: order.siteId,
        assignedEmployeeId: lead?.employeeId ?? order.responsibleEmployeeId ?? null,
        planningAssignmentId: null,
        technicalSheetId: order.technicalSheetId,
        technicalSheetStepId: null,
        productionBatchId: primaryBatch.id,
        productionOperationId: null,
        startsAt: primaryStartsAt,
        endsAt: primaryEndsAt,
        isTimeScheduled: false,
        quantity: totalQuantity,
        unitLabel: primaryBatch.unit?.symbol ?? 'portions',
        createdById: actorId,
      },
    });
    for (const employeeId of employeeIds) {
      const productionAssignment = team.find(
        (assignment: any) => assignment.employeeId === employeeId,
      );
      await tx.operationalTaskAssignment.create({
        data: {
          organizationId,
          taskId: task.id,
          employeeId,
          planningAssignmentId: null,
          isLead: employeeId === (lead?.employeeId ?? order.responsibleEmployeeId ?? null),
          mission: productionAssignment?.mission ?? `Réaliser ${order.name}`,
          plannedMinutes: productionAssignment?.plannedMinutes ?? totalMinutes,
        },
      });
    }
  }

  private productionDateTime(productionDate: Date, plannedTime?: string | null) {
    const value = new Date(productionDate);
    const [hours, minutes] = String(plannedTime ?? '08:00')
      .split(':')
      .map(Number);
    value.setHours(
      Number.isFinite(hours) ? hours : 8,
      Number.isFinite(minutes) ? minutes : 0,
      0,
      0,
    );
    return value;
  }

  private productionTargetToOutputQuantity(
    profile: {
      referenceYield: Prisma.Decimal;
      technicalSheet: {
        yieldMode: string;
        referencePortions: Prisma.Decimal;
        totalMassGrams: Prisma.Decimal;
      };
    },
    fallbackGrossRequirement: string,
    targetMode?: string,
    targetQuantity?: Prisma.Decimal | null,
  ) {
    if (!targetMode) return new Prisma.Decimal(fallbackGrossRequirement);
    if (!targetQuantity) {
      throw new BadRequestException({
        code: 'PRODUCTION_TARGET_QUANTITY_REQUIRED',
      });
    }
    if (targetMode === 'PORTIONS' && profile.technicalSheet.yieldMode === 'MASS') {
      throw new BadRequestException({
        code: 'PRODUCTION_PORTION_TARGET_UNAVAILABLE',
        message:
          'Cette fiche est définie par une masse totale et ne possède pas de rendement en portions.',
      });
    }
    const referenceTarget =
      targetMode === 'MASS'
        ? profile.technicalSheet.totalMassGrams
        : profile.technicalSheet.referencePortions;
    if (referenceTarget.lte(0)) {
      throw new BadRequestException({
        code: 'PRODUCTION_RECIPE_TARGET_REFERENCE_REQUIRED',
      });
    }
    return profile.referenceYield.mul(targetQuantity).div(referenceTarget).toDecimalPlaces(3);
  }

  private async createSubRecipeNeeds(
    tx: Tx,
    organizationId: string,
    actorId: string,
    order: { id: string; productionDate: Date; requirements?: unknown },
    siteId: string,
  ) {
    const requirements = await tx.productionMaterialRequirement.findMany({
      where: { orderId: order.id, status: ProductionMaterialStatus.INSUFFICIENT_STOCK },
      include: { product: true, unit: true },
    });
    for (const requirement of requirements) {
      const sourceTechnicalSheetId =
        requirement.details && typeof requirement.details === 'object'
          ? String((requirement.details as Record<string, unknown>).sourceTechnicalSheetId || '') ||
            null
          : null;
      const profile = await tx.productionProfile.findFirst({
        where: {
          organizationId,
          siteId,
          outputProductId: requirement.productId,
          outputVariantId: null,
          ...(sourceTechnicalSheetId ? { technicalSheetId: sourceTechnicalSheetId } : {}),
        },
      });
      if (!profile) continue;
      const requiredStockUnit = await this.convertTx(
        tx,
        organizationId,
        requirement.unitId,
        requirement.product.unitId,
        requirement.requiredQuantity,
      );
      if (!requiredStockUnit) continue;
      const free = await this.freeStockTotal(tx, organizationId, siteId, requirement.productId);
      const missing = Prisma.Decimal.max(0, requiredStockUnit.sub(free));
      if (missing.lte(0)) continue;
      const duplicate = await tx.productionNeed.findFirst({
        where: {
          organizationId,
          source: ProductionNeedSource.SUB_RECIPE,
          sourceReferenceType: 'ProductionOrder',
          sourceReferenceId: order.id,
          productId: requirement.productId,
        },
      });
      if (duplicate) continue;
      await tx.productionNeed.create({
        data: {
          organizationId,
          siteId,
          productId: requirement.productId,
          unitId: requirement.product.unitId,
          source: ProductionNeedSource.SUB_RECIPE,
          sourceReferenceType: 'ProductionOrder',
          sourceReferenceId: order.id,
          quantity: missing,
          neededAt: order.productionDate,
          status: ProductionNeedStatus.CONFIRMED,
          notes: `Sous-recette requise par la campagne ${order.id}`,
          createdById: actorId,
        },
      });
    }
  }

  private async reserveProductFefo(
    tx: Tx,
    organizationId: string,
    actorId: string,
    order: { id: string; siteId: string | null; productionDate: Date },
    productId: string,
    unitId: string,
    quantity: Prisma.Decimal,
    requestKey?: string,
  ) {
    const stocks = await tx.stock.findMany({
      where: {
        organizationId,
        siteId: order.siteId,
        productId,
        variantId: null,
        quantity: { gt: 0 },
      },
      include: { lot: true, reservations: { where: ACTIVE_RESERVATION } },
      orderBy: [{ lot: { expiresAt: 'asc' } }, { createdAt: 'asc' }],
    });
    let remaining = quantity;
    let reserved = new Prisma.Decimal(0);
    for (const stock of stocks) {
      if (remaining.lte(0)) break;
      if (!this.usableLot(stock.lot, order.productionDate)) continue;
      const alreadyReserved = stock.reservations.reduce(
        (sum, reservation) => sum.add(reservation.quantity),
        new Prisma.Decimal(0),
      );
      const free = Prisma.Decimal.max(0, stock.quantity.sub(alreadyReserved));
      const take = Prisma.Decimal.min(free, remaining);
      if (take.lte(0)) continue;
      const reservation = await tx.stockReservation.create({
        data: {
          organizationId,
          stockId: stock.id,
          productId,
          lotId: stock.lotId,
          siteId: order.siteId!,
          unitId,
          orderId: order.id,
          target: StockReservationTarget.CAMPAIGN,
          targetReferenceId: order.id,
          quantity: take,
          expiresAt: order.productionDate,
          reason: `Composant réservé pour la campagne ${order.id}`,
          createdById: actorId,
          idempotencyKey: requestKey
            ? `validate:${requestKey}:${stock.id}:${productId}`
            : `campaign:${order.id}:${stock.id}:${Date.now()}`,
        },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          productId,
          lotId: stock.lotId,
          type: StockMovementType.RESERVATION,
          quantity: new Prisma.Decimal(0),
          inputQuantity: take,
          unitId,
          reason: reservation.reason,
          sourceEntityType: 'StockReservation',
          sourceEntityId: reservation.id,
          sourceSiteId: order.siteId,
          sourceLocationId: stock.locationId,
          createdById: actorId,
          idempotencyKey: `reservation:${reservation.id}`,
        },
      });
      reserved = reserved.add(take);
      remaining = remaining.sub(take);
    }
    return { reserved };
  }

  private async consumeReservations(
    tx: Tx,
    organizationId: string,
    actorId: string,
    batch: { id: string; reference: string; orderId: string },
    productId: string,
    unitId: string,
    target: Prisma.Decimal,
    completionKey: string,
  ) {
    const reservations = await tx.stockReservation.findMany({
      where: {
        organizationId,
        orderId: batch.orderId,
        productId,
        target: StockReservationTarget.CAMPAIGN,
        status: StockReservationStatus.ACTIVE,
      },
      include: { stock: true },
      orderBy: { createdAt: 'asc' },
    });
    let remaining = target;
    for (const reservation of reservations) {
      if (remaining.lte(0)) break;
      const take = Prisma.Decimal.min(reservation.quantity, remaining);
      const updated = await tx.stock.updateMany({
        where: { id: reservation.stockId, quantity: { gte: take } },
        data: { quantity: { decrement: take } },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ code: 'PRODUCTION_STOCK_CONCURRENT_UPDATE' });
      }
      const movement = await tx.stockMovement.create({
        data: {
          organizationId,
          productId,
          variantId: reservation.variantId,
          lotId: reservation.lotId,
          type: StockMovementType.CONSUMPTION,
          quantity: take.neg(),
          inputQuantity: take,
          unitId,
          reason: `Consommation ${batch.reference}`,
          sourceEntityType: 'ProductionBatch',
          sourceEntityId: batch.id,
          sourceSiteId: reservation.siteId,
          sourceLocationId: reservation.stock.locationId,
          createdById: actorId,
          idempotencyKey: `consume:${completionKey}:${reservation.id}`,
        },
      });
      await tx.productionBatchConsumption.create({
        data: {
          organizationId,
          batchId: batch.id,
          productId,
          variantId: reservation.variantId,
          lotId: reservation.lotId,
          unitId,
          stockMovementId: movement.id,
          quantity: take,
        },
      });
      const remainder = reservation.quantity.sub(take);
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: {
          quantity: take,
          status: StockReservationStatus.CONSUMED,
          consumedAt: new Date(),
          optimisticVersion: { increment: 1 },
        },
      });
      if (remainder.gt(0)) {
        await tx.stockReservation.create({
          data: {
            organizationId,
            stockId: reservation.stockId,
            productId: reservation.productId,
            variantId: reservation.variantId,
            lotId: reservation.lotId,
            siteId: reservation.siteId,
            unitId: reservation.unitId,
            needId: reservation.needId,
            orderId: reservation.orderId,
            menuId: reservation.menuId,
            target: reservation.target,
            targetReferenceId: reservation.targetReferenceId,
            quantity: remainder,
            expiresAt: reservation.expiresAt,
            reason: reservation.reason,
            createdById: reservation.createdById,
            idempotencyKey: `remainder:${completionKey}:${reservation.id}`,
          },
        });
      }
      remaining = remaining.sub(take);
    }
    if (remaining.gt(new Prisma.Decimal('0.001'))) {
      throw new ConflictException({
        code: 'PRODUCTION_RESERVED_COMPONENT_SHORTAGE',
        productId,
        shortage: remaining.toFixed(3),
      });
    }
  }

  private async reserveOutputForNeeds(
    tx: Tx,
    organizationId: string,
    actorId: string,
    order: {
      id: string;
      siteId: string | null;
      outputProductId: string | null;
      outputVariantId: string | null;
      needAllocations: Array<{
        id: string;
        needId: string;
        plannedQuantity: Prisma.Decimal;
        reservedQuantity: Prisma.Decimal;
        need: { quantity: Prisma.Decimal; coveredQuantity: Prisma.Decimal; neededAt: Date };
      }>;
    },
    stock: { id: string; lotId: string | null },
    outputQuantity: Prisma.Decimal,
    completionKey: string,
  ) {
    if (!order.siteId || !order.outputProductId) return new Prisma.Decimal(0);
    const product = await tx.product.findUniqueOrThrow({ where: { id: order.outputProductId } });
    let remaining = outputQuantity;
    let reserved = new Prisma.Decimal(0);
    for (const allocation of order.needAllocations) {
      if (remaining.lte(0)) break;
      const allocationRemaining = Prisma.Decimal.max(
        0,
        allocation.plannedQuantity.sub(allocation.reservedQuantity),
      );
      const take = Prisma.Decimal.min(allocationRemaining, remaining);
      if (take.lte(0)) continue;
      const reservation = await tx.stockReservation.create({
        data: {
          organizationId,
          stockId: stock.id,
          productId: order.outputProductId,
          variantId: order.outputVariantId,
          lotId: stock.lotId,
          siteId: order.siteId,
          unitId: product.unitId,
          needId: allocation.needId,
          orderId: order.id,
          target: StockReservationTarget.NEED,
          targetReferenceId: allocation.needId,
          quantity: take,
          expiresAt: allocation.need.neededAt,
          reason: `Production réservée pour le besoin ${allocation.needId}`,
          createdById: actorId,
          idempotencyKey: `output:${completionKey}:${allocation.id}`,
        },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          productId: order.outputProductId,
          variantId: order.outputVariantId,
          lotId: stock.lotId,
          type: StockMovementType.RESERVATION,
          quantity: new Prisma.Decimal(0),
          inputQuantity: take,
          unitId: product.unitId,
          reason: reservation.reason,
          sourceEntityType: 'ProductionNeed',
          sourceEntityId: allocation.needId,
          sourceSiteId: order.siteId,
          createdById: actorId,
          idempotencyKey: `output-reservation:${reservation.id}`,
        },
      });
      const covered = allocation.need.coveredQuantity.add(take);
      await tx.productionNeedAllocation.update({
        where: { id: allocation.id },
        data: { reservedQuantity: { increment: take } },
      });
      await tx.productionNeed.update({
        where: { id: allocation.needId },
        data: {
          coveredQuantity: { increment: take },
          status: covered.gte(allocation.need.quantity)
            ? ProductionNeedStatus.COVERED
            : ProductionNeedStatus.PARTIALLY_COVERED,
        },
      });
      remaining = remaining.sub(take);
      reserved = reserved.add(take);
    }
    return reserved;
  }

  private async reserveExistingOutputForCoverage(
    tx: Tx,
    organizationId: string,
    actorId: string,
    order: {
      id: string;
      siteId: string | null;
      outputProductId: string | null;
      outputVariantId: string | null;
      productionDate: Date;
    },
    unitId: string,
  ) {
    if (!order.siteId || !order.outputProductId) return new Prisma.Decimal(0);
    const allocations = await tx.productionNeedAllocation.findMany({
      where: { orderId: order.id },
      include: { need: true },
      orderBy: { need: { neededAt: 'asc' } },
    });
    const stocks = await tx.stock.findMany({
      where: {
        organizationId,
        siteId: order.siteId,
        productId: order.outputProductId,
        variantId: order.outputVariantId,
        quantity: { gt: 0 },
      },
      include: { lot: true, reservations: { where: ACTIVE_RESERVATION } },
      orderBy: [{ lot: { expiresAt: 'asc' } }, { createdAt: 'asc' }],
    });
    let reservedTotal = new Prisma.Decimal(0);
    for (const allocation of allocations) {
      let remaining = allocation.plannedQuantity.sub(allocation.reservedQuantity);
      for (const stock of stocks) {
        if (remaining.lte(0)) break;
        if (!this.usableLot(stock.lot, allocation.need.neededAt)) continue;
        const stockReserved = stock.reservations.reduce(
          (sum, reservation) => sum.add(reservation.quantity),
          new Prisma.Decimal(0),
        );
        const alreadyTakenHere = await tx.stockReservation.aggregate({
          where: { stockId: stock.id, status: StockReservationStatus.ACTIVE },
          _sum: { quantity: true },
        });
        const currentReserved = new Prisma.Decimal(alreadyTakenHere._sum.quantity ?? stockReserved);
        const free = Prisma.Decimal.max(0, stock.quantity.sub(currentReserved));
        const take = Prisma.Decimal.min(free, remaining);
        if (take.lte(0)) continue;
        const reservation = await tx.stockReservation.create({
          data: {
            organizationId,
            stockId: stock.id,
            productId: order.outputProductId,
            variantId: order.outputVariantId,
            lotId: stock.lotId,
            siteId: order.siteId,
            unitId,
            needId: allocation.needId,
            orderId: order.id,
            target: StockReservationTarget.NEED,
            targetReferenceId: allocation.needId,
            quantity: take,
            expiresAt: allocation.need.neededAt,
            reason: `Besoin ${allocation.needId} couvert depuis le stock libre`,
            createdById: actorId,
            idempotencyKey: `coverage:${order.id}:${allocation.id}:${stock.id}`,
          },
        });
        await tx.stockMovement.create({
          data: {
            organizationId,
            productId: order.outputProductId,
            variantId: order.outputVariantId,
            lotId: stock.lotId,
            type: StockMovementType.RESERVATION,
            quantity: new Prisma.Decimal(0),
            inputQuantity: take,
            unitId,
            reason: reservation.reason,
            sourceEntityType: 'ProductionNeed',
            sourceEntityId: allocation.needId,
            sourceSiteId: order.siteId,
            sourceLocationId: stock.locationId,
            createdById: actorId,
            idempotencyKey: `coverage-movement:${reservation.id}`,
          },
        });
        await tx.productionNeedAllocation.update({
          where: { id: allocation.id },
          data: { reservedQuantity: { increment: take } },
        });
        const covered = allocation.need.coveredQuantity.add(take);
        await tx.productionNeed.update({
          where: { id: allocation.needId },
          data: {
            coveredQuantity: { increment: take },
            status: covered.gte(allocation.need.quantity)
              ? ProductionNeedStatus.COVERED
              : ProductionNeedStatus.PARTIALLY_COVERED,
          },
        });
        remaining = remaining.sub(take);
        reservedTotal = reservedTotal.add(take);
      }
    }
    return reservedTotal;
  }

  private async getCampaignTx(tx: Tx, organizationId: string, id: string) {
    return tx.productionOrder.findFirstOrThrow({
      where: { id, organizationId },
      include: {
        site: true,
        technicalSheet: true,
        recipeVersion: true,
        outputProduct: { include: { unit: true } },
        outputVariant: true,
        responsibleEmployee: true,
        requirements: { include: { product: true, unit: true, supplier: true } },
        needAllocations: { include: { need: { include: { product: true, variant: true } } } },
        batches: {
          include: {
            unit: true,
            destinationLocation: true,
            operations: { orderBy: { position: 'asc' } },
            outputLots: { include: { stocks: true } },
          },
          orderBy: { number: 'asc' },
        },
        stockReservations: { where: ACTIVE_RESERVATION, include: { lot: true, stock: true } },
        alerts: { where: { isActive: true } },
      },
    });
  }

  private campaignInclude(withTraceability = false): Prisma.ProductionOrderInclude {
    return {
      site: true,
      technicalSheet: true,
      recipeVersion: true,
      outputProduct: { include: { unit: true } },
      outputVariant: true,
      service: true,
      responsibleEmployee: true,
      assignments: {
        include: {
          employee: { include: { position: true, department: true, mainSite: true } },
          planningAssignment: true,
        },
        orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
      },
      requirements: { include: { product: true, unit: true, supplier: true } },
      needAllocations: { include: { need: { include: { product: true, variant: true } } } },
      menuProductionLinks: true,
      batches: {
        include: {
          unit: true,
          destinationLocation: true,
          operations: { orderBy: { position: 'asc' } },
          outputLots: { include: { stocks: true, product: true, variant: true } },
          ...(withTraceability
            ? { consumptions: { include: { product: true, unit: true, lot: true } } }
            : {}),
        },
        orderBy: { number: 'asc' },
      },
      stockReservations: {
        where: ACTIVE_RESERVATION,
        include: { lot: true, stock: true, product: true, variant: true },
      },
      alerts: { where: { isActive: true } },
      ...(withTraceability ? { history: { orderBy: { createdAt: 'desc' }, take: 100 } } : {}),
    };
  }

  private async freeStockTotal(tx: Tx, organizationId: string, siteId: string, productId: string) {
    const stocks = await tx.stock.findMany({
      where: { organizationId, siteId, productId, variantId: null },
      include: { lot: true, reservations: { where: ACTIVE_RESERVATION } },
    });
    return stocks.reduce((sum, stock) => {
      if (!this.usableLot(stock.lot, new Date())) return sum;
      const reserved = stock.reservations.reduce(
        (subtotal, reservation) => subtotal.add(reservation.quantity),
        new Prisma.Decimal(0),
      );
      return sum.add(Prisma.Decimal.max(0, stock.quantity.sub(reserved)));
    }, new Prisma.Decimal(0));
  }

  private activeReservationTotal(
    tx: Tx,
    organizationId: string,
    orderId: string,
    productId: string,
  ) {
    return tx.stockReservation
      .aggregate({
        where: {
          organizationId,
          orderId,
          productId,
          target: StockReservationTarget.CAMPAIGN,
          status: StockReservationStatus.ACTIVE,
        },
        _sum: { quantity: true },
      })
      .then((result) => new Prisma.Decimal(result._sum.quantity ?? 0));
  }

  private async convertTx(
    tx: Tx,
    organizationId: string,
    fromUnitId: string,
    toUnitId: string,
    quantity: Prisma.Decimal,
  ) {
    if (fromUnitId === toUnitId) return quantity;
    const conversion = await tx.unitConversion.findFirst({
      where: { organizationId, fromUnitId, toUnitId },
    });
    return conversion ? quantity.mul(conversion.factor) : null;
  }

  private usableLot(
    lot: {
      conservationState: ConservationState;
      expiresAt: Date | null;
      availableAt: Date | null;
    } | null,
    at: Date,
  ) {
    if (!lot) return true;
    if (
      (
        [
          ConservationState.BLOCKED,
          ConservationState.EXPIRED,
          ConservationState.DEPLETED,
          ConservationState.COOLING,
        ] as ConservationState[]
      ).includes(lot.conservationState)
    )
      return false;
    if (lot.expiresAt && lot.expiresAt < at) return false;
    if (
      ([ConservationState.FROZEN, ConservationState.THAWING] as ConservationState[]).includes(
        lot.conservationState,
      ) &&
      (!lot.availableAt || lot.availableAt > at)
    )
      return false;
    return true;
  }

  private operationType(title: string) {
    const normalized = title.toLocaleLowerCase('fr');
    if (/d[eé]cong/.test(normalized)) return ProductionOperationType.THAWING;
    if (/cuisson|four|po[eê]l/.test(normalized)) return ProductionOperationType.COOKING;
    if (/refroid/.test(normalized)) return ProductionOperationType.COOLING;
    if (/cong[eé]l/.test(normalized)) return ProductionOperationType.FREEZING;
    if (/montage|assembl/.test(normalized)) return ProductionOperationType.ASSEMBLY;
    if (/fini|gla[çc]age|d[eé]cor/.test(normalized)) return ProductionOperationType.FINISHING;
    if (/condition|emball|portion/.test(normalized)) return ProductionOperationType.PACKAGING;
    return ProductionOperationType.PREPARATION;
  }

  private defaultExpiry(
    reference: Date,
    state: ConservationState,
    profile: {
      shelfLifeHours: number | null;
      frozenShelfLifeHours: number | null;
      shelfLifeAfterThawHours: number | null;
    } | null,
  ) {
    const hours =
      state === ConservationState.FROZEN
        ? profile?.frozenShelfLifeHours
        : state === ConservationState.THAWED
          ? profile?.shelfLifeAfterThawHours
          : profile?.shelfLifeHours;
    return hours ? new Date(reference.getTime() + hours * 60 * 60 * 1000) : null;
  }

  private assertStateTransition(source: ConservationState, destination: ConservationState) {
    const allowed: Partial<Record<ConservationState, ConservationState[]>> = {
      [ConservationState.AMBIENT]: [
        ConservationState.CHILLED,
        ConservationState.FROZEN,
        ConservationState.BLOCKED,
      ],
      [ConservationState.CHILLED]: [ConservationState.FROZEN, ConservationState.BLOCKED],
      [ConservationState.FROZEN]: [ConservationState.THAWING, ConservationState.BLOCKED],
      [ConservationState.THAWING]: [ConservationState.THAWED, ConservationState.BLOCKED],
      [ConservationState.THAWED]: [ConservationState.CHILLED, ConservationState.BLOCKED],
      [ConservationState.COOLING]: [
        ConservationState.CHILLED,
        ConservationState.FROZEN,
        ConservationState.BLOCKED,
      ],
      [ConservationState.BLOCKED]: [ConservationState.CHILLED, ConservationState.DEPLETED],
    };
    if (!allowed[source]?.includes(destination)) {
      throw new ConflictException({
        code: 'PRODUCTION_INVALID_STATE_TRANSITION',
        source,
        destination,
      });
    }
  }

  private outputLotNumber(orderNumber: string, batchNumber: number, at: Date) {
    const date = at.toISOString().slice(0, 10).replaceAll('-', '');
    return `PROD-${date}-${orderNumber}-L${String(batchNumber).padStart(2, '0')}`;
  }

  private date(value: string, code: string) {
    const result = new Date(value);
    if (Number.isNaN(result.getTime())) throw new BadRequestException({ code });
    return result;
  }

  private async nextCampaignNumber(tx: Tx, organizationId: string) {
    const year = new Date().getFullYear();
    const count = await tx.productionOrder.count({
      where: { organizationId, number: { startsWith: `CP-${year}-` } },
    });
    return `CP-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private history(
    tx: Tx,
    organizationId: string,
    orderId: string,
    actorUserId: string,
    action: ProductionHistoryAction,
    summary: string,
    details?: Prisma.InputJsonValue,
  ) {
    return tx.productionHistory.create({
      data: { organizationId, orderId, actorUserId, action, summary, details },
    });
  }

  private assertPermission(actor: Actor, permission: string) {
    if (
      actor.permissions.includes(permission) ||
      actor.permissions.includes('production.write') ||
      LEGACY_WRITE_ROLES.has(actor.role)
    )
      return;
    throw new ForbiddenException({ code: 'PRODUCTION_PERMISSION_DENIED', permission });
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        lastError = error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') {
          throw error;
        }
      }
    }
    throw lastError;
  }
}
