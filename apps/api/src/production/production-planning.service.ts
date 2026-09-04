import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConservationState,
  Prisma,
  ProductionNeedStatus,
  ProductionOrderStatus,
  StockReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  allowedBatchQuantities,
  generateProductionScenarios,
  type ProductionRuleSet,
} from './production-calculations';
import {
  CreateProductionNeedDto,
  ProductionPlanningQueryDto,
  SimulateProductionSuggestionDto,
  UpsertProductionProfileDto,
} from './dto/production-planning.dto';

type Actor = { id: string; role: string; permissions: string[] };
type Tx = Prisma.TransactionClient;

const LEGACY_WRITE_ROLES = new Set(['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second']);
const UNUSABLE_STATES = new Set<ConservationState>([
  ConservationState.BLOCKED,
  ConservationState.EXPIRED,
  ConservationState.DEPLETED,
  ConservationState.COOLING,
]);
const CONFIRMED_ORDER_STATUSES: ProductionOrderStatus[] = [
  ProductionOrderStatus.VALIDATED,
  ProductionOrderStatus.IN_PROGRESS,
  ProductionOrderStatus.PARTIALLY_COMPLETED,
];

@Injectable()
export class ProductionPlanningService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPermission(actor: Actor, permission: string) {
    if (
      actor.permissions.includes(permission) ||
      actor.permissions.includes('production.write') ||
      LEGACY_WRITE_ROLES.has(actor.role)
    )
      return;
    throw new ForbiddenException({ code: 'PRODUCTION_PERMISSION_DENIED', permission });
  }

  private page(query: ProductionPlanningQueryDto) {
    const take = Math.min(query.pageSize ?? 50, 200);
    return { take, skip: ((query.page ?? 1) - 1) * take };
  }

  async listNeeds(organizationId: string, query: ProductionPlanningQueryDto) {
    const where: Prisma.ProductionNeedWhereInput = {
      organizationId,
      siteId: query.siteId,
      productId: query.productId,
      variantId: query.variantId,
      status: query.status,
      neededAt:
        query.startDate || query.endDate
          ? {
              gte: query.startDate ? new Date(query.startDate) : undefined,
              lte: query.endDate ? new Date(query.endDate) : undefined,
            }
          : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.productionNeed.findMany({
        where,
        include: {
          site: true,
          product: true,
          variant: true,
          unit: true,
          service: true,
          allocations: { include: { order: true } },
        },
        orderBy: [{ neededAt: 'asc' }, { priority: 'desc' }],
        ...this.page(query),
      }),
      this.prisma.productionNeed.count({ where }),
    ]);
    return { items, total, page: query.page ?? 1, pageSize: Math.min(query.pageSize ?? 50, 200) };
  }

  async createNeed(organizationId: string, actor: Actor, dto: CreateProductionNeedDto) {
    this.assertPermission(actor, 'production.need.create');
    const neededAt = new Date(dto.neededAt);
    if (Number.isNaN(neededAt.getTime())) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_NEEDED_AT' });
    }
    const quantity = new Prisma.Decimal(dto.quantity);
    if (quantity.lte(0))
      throw new BadRequestException({ code: 'PRODUCTION_QUANTITY_MUST_BE_POSITIVE' });
    await this.assertReferences(organizationId, dto);
    return this.prisma.productionNeed.create({
      data: {
        organizationId,
        siteId: dto.siteId,
        productId: dto.productId,
        variantId: dto.variantId,
        unitId: dto.unitId,
        serviceId: dto.serviceId,
        source: dto.source,
        sourceReferenceType: dto.sourceReferenceType,
        sourceReferenceId: dto.sourceReferenceId,
        quantity,
        neededAt,
        priority: dto.priority,
        status: dto.status ?? ProductionNeedStatus.DRAFT,
        notes: dto.notes,
        createdById: actor.id,
      },
      include: { site: true, product: true, variant: true, unit: true, service: true },
    });
  }

  async listProfiles(organizationId: string, query: ProductionPlanningQueryDto) {
    return this.prisma.productionProfile.findMany({
      where: {
        organizationId,
        siteId: query.siteId,
        technicalSheetId: query.technicalSheetId,
        outputProductId: query.productId,
        outputVariantId: query.variantId,
      },
      include: {
        site: true,
        technicalSheet: {
          include: {
            ingredients: {
              include: {
                product: { include: { unit: true } },
                unit: true,
              },
              orderBy: { order: 'asc' },
            },
            steps: { orderBy: { order: 'asc' } },
          },
        },
        outputProduct: true,
        outputVariant: true,
        yieldUnit: true,
      },
      orderBy: [{ technicalSheet: { name: 'asc' } }, { site: { name: 'asc' } }],
      ...this.page(query),
    });
  }

  async createProfile(organizationId: string, actor: Actor, dto: UpsertProductionProfileDto) {
    this.assertPermission(actor, 'production.profile.manage');
    await this.assertProfileReferences(organizationId, dto);
    this.validateRules(dto);
    const duplicate = await this.prisma.productionProfile.findFirst({
      where: {
        organizationId,
        siteId: dto.siteId,
        technicalSheetId: dto.technicalSheetId,
        outputProductId: dto.outputProductId,
        outputVariantId: dto.outputVariantId ?? null,
      },
    });
    if (duplicate)
      throw new ConflictException({ code: 'PRODUCTION_PROFILE_ALREADY_EXISTS', id: duplicate.id });
    return this.prisma.productionProfile.create({ data: this.profileData(organizationId, dto) });
  }

  async updateProfile(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: UpsertProductionProfileDto,
  ) {
    this.assertPermission(actor, 'production.profile.manage');
    await this.assertProfileReferences(organizationId, dto);
    this.validateRules(dto);
    const current = await this.prisma.productionProfile.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException({ code: 'PRODUCTION_PROFILE_NOT_FOUND' });
    const expectedVersion = dto.expectedVersion ?? current.optimisticVersion;
    const result = await this.prisma.productionProfile.updateMany({
      where: { id, organizationId, optimisticVersion: expectedVersion },
      data: {
        ...this.profileData(organizationId, dto),
        organizationId: undefined,
        optimisticVersion: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new ConflictException({ code: 'PRODUCTION_PROFILE_CONCURRENT_UPDATE' });
    return this.prisma.productionProfile.findUniqueOrThrow({ where: { id } });
  }

  async simulateSuggestion(organizationId: string, dto: SimulateProductionSuggestionDto) {
    const profile = await this.prisma.productionProfile.findFirst({
      where: { id: dto.profileId, organizationId },
      include: { outputProduct: true, outputVariant: true, site: true, yieldUnit: true },
    });
    if (!profile) throw new NotFoundException({ code: 'PRODUCTION_PROFILE_NOT_FOUND' });
    const neededAt = new Date(dto.neededAt);
    if (Number.isNaN(neededAt.getTime())) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_NEEDED_AT' });
    }
    const availability = await this.availability(
      organizationId,
      profile.siteId,
      profile.outputProductId,
      profile.outputVariantId,
      neededAt,
    );
    const scenarios = generateProductionScenarios({
      grossRequirement: dto.grossRequirement,
      usableStock: availability.usable,
      confirmedProduction: availability.confirmedProduction,
      storageCapacity: dto.storageCapacity,
      optimizedTarget: dto.optimizedTarget,
      rules: this.rulesFromProfile(profile),
    });
    const recommendedQuantity =
      scenarios.find((item) => item.kind === 'RECOMMENDED')?.quantity ?? '0';
    const [componentPlan, capacity] = await Promise.all([
      this.buildComponentPlan(organizationId, profile.id, recommendedQuantity, neededAt, []),
      Promise.resolve(this.capacityAssessment(profile, scenarios)),
    ]);
    return { profile, neededAt, availability, scenarios, componentPlan, capacity };
  }

  async getAvailability(
    organizationId: string,
    siteId: string,
    productId: string,
    variantId: string | null,
    neededAt: Date,
  ) {
    return this.availability(organizationId, siteId, productId, variantId, neededAt);
  }

  async buildComponentPlan(
    organizationId: string,
    profileId: string,
    outputQuantity: string,
    neededAt: Date,
    ancestorSheetIds: string[] = [],
  ): Promise<{
    profileId: string;
    technicalSheetId: string;
    outputQuantity: string;
    components: Array<Record<string, unknown>>;
  }> {
    const profile = await this.prisma.productionProfile.findFirst({
      where: { id: profileId, organizationId },
      include: {
        technicalSheet: {
          include: {
            ingredients: {
              include: { product: { include: { unit: true } }, unit: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException({ code: 'PRODUCTION_PROFILE_NOT_FOUND' });
    if (ancestorSheetIds.includes(profile.technicalSheetId)) {
      throw new ConflictException({
        code: 'PRODUCTION_RECIPE_CYCLE',
        path: [...ancestorSheetIds, profile.technicalSheetId],
      });
    }

    const ratio = new Prisma.Decimal(outputQuantity).div(profile.referenceYield);
    const nextAncestors = [...ancestorSheetIds, profile.technicalSheetId];
    const components: Array<Record<string, unknown>> = [];
    for (const ingredient of profile.technicalSheet.ingredients) {
      const requiredRecipeUnit = ingredient.quantity.mul(ratio);
      const converted = await this.convertQuantity(
        organizationId,
        ingredient.unitId,
        ingredient.product.unitId,
        requiredRecipeUnit,
      );
      if (!converted) {
        components.push({
          product: ingredient.product,
          recipeUnit: ingredient.unit,
          requiredQuantity: requiredRecipeUnit.toFixed(3),
          stockUnitQuantity: null,
          status: 'UNIT_NOT_CONVERTIBLE',
          subRecipe: null,
        });
        continue;
      }

      const availability = await this.availability(
        organizationId,
        profile.siteId,
        ingredient.productId,
        null,
        neededAt,
      );
      const missing = Prisma.Decimal.max(
        0,
        converted.sub(availability.usable).sub(availability.confirmedProduction),
      );
      const subProfile = missing.gt(0)
        ? await this.prisma.productionProfile.findFirst({
            where: {
              organizationId,
              siteId: profile.siteId,
              outputProductId: ingredient.productId,
              outputVariantId: null,
              ...(ingredient.sourceTechnicalSheetId
                ? { technicalSheetId: ingredient.sourceTechnicalSheetId }
                : {}),
            },
            orderBy: { createdAt: 'asc' },
          })
        : null;
      let subRecipe: Record<string, unknown> | null = null;
      if (subProfile) {
        const suggestions = generateProductionScenarios({
          grossRequirement: converted,
          usableStock: availability.usable,
          confirmedProduction: availability.confirmedProduction,
          rules: this.rulesFromProfile(subProfile),
        });
        const selected = suggestions.find((item) => item.kind === 'RECOMMENDED')!;
        subRecipe = {
          profileId: subProfile.id,
          missingQuantity: missing.toFixed(3),
          suggestion: selected,
          plan: await this.buildComponentPlan(
            organizationId,
            subProfile.id,
            selected.quantity,
            neededAt,
            nextAncestors,
          ),
        };
      }
      components.push({
        product: ingredient.product,
        recipeUnit: ingredient.unit,
        requiredQuantity: requiredRecipeUnit.toFixed(3),
        stockUnitQuantity: converted.toFixed(3),
        availability,
        missingQuantity: missing.toFixed(3),
        status: missing.lte(0) ? 'AVAILABLE' : subRecipe ? 'TO_PRODUCE' : 'SHORTAGE',
        subRecipe,
      });
    }
    return {
      profileId: profile.id,
      technicalSheetId: profile.technicalSheetId,
      outputQuantity: new Prisma.Decimal(outputQuantity).toFixed(3),
      components,
    };
  }

  async snapshotRecipeTx(tx: Tx, organizationId: string, technicalSheetId: string) {
    const sheet = await tx.technicalSheet.findFirst({
      where: { id: technicalSheetId, organizationId },
      include: {
        ingredients: {
          include: { product: { select: { name: true } }, unit: { select: { symbol: true } } },
          orderBy: { order: 'asc' },
        },
        steps: { orderBy: { order: 'asc' } },
      },
    });
    if (!sheet) throw new NotFoundException({ code: 'TECHNICAL_SHEET_NOT_FOUND' });
    const existing = await tx.technicalSheetVersion.findUnique({
      where: {
        technicalSheetId_sourceUpdatedAt: {
          technicalSheetId,
          sourceUpdatedAt: sheet.updatedAt,
        },
      },
    });
    if (existing) return existing;
    const latest = await tx.technicalSheetVersion.findFirst({
      where: { technicalSheetId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return tx.technicalSheetVersion.create({
      data: {
        organizationId,
        technicalSheetId,
        version: (latest?.version ?? 0) + 1,
        sourceUpdatedAt: sheet.updatedAt,
        referenceYield: sheet.yieldMode === 'MASS' ? sheet.totalMassGrams : sheet.referencePortions,
        snapshot: {
          name: sheet.name,
          description: sheet.description,
          yieldMode: sheet.yieldMode,
          referencePortions: sheet.referencePortions.toString(),
          totalMassGrams: sheet.totalMassGrams?.toString() ?? '0',
          preparationTimeMinutes: sheet.preparationTimeMinutes,
          cookingTimeMinutes: sheet.cookingTimeMinutes,
          totalTimeMinutes: sheet.totalTimeMinutes,
          mode: sheet.mode,
          stockPolicy: sheet.stockPolicy,
          outputProductId: sheet.outputProductId,
          yieldUnitId: sheet.yieldUnitId,
          ingredients: sheet.ingredients.map((ingredient) => ({
            id: ingredient.id,
            productId: ingredient.productId,
            sourceTechnicalSheetId: ingredient.sourceTechnicalSheetId,
            unitId: ingredient.unitId,
            quantity: ingredient.quantity.toString(),
            productName: ingredient.product?.name ?? null,
            unitSymbol: ingredient.unit?.symbol ?? null,
            comment: ingredient.comment,
            section: ingredient.section,
            order: ingredient.order,
          })),
          steps: sheet.steps.map((step) => ({
            id: step.id,
            order: step.order,
            title: step.title,
            description: step.description,
            section: step.section,
            estimatedMinutes: step.estimatedMinutes,
          })),
        },
      },
    });
  }

  private async availability(
    organizationId: string,
    siteId: string,
    productId: string,
    variantId: string | null,
    neededAt: Date,
  ) {
    const stocks = await this.prisma.stock.findMany({
      where: { organizationId, siteId, productId, variantId },
      include: {
        lot: true,
        reservations: {
          where: {
            status: StockReservationStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: neededAt } }],
          },
        },
      },
    });
    let physical = new Prisma.Decimal(0);
    let reserved = new Prisma.Decimal(0);
    let usable = new Prisma.Decimal(0);
    for (const stock of stocks) {
      physical = physical.add(stock.quantity);
      const stockReserved = stock.reservations.reduce(
        (sum, reservation) => sum.add(reservation.quantity),
        new Prisma.Decimal(0),
      );
      reserved = reserved.add(stockReserved);
      if (!this.stockAvailableAt(stock.lot, neededAt)) continue;
      const free = stock.quantity.sub(stockReserved);
      if (free.gt(0)) usable = usable.add(free);
    }
    const confirmedOrders = await this.prisma.productionOrder.findMany({
      where: {
        organizationId,
        siteId,
        outputProductId: productId,
        outputVariantId: variantId,
        status: { in: CONFIRMED_ORDER_STATUSES },
        productionDate: { lte: neededAt },
      },
      select: { validatedQuantity: true, plannedPortions: true },
    });
    const confirmedProduction = confirmedOrders.reduce(
      (sum, order) =>
        sum.add(order.validatedQuantity.gt(0) ? order.validatedQuantity : order.plannedPortions),
      new Prisma.Decimal(0),
    );
    return {
      physical: physical.toFixed(3),
      reserved: reserved.toFixed(3),
      usable: usable.toFixed(3),
      confirmedProduction: confirmedProduction.toFixed(3),
    };
  }

  private stockAvailableAt(
    lot: {
      conservationState: ConservationState;
      expiresAt: Date | null;
      availableAt: Date | null;
    } | null,
    neededAt: Date,
  ) {
    if (!lot) return true;
    if (UNUSABLE_STATES.has(lot.conservationState)) return false;
    if (lot.expiresAt && lot.expiresAt < neededAt) return false;
    if (
      (lot.conservationState === ConservationState.FROZEN ||
        lot.conservationState === ConservationState.THAWING) &&
      !lot.availableAt
    )
      return false;
    if (lot.availableAt && lot.availableAt > neededAt) return false;
    return true;
  }

  private rulesFromProfile(profile: {
    mode: ProductionRuleSet['mode'];
    referenceYield: Prisma.Decimal;
    minimumQuantity: Prisma.Decimal | null;
    optimalQuantity: Prisma.Decimal | null;
    maximumQuantity: Prisma.Decimal | null;
    stepQuantity: Prisma.Decimal | null;
    allowedFormats: Prisma.JsonValue | null;
    allowHalfBatch: boolean;
    allowDoubleBatch: boolean;
  }): ProductionRuleSet {
    const allowedFormats = Array.isArray(profile.allowedFormats)
      ? profile.allowedFormats.filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
      : [];
    return {
      mode: profile.mode,
      referenceYield: profile.referenceYield,
      minimumQuantity: profile.minimumQuantity,
      optimalQuantity: profile.optimalQuantity,
      maximumQuantity: profile.maximumQuantity,
      stepQuantity: profile.stepQuantity,
      allowedFormats,
      allowHalfBatch: profile.allowHalfBatch,
      allowDoubleBatch: profile.allowDoubleBatch,
    };
  }

  rulesForProfile(profile: Parameters<ProductionPlanningService['rulesFromProfile']>[0]) {
    return this.rulesFromProfile(profile);
  }

  private capacityAssessment(
    profile: {
      quantityPerMold: Prisma.Decimal | null;
      quantityPerTray: Prisma.Decimal | null;
      quantityPerContainer: Prisma.Decimal | null;
      quantityPerCycle: Prisma.Decimal | null;
      maximumCycles: number | null;
    },
    scenarios: Array<{ quantity: string; batches: string[] }>,
  ) {
    return scenarios.map((scenario) => {
      const quantity = new Prisma.Decimal(scenario.quantity);
      const maximum =
        profile.quantityPerCycle && profile.maximumCycles
          ? profile.quantityPerCycle.mul(profile.maximumCycles)
          : null;
      return {
        kind: (scenario as { kind?: string }).kind,
        quantity: scenario.quantity,
        molds: profile.quantityPerMold
          ? quantity.div(profile.quantityPerMold).ceil().toFixed(0)
          : null,
        trays: profile.quantityPerTray
          ? quantity.div(profile.quantityPerTray).ceil().toFixed(0)
          : null,
        containers: profile.quantityPerContainer
          ? quantity.div(profile.quantityPerContainer).ceil().toFixed(0)
          : null,
        cycles: profile.quantityPerCycle
          ? quantity.div(profile.quantityPerCycle).ceil().toFixed(0)
          : scenario.batches.length.toString(),
        feasible: !maximum || quantity.lte(maximum),
        maximumQuantity: maximum?.toFixed(3) ?? null,
      };
    });
  }

  private async convertQuantity(
    organizationId: string,
    fromUnitId: string,
    toUnitId: string,
    quantity: Prisma.Decimal,
  ) {
    if (fromUnitId === toUnitId) return quantity;
    const conversion = await this.prisma.unitConversion.findFirst({
      where: { organizationId, fromUnitId, toUnitId },
    });
    return conversion ? quantity.mul(conversion.factor) : null;
  }

  private validateRules(dto: UpsertProductionProfileDto) {
    try {
      allowedBatchQuantities({
        mode: dto.mode,
        referenceYield: dto.referenceYield,
        minimumQuantity: dto.minimumQuantity,
        optimalQuantity: dto.optimalQuantity,
        maximumQuantity: dto.maximumQuantity,
        stepQuantity: dto.stepQuantity,
        allowedFormats: dto.allowedFormats,
        allowHalfBatch: dto.allowHalfBatch,
        allowDoubleBatch: dto.allowDoubleBatch,
      });
    } catch (error) {
      throw new BadRequestException({
        code: 'PRODUCTION_INVALID_PROFILE_RULES',
        message: error instanceof Error ? error.message : 'Invalid production rules',
      });
    }
  }

  private profileData(
    organizationId: string,
    dto: UpsertProductionProfileDto,
  ): Prisma.ProductionProfileUncheckedCreateInput {
    return {
      organizationId,
      siteId: dto.siteId,
      technicalSheetId: dto.technicalSheetId,
      outputProductId: dto.outputProductId,
      outputVariantId: dto.outputVariantId,
      yieldUnitId: dto.yieldUnitId,
      mode: dto.mode,
      referenceYield: new Prisma.Decimal(dto.referenceYield),
      minimumQuantity: dto.minimumQuantity ? new Prisma.Decimal(dto.minimumQuantity) : null,
      optimalQuantity: dto.optimalQuantity ? new Prisma.Decimal(dto.optimalQuantity) : null,
      maximumQuantity: dto.maximumQuantity ? new Prisma.Decimal(dto.maximumQuantity) : null,
      stepQuantity: dto.stepQuantity ? new Prisma.Decimal(dto.stepQuantity) : null,
      allowedFormats: dto.allowedFormats ?? Prisma.JsonNull,
      allowHalfBatch: dto.allowHalfBatch,
      allowDoubleBatch: dto.allowDoubleBatch,
      averageLossPercent: dto.averageLossPercent
        ? new Prisma.Decimal(dto.averageLossPercent)
        : undefined,
      safetyMarginPercent: dto.safetyMarginPercent
        ? new Prisma.Decimal(dto.safetyMarginPercent)
        : undefined,
      quantityPerMold: dto.quantityPerMold ? new Prisma.Decimal(dto.quantityPerMold) : null,
      quantityPerTray: dto.quantityPerTray ? new Prisma.Decimal(dto.quantityPerTray) : null,
      quantityPerContainer: dto.quantityPerContainer
        ? new Prisma.Decimal(dto.quantityPerContainer)
        : null,
      quantityPerCycle: dto.quantityPerCycle ? new Prisma.Decimal(dto.quantityPerCycle) : null,
      maximumCycles: dto.maximumCycles,
      canFreeze: dto.canFreeze,
      shelfLifeHours: dto.shelfLifeHours,
      frozenShelfLifeHours: dto.frozenShelfLifeHours,
      shelfLifeAfterThawHours: dto.shelfLifeAfterThawHours,
      thawingTimeMinutes: dto.thawingTimeMinutes,
      canRefreeze: dto.canRefreeze,
      roundingMode: dto.roundingMode,
    };
  }

  private async assertReferences(organizationId: string, dto: CreateProductionNeedDto) {
    const [site, product, unit, variant, service] = await Promise.all([
      this.prisma.site.findFirst({ where: { id: dto.siteId, organizationId, isArchived: false } }),
      this.prisma.product.findFirst({
        where: { id: dto.productId, organizationId, isArchived: false },
      }),
      this.prisma.unit.findFirst({ where: { id: dto.unitId, organizationId, isArchived: false } }),
      dto.variantId
        ? this.prisma.productVariant.findFirst({
            where: {
              id: dto.variantId,
              organizationId,
              productId: dto.productId,
              isArchived: false,
            },
          })
        : Promise.resolve(true),
      dto.serviceId
        ? this.prisma.hrDepartment.findFirst({
            where: { id: dto.serviceId, organizationId, isArchived: false },
          })
        : Promise.resolve(true),
    ]);
    if (!site || !product || !unit || !variant || !service) {
      throw new BadRequestException({ code: 'PRODUCTION_REFERENCE_OUTSIDE_ORGANIZATION' });
    }
  }

  private async assertProfileReferences(organizationId: string, dto: UpsertProductionProfileDto) {
    await this.assertReferences(organizationId, {
      siteId: dto.siteId,
      productId: dto.outputProductId,
      variantId: dto.outputVariantId,
      unitId: dto.yieldUnitId,
      source: 'MANUAL',
      quantity: dto.referenceYield,
      neededAt: new Date().toISOString(),
    } as CreateProductionNeedDto);
    const sheet = await this.prisma.technicalSheet.findFirst({
      where: { id: dto.technicalSheetId, organizationId, isArchived: false },
    });
    if (!sheet) throw new BadRequestException({ code: 'PRODUCTION_TECHNICAL_SHEET_NOT_FOUND' });
    const product = await this.prisma.product.findFirst({
      where: { id: dto.outputProductId, organizationId, isArchived: false },
      select: { unitId: true },
    });
    if (product && product.unitId !== dto.yieldUnitId) {
      throw new BadRequestException({
        code: 'PRODUCTION_OUTPUT_UNIT_MUST_MATCH_STOCK_UNIT',
        message: 'Le rendement doit utiliser l’unité de stock du produit fini.',
      });
    }
  }
}
