// @ts-nocheck
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, OperationalTaskStatus, Prisma, ProductionAlertCode, ProductionAlertSeverity, ProductionBatchStatus, ProductionDestockingStatus, ProductionExportFormat, ProductionHistoryAction, ProductionMaterialStatus, ProductionOrderStatus, ProductionPriority, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionPlanningService } from './production-planning.service';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second'];
const FINALIZING = [ProductionOrderStatus.VALIDATED, ProductionOrderStatus.IN_PROGRESS, ProductionOrderStatus.COMPLETED];

type Actor = { id: string; role: string };

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: ProductionPlanningService,
  ) {}

  private assertWrite(actor: Actor) { if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Droits Production insuffisants'); }
  private page(q: any = {}) { const take = Math.min(q.pageSize ?? 50, 200); return { take, skip: ((q.page ?? 1) - 1) * take }; }
  private dayRange(date = new Date()) { const start = new Date(date); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; }
  private dateRange(q: any = {}) { return q.date ? this.dayRange(new Date(q.date)) : { start: q.startDate ? new Date(q.startDate) : undefined, end: q.endDate ? new Date(q.endDate) : undefined }; }

  private async assertInstalled(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, technicalSheetsInstalledAt: true, productionInstalledAt: true } });
    if (!org?.stocksInstalledAt) throw new BadRequestException('Le module Stocks doit être installé avant Production.');
    if (!org.technicalSheetsInstalledAt) throw new BadRequestException('Le module Fiches Techniques doit être installé avant Production.');
    if (!org.productionInstalledAt) throw new BadRequestException('Le module Production n’est pas installé.');
  }

  async install(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, rnmPricesInstalledAt: true, hrInstalledAt: true, planningInstalledAt: true, technicalSheetsInstalledAt: true, productionInstalledAt: true } });
    if (!org?.stocksInstalledAt || !org.technicalSheetsInstalledAt) throw new BadRequestException('Installation impossible: Stocks et Fiches Techniques sont obligatoires.');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { productionInstalledAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_PRODUCTION_INSTALLED, entityType: 'Module', entityId: 'production', entityName: 'Production' } });
    });
    return { installed: true, installedApplications: this.installedApps({ ...org, productionInstalledAt: new Date() }) };
  }

  async uninstall(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, rnmPricesInstalledAt: true, hrInstalledAt: true, planningInstalledAt: true, technicalSheetsInstalledAt: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { productionInstalledAt: null } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_PRODUCTION_UNINSTALLED, entityType: 'Module', entityId: 'production', entityName: 'Production' } });
    });
    return { installed: false, installedApplications: this.installedApps({ ...org, productionInstalledAt: null }) };
  }

  async dashboard(organizationId: string) {
    await this.assertInstalled(organizationId);
    const { start, end } = this.dayRange();
    const [orders, alerts, pendingDestocking] = await Promise.all([
      this.prisma.productionOrder.findMany({ where: { organizationId, productionDate: { gte: start, lt: end } }, include: this.orderInclude(), orderBy: { plannedTime: 'asc' } }),
      this.prisma.productionAlert.findMany({ where: { organizationId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 12 }),
      this.prisma.productionDestockingProposal.count({ where: { organizationId, status: ProductionDestockingStatus.PROPOSED } }),
    ]);
    const now = new Date();
    return { stats: { plannedToday: orders.length, inProgress: orders.filter((o) => o.status === 'IN_PROGRESS').length, completed: orders.filter((o) => o.status === 'COMPLETED').length, late: orders.filter((o) => this.isLate(o, now)).length, plannedPortionsToday: orders.reduce((s, o) => s + Number(o.plannedPortions), 0), realizedPortionsToday: orders.reduce((s, o) => s + Number(o.realizedPortions ?? 0), 0), pendingDestocking }, alerts, today: orders.map((o) => this.serializeOrder(o)) };
  }

  async listOrders(organizationId: string, q: any = {}) {
    await this.assertInstalled(organizationId); const { start, end } = this.dateRange(q);
    const where: any = { organizationId, status: q.status, serviceId: q.serviceId, responsibleEmployeeId: q.employeeId, productionDate: start || end ? { gte: start, lt: end } : undefined, OR: q.search ? [{ name: { contains: q.search, mode: 'insensitive' } }, { number: { contains: q.search, mode: 'insensitive' } }, { technicalSheet: { name: { contains: q.search, mode: 'insensitive' } } }] : undefined };
    const [items, total] = await Promise.all([this.prisma.productionOrder.findMany({ where, include: this.orderInclude(), orderBy: [{ productionDate: 'asc' }, { plannedTime: 'asc' }], ...this.page(q) }), this.prisma.productionOrder.count({ where })]);
    return { items: items.map((o) => this.serializeOrder(o)), total, page: q.page ?? 1, pageSize: Math.min(q.pageSize ?? 50, 200) };
  }

  async getOrder(organizationId: string, id: string) { await this.assertInstalled(organizationId); const order = await this.prisma.productionOrder.findFirst({ where: { id, organizationId }, include: this.orderInclude(true) }); if (!order) throw new NotFoundException('Ordre introuvable'); return this.serializeOrder(order); }

  async createOrder(organizationId: string, actor: Actor, dto: any) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    const recipe = await this.prisma.technicalSheet.findFirst({ where: { id: dto.technicalSheetId, organizationId, isArchived: false }, include: { ingredients: { include: { product: { include: { unit: true, primarySupplier: true, stocks: true } }, unit: true } } } });
    if (!recipe) throw new NotFoundException('Fiche technique source introuvable');
    if (dto.serviceId) await this.ensureService(organizationId, dto.serviceId); if (dto.responsibleEmployeeId) await this.ensureEmployee(organizationId, dto.responsibleEmployeeId);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx, organizationId);
      const recipeVersion = await this.planning.snapshotRecipeTx(tx, organizationId, recipe.id);
      const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { primarySiteId: true } });
      const profile = organization?.primarySiteId ? await tx.productionProfile.findFirst({ where: { organizationId, siteId: organization.primarySiteId, technicalSheetId: recipe.id } }) : null;
      const created = await tx.productionOrder.create({ data: { organizationId, siteId: profile?.siteId ?? organization?.primarySiteId ?? null, number, name: dto.name || recipe.name, technicalSheetId: recipe.id, recipeVersionId: recipeVersion.id, outputProductId: profile?.outputProductId ?? null, outputVariantId: profile?.outputVariantId ?? null, productionDate: new Date(dto.productionDate), plannedTime: dto.plannedTime, plannedPortions: dto.plannedPortions, grossRequirement: dto.plannedPortions, netRequirement: dto.plannedPortions, proposedQuantity: dto.plannedPortions, validatedQuantity: dto.plannedPortions, serviceId: dto.serviceId || null, responsibleEmployeeId: dto.responsibleEmployeeId || null, priority: dto.priority ?? ProductionPriority.NORMAL, comments: dto.comments, createdById: actor.id } });
      await this.recalculateTx(tx, organizationId, created.id);
      await this.recordHistory(tx, organizationId, created.id, actor.id, ProductionHistoryAction.CREATED, `Création manuelle ${number}`, { technicalSheetId: recipe.id });
      return this.serializeOrder(await tx.productionOrder.findUnique({ where: { id: created.id }, include: this.orderInclude(true) }));
    });
  }

  async updateOrder(organizationId: string, actor: Actor, id: string, dto: any) {
    await this.assertInstalled(organizationId); this.assertWrite(actor); await this.ensureOrder(organizationId, id);
    if (dto.serviceId) await this.ensureService(organizationId, dto.serviceId); if (dto.responsibleEmployeeId) await this.ensureEmployee(organizationId, dto.responsibleEmployeeId);
    return this.prisma.$transaction(async (tx) => { await tx.productionOrder.update({ where: { id, organizationId }, data: { ...dto, productionDate: dto.productionDate ? new Date(dto.productionDate) : undefined, updatedById: actor.id } }); if (dto.plannedPortions) await this.recalculateTx(tx, organizationId, id); await this.refreshAlertsTx(tx, organizationId, id); await this.recordHistory(tx, organizationId, id, actor.id, ProductionHistoryAction.UPDATED, 'Modification ordre'); return this.serializeOrder(await tx.productionOrder.findUnique({ where: { id }, include: this.orderInclude(true) })); });
  }

  async recalculateOrder(organizationId: string, actor: Actor, id: string) { await this.assertInstalled(organizationId); this.assertWrite(actor); return this.prisma.$transaction(async (tx) => { await this.recalculateTx(tx, organizationId, id); await this.recordHistory(tx, organizationId, id, actor.id, ProductionHistoryAction.UPDATED, 'Recalcul besoins matières'); return this.serializeOrder(await tx.productionOrder.findUnique({ where: { id }, include: this.orderInclude(true) })); }); }

  async changeStatus(organizationId: string, actor: Actor, id: string, dto: any) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.findFirst({ where: { id, organizationId }, include: { alerts: { where: { isActive: true } } } }); if (!order) throw new NotFoundException('Ordre introuvable');
      const critical = order.alerts.filter((a) => a.severity === ProductionAlertSeverity.CRITICAL);
      if (critical.length && FINALIZING.includes(dto.status) && !dto.confirmCriticalOverride) throw new BadRequestException({ message: 'Confirmation explicite requise pour contourner les alertes critiques.', criticalAlerts: critical });
      if (critical.length && dto.confirmCriticalOverride) { if (!dto.overrideReason) throw new BadRequestException('Motif requis'); for (const a of critical) await tx.productionAlertOverride.create({ data: { organizationId, alertId: a.id, confirmedById: actor.id, reason: dto.overrideReason, snapshot: a } }); await this.recordHistory(tx, organizationId, id, actor.id, ProductionHistoryAction.ALERT_OVERRIDE_CONFIRMED, 'Contournement alertes critiques confirmé', { reason: dto.overrideReason }); }
      const statusChangedAt = new Date();
      if (dto.status === ProductionOrderStatus.CANCELLED) {
        await tx.haccpProcessSession.updateMany({
          where: { organizationId, productionSession: { productionBatch: { orderId: id } }, status: 'en_cours' },
          data: { status: 'annule', endTime: statusChangedAt, syncVersion: { increment: 1 } },
        });
        await tx.haccpProductionSession.updateMany({
          where: { organizationId, productionBatch: { orderId: id }, status: 'en_cours' },
          data: { status: 'annule', endTime: statusChangedAt, syncVersion: { increment: 1 } },
        });
        await tx.productionBatch.updateMany({
          where: { orderId: id, status: { notIn: [ProductionBatchStatus.COMPLETED, ProductionBatchStatus.PARTIALLY_LOST] } },
          data: { status: ProductionBatchStatus.CANCELLED, completedAt: statusChangedAt, optimisticVersion: { increment: 1 } },
        });
        await tx.operationalTask.updateMany({
          where: { organizationId, productionBatch: { orderId: id }, status: { not: OperationalTaskStatus.COMPLETED } },
          data: { status: OperationalTaskStatus.CANCELLED, completedAt: statusChangedAt },
        });
      }
      const updated = await tx.productionOrder.update({ where: { id }, data: { status: dto.status, updatedById: actor.id, completedAt: dto.status === 'COMPLETED' ? statusChangedAt : undefined, completedById: dto.status === 'COMPLETED' ? actor.id : undefined, cancelledAt: dto.status === 'CANCELLED' ? statusChangedAt : undefined }, include: this.orderInclude(true) });
      await this.recordHistory(tx, organizationId, id, actor.id, dto.status === 'CANCELLED' ? ProductionHistoryAction.CANCELLED : dto.status === 'VALIDATED' ? ProductionHistoryAction.VALIDATED : ProductionHistoryAction.STATUS_CHANGED, `Statut ${dto.status}`); await this.refreshAlertsTx(tx, organizationId, id); return this.serializeOrder(updated);
    });
  }

  async assignEmployee(organizationId: string, actor: Actor, orderId: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertWrite(actor);
    const order = await this.ensureOrder(organizationId, orderId);
    const employee = await this.ensureEmployee(organizationId, dto.employeeId);
    if (!order.serviceId) {
      throw new BadRequestException('Choisissez le service responsable avant d’affecter l’équipe.');
    }
    if (employee.departmentId !== order.serviceId) {
      throw new BadRequestException('Le collaborateur ne dépend pas du service sélectionné.');
    }
    const startsAt = new Date(order.productionDate);
    const [hours, minutes] = String(order.plannedTime || '08:00').split(':').map(Number);
    startsAt.setHours(hours || 0, minutes || 0, 0, 0);
    const endsAt = new Date(
      startsAt.getTime() + Math.max(Number(dto.plannedMinutes || 60), 5) * 60_000,
    );
    const planningAssignment = await this.prisma.planningAssignment.findFirst({
      where: {
        organizationId,
        employeeId: dto.employeeId,
        ...(dto.planningAssignmentId ? { id: dto.planningAssignmentId } : {}),
        status: { not: 'CANCELLED' },
        startTime: { lte: startsAt },
        endTime: { gte: endsAt },
      },
    });
    if (!planningAssignment) {
      throw new BadRequestException(
        'Cette personne ne travaille pas sur le créneau de production sélectionné.',
      );
    }
    const assignmentDto = {
      ...dto,
      planningAssignmentId: planningAssignment.id,
    };
    const item = await this.prisma.$transaction(async (tx) => {
      if (assignmentDto.isLead) {
        await tx.productionAssignment.updateMany({ where: { organizationId, orderId }, data: { isLead: false } });
      }
      const assignment = await tx.productionAssignment.upsert({
        where: { orderId_employeeId: { orderId, employeeId: assignmentDto.employeeId } },
        update: assignmentDto,
        create: { organizationId, orderId, ...assignmentDto },
      });
      const tasks = await tx.operationalTask.findMany({
        where: { organizationId, productionBatch: { orderId } },
        select: { id: true },
      });
      for (const task of tasks) {
        await tx.operationalTaskAssignment.upsert({
          where: { taskId_employeeId: { taskId: task.id, employeeId: dto.employeeId } },
          create: {
            organizationId,
            taskId: task.id,
            employeeId: assignmentDto.employeeId,
            planningAssignmentId: assignmentDto.planningAssignmentId,
            isLead: Boolean(assignmentDto.isLead),
            mission: assignmentDto.mission ?? null,
            plannedMinutes: assignmentDto.plannedMinutes ?? null,
          },
          update: {
            planningAssignmentId: assignmentDto.planningAssignmentId,
            isLead: Boolean(assignmentDto.isLead),
            mission: assignmentDto.mission ?? null,
            plannedMinutes: assignmentDto.plannedMinutes ?? null,
          },
        });
      }
      if (assignmentDto.isLead) {
        await tx.operationalTaskAssignment.updateMany({
          where: { task: { productionBatch: { orderId } }, employeeId: { not: assignmentDto.employeeId } },
          data: { isLead: false },
        });
        await tx.operationalTask.updateMany({
          where: { organizationId, productionBatch: { orderId } },
          data: { assignedEmployeeId: assignmentDto.employeeId },
        });
      }
      return assignment;
    });
    await this.prisma.productionHistory.create({ data: { organizationId, orderId, actorUserId: actor.id, action: ProductionHistoryAction.ASSIGNMENT_ADDED, summary: 'Affectation collaborateur', details: { employeeId: assignmentDto.employeeId } } });
    await this.prisma.$transaction((tx) => this.refreshAlertsTx(tx, organizationId, orderId));
    return item;
  }

  async removeAssignment(organizationId: string, actor: Actor, orderId: string, assignmentId: string) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.productionAssignment.findFirst({ where: { id: assignmentId, orderId, organizationId } });
      if (!assignment) throw new NotFoundException('Affectation introuvable');
      await tx.productionAssignment.delete({ where: { id: assignmentId } });
      await tx.operationalTaskAssignment.deleteMany({
        where: { employeeId: assignment.employeeId, task: { productionBatch: { orderId } } },
      });
      if (assignment.isLead) {
        const next = await tx.productionAssignment.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.productionAssignment.update({ where: { id: next.id }, data: { isLead: true } });
        await tx.operationalTask.updateMany({
          where: { organizationId, productionBatch: { orderId } },
          data: { assignedEmployeeId: next?.employeeId ?? null },
        });
        if (next) {
          await tx.operationalTaskAssignment.updateMany({
            where: { employeeId: next.employeeId, task: { productionBatch: { orderId } } },
            data: { isLead: true },
          });
        }
      }
    });
    await this.prisma.productionHistory.create({ data: { organizationId, orderId, actorUserId: actor.id, action: ProductionHistoryAction.ASSIGNMENT_REMOVED, summary: 'Suppression affectation' } });
    await this.prisma.$transaction((tx) => this.refreshAlertsTx(tx, organizationId, orderId));
    return { deleted: true };
  }

  async closeRealization(organizationId: string, actor: Actor, orderId: string, dto: any) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => { const order = await tx.productionOrder.findFirst({ where: { id: orderId, organizationId } }); if (!order) throw new NotFoundException('Ordre introuvable'); const realization = await tx.productionRealization.upsert({ where: { orderId }, update: { ...dto, actualStartTime: dto.actualStartTime ? new Date(dto.actualStartTime) : undefined, actualEndTime: dto.actualEndTime ? new Date(dto.actualEndTime) : undefined }, create: { organizationId, orderId, ...dto, actualStartTime: dto.actualStartTime ? new Date(dto.actualStartTime) : undefined, actualEndTime: dto.actualEndTime ? new Date(dto.actualEndTime) : undefined } }); await tx.productionOrder.update({ where: { id: orderId }, data: { realizedPortions: dto.realizedPortions, status: ProductionOrderStatus.COMPLETED, completedAt: new Date(), completedById: actor.id } }); await this.recordHistory(tx, organizationId, orderId, actor.id, ProductionHistoryAction.REALIZATION_CLOSED, 'Clôture réalisation détaillée'); if (dto.confirmDestocking) await this.proposeDestockingTx(tx, organizationId, actor, orderId); await this.refreshAlertsTx(tx, organizationId, orderId); return realization; });
  }

  async proposeDestocking(organizationId: string, actor: Actor, orderId: string) { await this.assertInstalled(organizationId); this.assertWrite(actor); return this.prisma.$transaction((tx) => this.proposeDestockingTx(tx, organizationId, actor, orderId)); }
  async confirmDestocking(organizationId: string, actor: Actor, proposalId: string, dto: any) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => { const proposal = await tx.productionDestockingProposal.findFirst({ where: { id: proposalId, organizationId }, include: { lines: true, order: true } }); if (!proposal) throw new NotFoundException('Proposition introuvable'); if (proposal.status === ProductionDestockingStatus.CONFIRMED) throw new BadRequestException('Déstockage déjà confirmé'); const movementIds = []; for (const line of proposal.lines) { const qty = new Prisma.Decimal(line.confirmedQuantity ?? line.proposedQuantity); const movement = await tx.stockMovement.create({ data: { organizationId, productId: line.productId, type: StockMovementType.CONSUMPTION, quantity: qty.neg(), inputQuantity: qty, unitId: line.unitId, unitSymbolSnapshot: line.unitSymbolSnapshot, reason: `Production ${proposal.order.number}`, sourceEntityType: 'ProductionOrder', sourceEntityId: proposal.orderId, movementDate: new Date(), createdById: actor.id } }); await this.applyStock(tx, organizationId, line.productId, qty.neg()); await tx.productionDestockingMovement.create({ data: { organizationId, proposalId, stockMovementId: movement.id } }); movementIds.push(movement.id); } const updated = await tx.productionDestockingProposal.update({ where: { id: proposalId }, data: { status: ProductionDestockingStatus.CONFIRMED, confirmedAt: new Date(), confirmedById: actor.id, confirmationNote: dto.note } }); await this.recordHistory(tx, organizationId, proposal.orderId, actor.id, ProductionHistoryAction.DESTOCKING_CONFIRMED, 'Déstockage confirmé manuellement via Stocks', { movementIds }); return updated; });
  }

  async materialRequirements(organizationId: string, q: any = {}) { await this.assertInstalled(organizationId); const { start, end } = this.dateRange(q); return this.prisma.productionMaterialRequirement.findMany({ where: { organizationId, orderId: q.orderId, order: { serviceId: q.serviceId, productionDate: start || end ? { gte: start, lt: end } : undefined } }, include: { product: { include: { primarySupplier: true } }, unit: true, order: { include: { technicalSheet: true, service: true } }, supplier: true }, orderBy: [{ status: 'desc' }, { productNameSnapshot: 'asc' }], ...this.page(q) }); }
  today(organizationId: string, q: any = {}) { return this.listOrders(organizationId, { ...q, date: q.date ?? new Date().toISOString() }); }
  async calendar(organizationId: string, q: any = {}) { return (await this.listOrders(organizationId, q)).items; }
  async history(organizationId: string, q: any = {}) { await this.assertInstalled(organizationId); return this.prisma.productionHistory.findMany({ where: { organizationId, orderId: q.orderId }, include: { actorUser: { select: { email: true, firstName: true, lastName: true } }, order: true }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }
  async exports(organizationId: string, q: any = {}) { await this.assertInstalled(organizationId); return this.prisma.productionExport.findMany({ where: { organizationId, orderId: q.orderId, serviceId: q.serviceId }, include: { requestedBy: { select: { email: true, firstName: true, lastName: true } }, order: true }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }

  async prepareExport(organizationId: string, actor: Actor, dto: any) { await this.assertInstalled(organizationId); this.assertWrite(actor); const orders = await this.prisma.productionOrder.findMany({ where: { organizationId, id: dto.orderId, serviceId: dto.serviceId }, include: this.orderInclude(true) }); const snapshot = { generatedAt: new Date().toISOString(), type: dto.type, format: dto.format, filters: dto.filters, orders: orders.map((o) => this.serializeOrder(o)) }; const filename = `production-${dto.type.toLowerCase()}-${Date.now()}.${dto.format === ProductionExportFormat.EXCEL ? 'xlsx' : dto.format === ProductionExportFormat.PDF ? 'pdf' : 'print'}`; const exp = await this.prisma.productionExport.create({ data: { organizationId, requestedById: actor.id, type: dto.type, format: dto.format, startDate: dto.startDate ? new Date(dto.startDate) : null, endDate: dto.endDate ? new Date(dto.endDate) : null, serviceId: dto.serviceId || null, orderId: dto.orderId || null, filename, filters: dto.filters, snapshot } }); await this.prisma.productionHistory.create({ data: { organizationId, orderId: dto.orderId || null, actorUserId: actor.id, action: ProductionHistoryAction.EXPORT_GENERATED, summary: `Export ${dto.type} ${dto.format} historisé`, details: { exportId: exp.id } } }); return exp; }

  private async recalculateTx(tx: any, organizationId: string, orderId: string) { const order = await tx.productionOrder.findFirst({ where: { id: orderId, organizationId }, include: { technicalSheet: { include: { ingredients: { include: { product: { include: { unit: true, primarySupplier: true, stocks: true } }, unit: true } } } } } }); if (!order) throw new NotFoundException('Ordre introuvable'); await tx.productionMaterialRequirement.deleteMany({ where: { orderId } }); const factor = new Prisma.Decimal(order.plannedPortions).div(order.technicalSheet.referencePortions || 1); let estimatedCost = new Prisma.Decimal(0); for (const ing of order.technicalSheet.ingredients) { const required = new Prisma.Decimal(ing.quantity).mul(factor); const available = ing.product.stocks.reduce((s, st) => s.add(st.quantity), new Prisma.Decimal(0)); const status = ing.product.isArchived ? ProductionMaterialStatus.PRODUCT_ARCHIVED : available.isZero() ? ProductionMaterialStatus.STOCK_UNKNOWN : available.lt(required) ? ProductionMaterialStatus.INSUFFICIENT_STOCK : available.sub(required).lte(ing.product.minimumStock) ? ProductionMaterialStatus.POTENTIAL_SHORTAGE : ProductionMaterialStatus.OK; const cost = ing.cost == null ? null : new Prisma.Decimal(ing.cost).mul(factor); if (cost) estimatedCost = estimatedCost.add(cost); await tx.productionMaterialRequirement.create({ data: { organizationId, orderId, technicalSheetIngredientId: ing.id, productId: ing.productId, unitId: ing.unitId, supplierId: ing.product.primarySupplierId, requiredQuantity: required, stockAvailable: available, varianceQuantity: available.sub(required), status, estimatedCost: cost, productNameSnapshot: ing.product.name, unitSymbolSnapshot: ing.unit.symbol, supplierNameSnapshot: ing.product.primarySupplier?.name, details: { sourceTechnicalSheetId: order.technicalSheetId } } }); } await tx.productionOrder.update({ where: { id: orderId }, data: { estimatedCost } }); await this.refreshAlertsTx(tx, organizationId, orderId); }
  private async refreshAlertsTx(tx: any, organizationId: string, orderId: string) { await tx.productionAlert.updateMany({ where: { organizationId, orderId, isActive: true }, data: { isActive: false, resolvedAt: new Date() } }); const o = await tx.productionOrder.findFirst({ where: { id: orderId, organizationId }, include: { requirements: true, assignments: true, realization: true, destockingProposals: true } }); if (!o) return; const alerts = []; if (!o.responsibleEmployeeId) alerts.push([ProductionAlertCode.NO_RESPONSIBLE, ProductionAlertSeverity.CRITICAL, 'Ordre sans responsable']); if (!o.assignments.length) alerts.push([ProductionAlertCode.UNASSIGNED_COLLABORATOR, ProductionAlertSeverity.WARNING, 'Aucun collaborateur affecté']); if (this.isLate(o, new Date())) alerts.push([ProductionAlertCode.LATE, ProductionAlertSeverity.CRITICAL, 'Production en retard']); if (o.requirements.some((r) => ['INSUFFICIENT_STOCK', 'PRODUCT_ARCHIVED', 'UNIT_NOT_CONVERTIBLE'].includes(r.status))) alerts.push([ProductionAlertCode.MISSING_MATERIAL, ProductionAlertSeverity.CRITICAL, 'Manque matière']); if (o.status === 'COMPLETED' && !o.realization?.qualityControlDone) alerts.push([ProductionAlertCode.QUALITY_CONTROL_MISSING, ProductionAlertSeverity.CRITICAL, 'Contrôle qualité manquant']); if (o.destockingProposals.some((p) => p.status === 'PROPOSED')) alerts.push([ProductionAlertCode.DESTOCKING_PENDING, ProductionAlertSeverity.WARNING, 'Déstockage proposé non confirmé']); for (const [code, severity, title] of alerts) await tx.productionAlert.create({ data: { organizationId, orderId, code, severity, title, message: title } }); }
  private async proposeDestockingTx(tx: any, organizationId: string, actor: Actor, orderId: string) { const order = await tx.productionOrder.findFirst({ where: { id: orderId, organizationId }, include: { requirements: true } }); if (!order) throw new NotFoundException('Ordre introuvable'); const p = await tx.productionDestockingProposal.create({ data: { organizationId, orderId, snapshot: { orderId, generatedAt: new Date().toISOString(), requirements: order.requirements } } }); await tx.productionDestockingLine.createMany({ data: order.requirements.map((r) => ({ organizationId, proposalId: p.id, requirementId: r.id, productId: r.productId, unitId: r.unitId, proposedQuantity: r.requiredQuantity, productNameSnapshot: r.productNameSnapshot, unitSymbolSnapshot: r.unitSymbolSnapshot })) }); await this.recordHistory(tx, organizationId, orderId, actor.id, ProductionHistoryAction.DESTOCKING_PROPOSED, 'Proposition de déstockage préparée'); return p; }
  private async applyStock(tx: any, organizationId: string, productId: string, delta: any) { const stock = await tx.stock.findFirst({ where: { organizationId, productId }, orderBy: { createdAt: 'asc' } }); if (stock) await tx.stock.update({ where: { id: stock.id }, data: { quantity: stock.quantity.add(delta) } }); else await tx.stock.create({ data: { organizationId, productId, quantity: delta } }); }
  private async nextNumber(tx: any, organizationId: string) { const year = new Date().getFullYear(); const count = await tx.productionOrder.count({ where: { organizationId, number: { startsWith: `OP-${year}-` } } }); return `OP-${year}-${String(count + 1).padStart(4, '0')}`; }
  private isLate(o: any, now: Date) { if (['COMPLETED', 'CANCELLED'].includes(o.status)) return false; const d = new Date(o.productionDate); const [h, m] = String(o.plannedTime || '00:00').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d < now; }
  private orderInclude(full = false) { return { technicalSheet: true, service: true, responsibleEmployee: true, requirements: { include: { product: { include: { unit: true, primarySupplier: true } }, unit: true, supplier: true } }, assignments: { include: { employee: { include: { position: true, department: true } }, planningAssignment: true } }, alerts: { where: { isActive: true }, include: { overrides: true } }, realization: true, destockingProposals: { include: { lines: true } }, ...(full ? { history: { orderBy: { createdAt: 'desc' as const }, take: 50 }, exports: { orderBy: { createdAt: 'desc' as const }, take: 20 } } : {}) }; }
  private serializeOrder(o: any) { if (!o) return o; const critical = (o.alerts ?? []).filter((a) => a.severity === 'CRITICAL'); return { ...o, plannedPortions: Number(o.plannedPortions), realizedPortions: o.realizedPortions == null ? null : Number(o.realizedPortions), estimatedCost: Number(o.estimatedCost ?? 0), enrichedPriority: critical.length ? 'URGENT' : (o.alerts?.length && o.priority === 'NORMAL' ? 'HIGH' : o.priority), requirements: (o.requirements ?? []).map((r) => ({ ...r, requiredQuantity: Number(r.requiredQuantity), stockAvailable: r.stockAvailable == null ? null : Number(r.stockAvailable), varianceQuantity: r.varianceQuantity == null ? null : Number(r.varianceQuantity), estimatedCost: r.estimatedCost == null ? null : Number(r.estimatedCost) })) }; }
  private async ensureOrder(organizationId: string, id: string) { const item = await this.prisma.productionOrder.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Ordre introuvable'); return item; }
  private async ensureEmployee(organizationId: string, id: string) { const item = await this.prisma.hrEmployee.findFirst({ where: { id, organizationId, isArchived: false } }); if (!item) throw new NotFoundException('Collaborateur RH introuvable'); return item; }
  private async ensureService(organizationId: string, id: string) { const item = await this.prisma.hrDepartment.findFirst({ where: { id, organizationId, isArchived: false } }); if (!item) throw new NotFoundException('Service RH introuvable'); return item; }
  private recordHistory(tx: any, organizationId: string, orderId: string | null, actorUserId: string | null, action: any, summary: string, details?: any) { return tx.productionHistory.create({ data: { organizationId, orderId, actorUserId, action, summary, details } }); }
  private installedApps(org: any) { return [...(org?.stocksInstalledAt ? ['stocks'] : []), ...(org?.rnmPricesInstalledAt ? ['rnm-prices'] : []), ...(org?.hrInstalledAt ? ['hr'] : []), ...(org?.planningInstalledAt ? ['planning'] : []), ...(org?.technicalSheetsInstalledAt ? ['technical-sheets'] : []), ...(org?.productionInstalledAt ? ['production'] : [])]; }
}
