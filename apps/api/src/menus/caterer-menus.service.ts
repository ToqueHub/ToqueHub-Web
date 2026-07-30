import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CatererEventStatus, MenuActivity, MenuKind, MenuProductionGenerationMode, MenuStatus, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionExecutionService } from '../production/production-execution.service';
import { CatererEventLifecycleService } from '../production/caterer-event-lifecycle.service';
import { positionSupportsTechnicalSheets } from '../hr/hr-task-presets';
import { MenusService } from './menus.service';

type Actor = { id: string; role: string; permissions?: string[] };
const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second'];
const MANAGER_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef'];

@Injectable()
export class CatererMenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly productionExecution?: ProductionExecutionService,
    private readonly catererLifecycle?: CatererEventLifecycleService,
  ) {}

  async clients(organizationId: string, query: { search?: string; includeArchived?: boolean } = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.catererClient.findMany({
      where: {
        organizationId,
        isArchived: query.includeArchived ? undefined : false,
        OR: query.search ? [
          { name: { contains: query.search, mode: 'insensitive' } },
          { contactName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ] : undefined,
      },
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertClient(organizationId: string, actor: Actor, dto: any, id?: string) {
    await this.assertInstalled(organizationId);
    this.assertWrite(actor);
    const name = String(dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Le nom du client est obligatoire.');
    const duplicate = await this.prisma.catererClient.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) },
    });
    if (duplicate) throw new BadRequestException('Un client portant ce nom existe déjà.');
    const data = {
      name,
      contactName: dto.contactName?.trim() || null,
      email: dto.email?.trim() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      notes: dto.notes?.trim() || null,
      isArchived: dto.isArchived ?? false,
      archivedAt: dto.isArchived ? new Date() : null,
    };
    if (!id) return this.prisma.catererClient.create({ data: { organizationId, ...data } });
    const existing = await this.prisma.catererClient.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Client Traiteur introuvable.');
    return this.prisma.catererClient.update({ where: { id }, data });
  }

  async dashboard(organizationId: string) {
    await this.assertInstalled(organizationId);
    const now = new Date();
    const inThirtyDays = new Date(now);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    const events = await this.prisma.catererEvent.findMany({
      where: { organizationId, startsAt: { gte: now, lt: inThirtyDays }, status: { notIn: [CatererEventStatus.CANCELLED, CatererEventStatus.COMPLETED] } },
      include: this.eventInclude(),
      orderBy: { startsAt: 'asc' },
      take: 20,
    });
    const serialized = events.map((event) => this.serializeEvent(event));
    return {
      upcoming: serialized,
      stats: {
        nextThirtyDays: serialized.length,
        confirmed: serialized.filter((event) => event.status === CatererEventStatus.CONFIRMED).length,
        guests: serialized.reduce((sum, event) => sum + event.totalGuests, 0),
        productionToGenerate: serialized.filter((event) => event.productionState === 'NOT_GENERATED' || event.productionState === 'DIRTY').length,
      },
    };
  }

  async events(organizationId: string, query: any = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.catererEvent.findMany({
      where: {
        organizationId,
        status: query.status,
        clientId: query.clientId,
        startsAt: query.startDate || query.endDate ? {
          gte: query.startDate ? new Date(query.startDate) : undefined,
          lt: query.endDate ? new Date(query.endDate) : undefined,
        } : undefined,
        OR: query.search ? [
          { name: { contains: query.search, mode: 'insensitive' } },
          { reference: { contains: query.search, mode: 'insensitive' } },
          { client: { name: { contains: query.search, mode: 'insensitive' } } },
          { venueName: { contains: query.search, mode: 'insensitive' } },
        ] : undefined,
      },
      include: this.eventInclude(),
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
    }).then((items) => items.map((item) => this.serializeEvent(item)));
  }

  async getEvent(organizationId: string, id: string) {
    await this.assertInstalled(organizationId);
    const event = await this.prisma.catererEvent.findFirst({
      where: { id, organizationId },
      include: this.eventInclude(),
    });
    if (!event) throw new NotFoundException('Événement Traiteur introuvable.');
    return this.serializeEvent(event);
  }

  async upsertEvent(organizationId: string, actor: Actor, dto: any, id?: string) {
    await this.assertInstalled(organizationId);
    this.assertWrite(actor);
    const existing = id ? await this.prisma.catererEvent.findFirst({
      where: { id, organizationId },
      include: {
        prestations: {
          include: {
            menu: {
              include: {
                items: true,
                productionLinks: { include: { productionOrder: true } },
              },
            },
          },
        },
      },
    }) : null;
    if (id && !existing) throw new NotFoundException('Événement Traiteur introuvable.');
    if (existing && this.hasLockedProductionImpact(existing, dto)) {
      throw new BadRequestException(
        'La recette, les quantités, le site et les horaires ne peuvent plus être modifiés après validation ou démarrage d’une fabrication.',
      );
    }
    const client = dto.clientId ? await this.ensureClient(organizationId, dto.clientId) : null;
    if (dto.productionSiteId) await this.ensureSite(organizationId, dto.productionSiteId);
    for (const prestation of dto.prestations ?? []) {
      if (
        prestation.readyAt &&
        prestation.handoffAt &&
        prestation.serviceAt &&
        (new Date(prestation.readyAt) > new Date(prestation.handoffAt) ||
          new Date(prestation.handoffAt) > new Date(prestation.serviceAt))
      ) {
        throw new BadRequestException(
          `Respectez l’ordre prêt en cuisine, remise/livraison puis début de service pour « ${prestation.name} ».`,
        );
      }
      for (const item of prestation.items ?? []) await this.ensureMenuItemReference(organizationId, item);
    }
    if (existing) {
      const requestedPrestations = new Map(
        (dto.prestations ?? [])
          .filter((prestation: any) => prestation.id)
          .map((prestation: any) => [prestation.id, prestation]),
      );
      const ordersToCancel = new Map<string, any>();
      for (const prestation of existing.prestations) {
        const requested: any = requestedPrestations.get(prestation.id);
        const requestedItems = new Map(
          (requested?.items ?? [])
            .filter((item: any) => item.id)
            .map((item: any) => [item.id, item]),
        );
        for (const link of prestation.menu.productionLinks) {
          if (!link.productionOrder || link.productionOrder.status === 'CANCELLED') continue;
          const snapshot = link.snapshot as { lines?: Array<{ menuItemId?: string }> } | null;
          const impacted = !requested
            ? true
            : (snapshot?.lines ?? []).some((line) => {
                const currentItem = prestation.menu.items.find(
                  (item) => item.id === line.menuItemId,
                );
                const nextItem: any = line.menuItemId
                  ? requestedItems.get(line.menuItemId)
                  : undefined;
                return (
                  !currentItem ||
                  !nextItem ||
                  (currentItem.technicalSheetId ?? null) !==
                    (nextItem.technicalSheetId ?? null)
                );
              });
          if (impacted) ordersToCancel.set(link.productionOrder.id, link.productionOrder);
        }
      }
      if (ordersToCancel.size && !this.productionExecution) {
        throw new BadRequestException('Le moteur Production est indisponible.');
      }
      for (const order of ordersToCancel.values()) {
        await this.productionExecution!.cancelCampaign(
          organizationId,
          { ...actor, permissions: actor.permissions ?? [] },
          order.id,
          `Recette retirée ou remplacée dans l’événement ${existing.reference}`,
        );
      }
    }

    const eventId = await this.prisma.$transaction(async (tx) => {
      const eventData = {
        name: dto.name.trim(),
        clientId: client?.id ?? null,
        clientSnapshot: client ? this.clientSnapshot(client) : Prisma.JsonNull,
        productionSiteId: dto.productionSiteId || null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        venueName: dto.venueName?.trim() || null,
        address: dto.address?.trim() || null,
        accessNotes: dto.accessNotes?.trim() || null,
        fulfillmentMode: dto.fulfillmentMode,
        notes: dto.notes?.trim() || null,
        needsReview: false,
      };
      let event: any;
      if (existing) {
        event = await tx.catererEvent.update({ where: { id: existing.id }, data: eventData });
      } else {
        const year = new Date(dto.startsAt ?? Date.now()).getFullYear();
        const sequence = await tx.catererEventSequence.upsert({
          where: { organizationId_year: { organizationId, year } },
          create: { organizationId, year, value: 1 },
          update: { value: { increment: 1 } },
        });
        event = await tx.catererEvent.create({
          data: { organizationId, reference: `EVT-${year}-${String(sequence.value).padStart(4, '0')}`, ...eventData },
        });
      }

      const retainedIds = new Set<string>();
      for (const [position, prestation] of (dto.prestations ?? []).entries()) {
        const current = prestation.id
          ? existing?.prestations.find((item) => item.id === prestation.id)
          : undefined;
        if (prestation.id && !current) throw new BadRequestException('Prestation étrangère au dossier.');
        const date = prestation.serviceAt || prestation.handoffAt || prestation.readyAt || dto.startsAt;
        const menuData = {
          organizationId,
          name: prestation.name.trim(),
          date: date ? new Date(date) : null,
          service: prestation.service,
          kind: MenuKind.EVENT,
          activity: MenuActivity.CATERER,
          siteId: dto.productionSiteId || null,
          description: prestation.notes?.trim() || null,
          expectedGuests: Number(prestation.expectedGuests ?? 0),
          status: existing?.status === CatererEventStatus.CONFIRMED ? MenuStatus.VALIDATED : undefined,
          updatedById: actor.id,
          productionDirtySince: current?.menu.productionGeneratedAt ? new Date() : undefined,
        };
        let menuId: string;
        if (current) {
          menuId = current.menuId;
          await tx.menu.update({ where: { id: menuId }, data: menuData });
        } else {
          const menu = await tx.menu.create({ data: { ...menuData, createdById: actor.id } });
          menuId = menu.id;
        }
        const retainedItemIds = new Set<string>();
        for (const [itemPosition, item] of (prestation.items ?? []).entries()) {
          const currentItem = item.id
            ? current?.menu.items?.find((candidate: any) => candidate.id === item.id)
            : undefined;
          if (item.id && !currentItem) {
            throw new BadRequestException('Article étranger à cette prestation.');
          }
          const data = this.menuItemData(organizationId, menuId, item, itemPosition);
          const savedItem = currentItem
            ? await tx.menuItem.update({ where: { id: currentItem.id }, data })
            : await tx.menuItem.create({ data });
          retainedItemIds.add(savedItem.id);
        }
        if (current) {
          await tx.menuItem.deleteMany({
            where: retainedItemIds.size
              ? { menuId, id: { notIn: [...retainedItemIds] } }
              : { menuId },
          });
        }
        const prestationData = {
          organizationId,
          eventId: event.id,
          menuId,
          name: prestation.name.trim(),
          service: prestation.service,
          readyAt: prestation.readyAt ? new Date(prestation.readyAt) : null,
          handoffAt: prestation.handoffAt ? new Date(prestation.handoffAt) : null,
          serviceAt: prestation.serviceAt ? new Date(prestation.serviceAt) : null,
          expectedGuests: Number(prestation.expectedGuests ?? 0),
          position: prestation.position ?? position,
          notes: prestation.notes?.trim() || null,
        };
        const saved = current
          ? await tx.catererPrestation.update({ where: { id: current.id }, data: prestationData })
          : await tx.catererPrestation.create({ data: prestationData });
        retainedIds.add(saved.id);
      }

      if (existing) {
        const removed = existing.prestations.filter((item) => !retainedIds.has(item.id));
        if (removed.length) {
          await tx.catererPrestation.deleteMany({ where: { id: { in: removed.map((item) => item.id) } } });
          await tx.menu.deleteMany({ where: { id: { in: removed.map((item) => item.menuId) }, organizationId } });
        }
      }
      await tx.menuHistory.create({
        data: {
          organizationId,
          actorUserId: actor.id,
          action: existing ? 'UPDATED' : 'CREATED',
          summary: `${existing ? 'Modification' : 'Création'} de l’événement ${event.reference}`,
          details: { catererEventId: event.id },
        },
      });
      return event.id;
    });
    return this.getEvent(organizationId, eventId);
  }

  async readiness(organizationId: string, id: string, includeProductionProfiles = true) {
    const event = await this.getEvent(organizationId, id);
    const blockers: Array<{ code: string; message: string; prestationId?: string }> = [];
    if (!event.clientId && !event.needsReview) blockers.push({ code: 'CLIENT_REQUIRED', message: 'Sélectionnez un client.' });
    if (!event.productionSiteId) blockers.push({ code: 'PRODUCTION_SITE_REQUIRED', message: 'Sélectionnez le site de production.' });
    if (!event.startsAt) blockers.push({ code: 'EVENT_DATE_REQUIRED', message: 'Renseignez la date de l’événement.' });
    if ((event.fulfillmentMode === 'DELIVERY' || event.fulfillmentMode === 'ON_SITE') && !event.address)
      blockers.push({ code: 'ADDRESS_REQUIRED', message: 'Renseignez l’adresse de destination.' });
    if (!event.prestations.length) blockers.push({ code: 'PRESTATION_REQUIRED', message: 'Ajoutez au moins une prestation.' });

    for (const prestation of event.prestations) {
      if (!prestation.readyAt || !prestation.handoffAt || !prestation.serviceAt)
        blockers.push({ code: 'PRESTATION_TIMES_REQUIRED', message: `Complétez les horaires de « ${prestation.name} ».`, prestationId: prestation.id });
      else if (
        new Date(prestation.readyAt) > new Date(prestation.handoffAt) ||
        new Date(prestation.handoffAt) > new Date(prestation.serviceAt)
      )
        blockers.push({
          code: 'PRESTATION_TIMES_ORDER_INVALID',
          message: `Respectez l’ordre prêt en cuisine, remise/livraison puis début de service pour « ${prestation.name} ».`,
          prestationId: prestation.id,
        });
      if (Number(prestation.expectedGuests) <= 0)
        blockers.push({ code: 'GUESTS_REQUIRED', message: `Renseignez les convives de « ${prestation.name} ».`, prestationId: prestation.id });
      if (!prestation.menu.items?.length)
        blockers.push({ code: 'ITEMS_REQUIRED', message: `Composez la prestation « ${prestation.name} ».`, prestationId: prestation.id });
      if (includeProductionProfiles && event.productionSiteId) {
        for (const item of prestation.menu.items ?? []) {
          if (!item.technicalSheetId) continue;
          const profile = await this.prisma.productionProfile.findFirst({
            where: { organizationId, siteId: event.productionSiteId, technicalSheetId: item.technicalSheetId },
            select: { id: true },
          });
          if (!profile) blockers.push({
            code: 'PRODUCTION_PROFILE_REQUIRED',
            message: `Configurez le profil Production de « ${item.technicalSheet?.name ?? 'fiche technique'} ».`,
            prestationId: prestation.id,
          });
        }
      }
    }
    return { ready: blockers.length === 0, blockers, event };
  }

  async changeStatus(organizationId: string, actor: Actor, id: string, status: CatererEventStatus) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    const event = await this.prisma.catererEvent.findFirst({
      where: { id, organizationId },
      include: {
        prestations: {
          include: {
            menu: {
              include: {
                productionLinks: { include: { productionOrder: true } },
              },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Événement Traiteur introuvable.');
    if (status === CatererEventStatus.CONFIRMED) {
      const readiness = await this.readiness(organizationId, id, false);
      if (!readiness.ready) throw new BadRequestException({ message: 'Confirmation impossible.', blockers: readiness.blockers });
    }
    if (status === CatererEventStatus.CANCELLED) {
      if (!this.productionExecution) {
        throw new BadRequestException('Le moteur Production est indisponible.');
      }
      const activeOrders = [
        ...new Map(
          event.prestations
            .flatMap((prestation) => prestation.menu.productionLinks)
            .filter((link) => link.productionOrder?.status !== 'CANCELLED')
            .map((link) => [link.productionOrderId, link.productionOrder] as const),
        ).values(),
      ];
      if (
        activeOrders.some((order) =>
          ['IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED'].includes(order.status),
        )
      ) {
        throw new BadRequestException(
          'Annulation impossible : une fabrication de cet événement a déjà commencé.',
        );
      }
      const logisticsTasks = await this.prisma.operationalTask.findMany({
        where: { organizationId, sourceKey: { startsWith: `CATERER:${id}:` } },
      });
      if (
        logisticsTasks.some((task) =>
          ['IN_PROGRESS', 'COMPLETED'].includes(task.status),
        )
      ) {
        throw new BadRequestException(
          'Annulation impossible : une tâche logistique de cet événement a déjà commencé.',
        );
      }
      for (const order of activeOrders) {
        await this.productionExecution.cancelCampaign(
          organizationId,
          { ...actor, permissions: actor.permissions ?? [] },
          order.id,
          `Annulation de l’événement ${event.reference}`,
        );
      }
      await this.prisma.operationalTask.updateMany({
        where: {
          organizationId,
          sourceKey: { startsWith: `CATERER:${id}:` },
          status: 'TODO',
        },
        data: { status: 'CANCELLED', completedAt: null },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.catererEvent.update({ where: { id }, data: { status } });
      if (status === CatererEventStatus.CONFIRMED) {
        await tx.menu.updateMany({ where: { id: { in: event.prestations.map((item) => item.menuId) } }, data: { status: MenuStatus.VALIDATED } });
      }
      await tx.menuHistory.create({
        data: {
          organizationId,
          actorUserId: actor.id,
          action: status === CatererEventStatus.CONFIRMED ? 'VALIDATED' : 'UPDATED',
          summary: `Événement ${event.reference} : ${status}`,
          details: { catererEventId: id, status },
        },
      });
    });
    return this.getEvent(organizationId, id);
  }

  async productionPlan(organizationId: string, id: string) {
    const event = await this.getEvent(organizationId, id);
    const lines = event.prestations.flatMap((prestation: any) =>
      (prestation.menu.items ?? [])
        .filter((item: any) => item.technicalSheetId && item.technicalSheet)
        .map((item: any) => {
          const activeLink = (prestation.menu.productionLinks ?? []).find((link: any) => {
            if (link.productionOrder?.status === 'CANCELLED') return false;
            const snapshotLines = Array.isArray(link.snapshot?.lines) ? link.snapshot.lines : [];
            return snapshotLines.some((line: any) => line?.menuItemId === item.id);
          });
          const productionOrder = activeLink?.productionOrder ?? null;
          const readyAt = prestation.readyAt ?? prestation.handoffAt ?? prestation.serviceAt;
          return {
            menuItemId: item.id,
            prestationId: prestation.id,
            prestationName: prestation.name,
            menuId: prestation.menuId,
            technicalSheetId: item.technicalSheetId,
            technicalSheetName: item.technicalSheet.name,
            section: item.section,
            portions: Number(
              productionOrder?.plannedPortions ??
                item.portionsOverride ??
                Number(prestation.expectedGuests ?? 0) * Number(item.servingQuantity ?? 1),
            ),
            readyAt,
            productionDate: new Date(
              productionOrder?.productionDate ?? readyAt,
            ).toISOString(),
            plannedTime: productionOrder?.plannedTime ?? '08:00',
            serviceId: productionOrder?.serviceId ?? null,
            productionOrderId: productionOrder?.id ?? null,
            productionOrderStatus: productionOrder?.status ?? null,
            editable:
              !productionOrder ||
              ['DRAFT', 'PROPOSED', 'PLANNED', 'BLOCKED'].includes(productionOrder.status),
          };
        }),
    );
    const stockProducts = event.prestations.flatMap((prestation: any) =>
      (prestation.menu.items ?? [])
        .filter((item: any) => item.productId)
        .map((item: any) => ({
          menuItemId: item.id,
          prestationId: prestation.id,
          prestationName: prestation.name,
          productId: item.productId,
          productName: item.product?.name ?? 'Produit Stocks',
          quantity: Number(
            item.portionsOverride ??
              Number(prestation.expectedGuests ?? 0) * Number(item.servingQuantity ?? 1),
          ),
        })),
    );
    const logistics: any[] = this.logisticsProposals(event);
    const sourceKeys: string[] = logistics.map((proposal: any) => proposal.key);
    const existingTasks = sourceKeys.length
      ? await this.prisma.operationalTask.findMany({
          where: { organizationId, sourceKey: { in: sourceKeys } },
          include: {
            department: true,
            assignments: {
              include: { employee: true, planningAssignment: true },
              orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
            },
          },
        })
      : [];
    const taskByKey = new Map(
      existingTasks
        .filter((task) => Boolean(task.sourceKey))
        .map((task) => [task.sourceKey as string, task] as const),
    );
    return {
      event,
      lines,
      stockProducts,
      logistics: logistics.map((proposal: any) => ({
        ...proposal,
        task: taskByKey.get(proposal.key) ?? null,
        enabled: taskByKey.get(proposal.key)?.status !== 'CANCELLED',
      })),
      focusDate:
        lines
          .map((line: any) => line.productionDate)
          .filter(Boolean)
          .sort()[0] ??
        event.prestations.map((prestation: any) => prestation.readyAt).filter(Boolean).sort()[0] ??
        event.startsAt,
    };
  }

  async saveProductionPlan(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: {
      serviceId: string;
      logisticsDepartmentId?: string;
      lines: Array<{
        menuItemId: string;
        portions: number;
        productionDate: string;
        plannedTime: string;
      }>;
      logistics?: Array<{
        key: string;
        enabled: boolean;
        startsAt: string;
        endsAt: string;
      }>;
    },
  ) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    if (!this.productionExecution) {
      throw new BadRequestException('Le moteur Production est indisponible.');
    }
    const plan = await this.productionPlan(organizationId, id);
    if (plan.event.status !== CatererEventStatus.CONFIRMED) {
      throw new BadRequestException('L’événement doit être confirmé avant sa planification.');
    }
    const service = await this.prisma.hrDepartment.findFirst({
      where: { id: dto.serviceId, organizationId, isArchived: false },
      include: {
        positions: {
          where: { isArchived: false },
          include: { department: { select: { name: true } } },
        },
      },
    });
    if (!service) throw new BadRequestException('Le service cuisine est introuvable.');
    if (
      Array.isArray(service.positions) &&
      !service.positions.some((position) =>
        positionSupportsTechnicalSheets(
          position.name,
          position.department?.name ?? service.name,
        ),
      )
    ) {
      throw new BadRequestException(
        'Le service responsable doit comporter au moins un métier autorisé à réaliser une fiche technique.',
      );
    }

    const expectedLines = new Map<string, any>(
      plan.lines.map((line: any) => [line.menuItemId, line]),
    );
    const submittedLines = new Map(dto.lines.map((line) => [line.menuItemId, line]));
    if (
      submittedLines.size !== dto.lines.length ||
      submittedLines.size !== expectedLines.size ||
      [...expectedLines.keys()].some((menuItemId) => !submittedLines.has(menuItemId))
    ) {
      throw new BadRequestException(
        'Toutes les recettes de l’événement doivent être planifiées une seule fois.',
      );
    }

    const createdOrderIds: string[] = [];
    const updatedOrderIds: string[] = [];
    for (const submitted of dto.lines) {
      const source: any = expectedLines.get(submitted.menuItemId);
      if (!source) throw new BadRequestException('Recette étrangère à cet événement.');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(submitted.plannedTime)) {
        throw new BadRequestException(`Horaire invalide pour « ${source.technicalSheetName} ».`);
      }
      const productionAt = new Date(
        `${submitted.productionDate.slice(0, 10)}T${submitted.plannedTime}:00`,
      );
      const readyAt = new Date(source.readyAt);
      if (
        Number.isNaN(productionAt.getTime()) ||
        Number.isNaN(readyAt.getTime()) ||
        productionAt > readyAt
      ) {
        throw new BadRequestException(
          `La fabrication de « ${source.technicalSheetName} » doit être planifiée avant l’heure de mise à disposition.`,
        );
      }
      if (!Number.isFinite(Number(submitted.portions)) || Number(submitted.portions) <= 0) {
        throw new BadRequestException(
          `La quantité de « ${source.technicalSheetName} » doit être supérieure à zéro.`,
        );
      }
      if (source.productionOrderId) {
        if (!source.editable) {
          const unchanged =
            Math.abs(Number(source.portions) - Number(submitted.portions)) < 0.0005 &&
            String(source.productionDate).slice(0, 10) ===
              submitted.productionDate.slice(0, 10) &&
            source.plannedTime === submitted.plannedTime &&
            source.serviceId === dto.serviceId;
          if (!unchanged) {
            throw new BadRequestException(
              `La fabrication de « ${source.technicalSheetName} » est validée ou en cours et ne peut plus être modifiée.`,
            );
          }
          continue;
        }
        const updated = await this.productionExecution.rescheduleCampaign(
          organizationId,
          { ...actor, permissions: actor.permissions ?? [] },
          source.productionOrderId,
          {
            grossRequirement: new Prisma.Decimal(submitted.portions).toFixed(3),
            targetPortions: new Prisma.Decimal(submitted.portions).toFixed(3),
            productionDate: productionAt.toISOString(),
            plannedTime: submitted.plannedTime,
            serviceId: dto.serviceId,
          },
        );
        await this.prisma.productionNeed.updateMany({
          where: {
            organizationId,
            allocations: { some: { orderId: source.productionOrderId } },
          },
          data: { neededAt: readyAt },
        });
        updatedOrderIds.push(updated.id);
      } else {
        const generated = await this.menus.generateProductions(
          organizationId,
          actor,
          source.menuId,
          {
            mode: MenuProductionGenerationMode.DETAILED,
            serviceId: dto.serviceId,
            neededAt: readyAt.toISOString(),
            lines: [
              {
                menuItemId: submitted.menuItemId,
                portions: Number(submitted.portions),
                targetPortions: Number(submitted.portions),
                productionDate: productionAt.toISOString(),
                plannedTime: submitted.plannedTime,
              },
            ],
          },
        );
        createdOrderIds.push(...generated.orders.map((order: any) => order.id));
      }
    }

    const activeSubmittedItemIds = new Set(dto.lines.map((line) => line.menuItemId));
    const staleLinks = plan.event.prestations.flatMap((prestation: any) =>
      (prestation.menu.productionLinks ?? []).filter((link: any) => {
        if (link.productionOrder?.status === 'CANCELLED') return false;
        const lines = Array.isArray(link.snapshot?.lines) ? link.snapshot.lines : [];
        return lines.some(
          (line: any) => line?.menuItemId && !activeSubmittedItemIds.has(line.menuItemId),
        );
      }),
    );
    const cancelledOrderIds: string[] = [];
    for (const link of staleLinks) {
      await this.productionExecution.cancelCampaign(
        organizationId,
        { ...actor, permissions: actor.permissions ?? [] },
        link.productionOrderId,
        `Recette retirée du plan Traiteur ${plan.event.reference}`,
      );
      cancelledOrderIds.push(link.productionOrderId);
    }

    const logisticsResult = await this.saveLogisticsPlan(
      organizationId,
      actor,
      plan,
      dto.logisticsDepartmentId,
      dto.logistics ?? [],
    );
    await this.decorateEventProductionLinks(organizationId, id);
    await this.catererLifecycle?.evaluateEvent(organizationId, id);
    const refreshed = await this.productionPlan(organizationId, id);
    return {
      ...refreshed,
      createdOrderIds,
      updatedOrderIds,
      cancelledOrderIds,
      logisticsTaskIds: logisticsResult,
    };
  }

  async generateProductions(organizationId: string, actor: Actor, id: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    if (this.productionExecution) {
      const plan = await this.productionPlan(organizationId, id);
      const departments = await this.prisma.hrDepartment.findMany({
        where: { organizationId, isArchived: false },
        include: {
          positions: {
            where: { isArchived: false },
            select: { name: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      const productionDepartments = departments.filter((department) =>
        department.positions.some((position) =>
          positionSupportsTechnicalSheets(position.name, department.name),
        ),
      );
      const existingServiceId = plan.lines.find(
        (line: any) =>
          line.serviceId &&
          productionDepartments.some((department) => department.id === line.serviceId),
      )?.serviceId;
      const serviceId =
        dto.serviceId ??
        existingServiceId ??
        productionDepartments.find((department) =>
          /cuisine|pâtisserie|patisserie|production/i.test(department.name),
        )?.id ??
        productionDepartments[0]?.id;
      if (!serviceId) {
        throw new BadRequestException(
          'Créez ou choisissez un service cuisine avant de planifier les fabrications.',
        );
      }
      const result = await this.saveProductionPlan(organizationId, actor, id, {
        serviceId,
        lines: plan.lines.map((line: any) => ({
          menuItemId: line.menuItemId,
          portions: line.portions,
          productionDate: line.productionDate,
          plannedTime: line.plannedTime,
        })),
        logistics: plan.logistics.map((line: any) => ({
          key: line.key,
          enabled: false,
          startsAt: line.startsAt,
          endsAt: line.endsAt,
        })),
      });
      return {
        ...result,
        created: result.createdOrderIds.length,
        generated: result.createdOrderIds,
        skipped: [],
      };
    }
    const readiness = await this.readiness(organizationId, id, true);
    if (readiness.event.status !== CatererEventStatus.CONFIRMED)
      throw new BadRequestException('L’événement doit être confirmé.');
    if (!readiness.ready) throw new BadRequestException({ message: 'Génération impossible.', blockers: readiness.blockers });
    const generated = [];
    const skipped = [];
    for (const prestation of readiness.event.prestations) {
      if (prestation.menu.productionGeneratedAt && !prestation.menu.productionDirtySince) {
        skipped.push({ prestationId: prestation.id, reason: 'Production déjà à jour' });
        continue;
      }
      const result = await this.menus.generateProductions(organizationId, actor, prestation.menuId, {
        mode: dto.mode ?? MenuProductionGenerationMode.GROUPED,
        force: Boolean(dto.force || prestation.menu.productionDirtySince),
        plannedTime: this.timePart(prestation.readyAt) ?? '08:00',
      });
      generated.push({ prestationId: prestation.id, ...result });
    }
    return { generated, skipped, created: generated.reduce((sum, result: any) => sum + Number(result.created ?? result.orders?.length ?? 0), 0) };
  }

  async document(organizationId: string, actor: Actor, id: string, kind: string) {
    await this.assertInstalled(organizationId);
    const event = await this.getEvent(organizationId, id);
    const allowed = ['KITCHEN', 'HANDOFF', 'CLIENT'];
    if (!allowed.includes(kind)) throw new BadRequestException('Type de document Traiteur inconnu.');
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoDataUrl: true },
    });
    const buffer = await this.renderPdf(event, kind, organization);
    await this.prisma.menuHistory.create({
      data: {
        organizationId,
        actorUserId: actor.id,
        action: 'EXPORT_GENERATED',
        summary: `Document ${kind} de l’événement ${event.reference}`,
        details: { catererEventId: id, kind },
      },
    });
    return { buffer, filename: `${event.reference}-${kind.toLowerCase()}.pdf`, mimeType: 'application/pdf' };
  }

  private logisticsProposals(event: any) {
    return event.prestations.flatMap((prestation: any) => {
      if (!prestation.readyAt || !prestation.handoffAt || !prestation.serviceAt) return [];
      const common = {
        prestationId: prestation.id,
        prestationName: prestation.name,
        menuId: prestation.menuId,
      };
      const proposals: any[] = [
        {
          ...common,
          key: `CATERER:${event.id}:${prestation.id}:PACKING`,
          title: `Conditionnement & chargement · ${prestation.name}`,
          description: `${event.reference} · ${event.name} · contrôle, conditionnement et préparation de la remise.`,
          startsAt: prestation.readyAt,
          endsAt: prestation.handoffAt,
          category: 'LOGISTICS',
        },
      ];
      if (event.fulfillmentMode === 'PICKUP') {
        const handoff = new Date(prestation.handoffAt);
        const pickupStart = new Date(
          Math.max(
            new Date(prestation.readyAt).getTime(),
            handoff.getTime() - 30 * 60_000,
          ),
        );
        proposals.push({
          ...common,
          key: `CATERER:${event.id}:${prestation.id}:HANDOFF`,
          title: `Remise au client · ${prestation.name}`,
          description: `${event.reference} · remise au client sur le site de production.`,
          startsAt: pickupStart.toISOString(),
          endsAt: prestation.handoffAt,
          category: 'LOGISTICS',
        });
      } else {
        proposals.push({
          ...common,
          key: `CATERER:${event.id}:${prestation.id}:HANDOFF`,
          title:
            event.fulfillmentMode === 'ON_SITE'
              ? `Installation sur site · ${prestation.name}`
              : `Livraison & installation · ${prestation.name}`,
          description: `${event.reference} · ${event.address ?? event.venueName ?? 'destination à confirmer'}.`,
          startsAt: prestation.handoffAt,
          endsAt: prestation.serviceAt,
          category: 'LOGISTICS',
        });
      }
      return proposals.filter(
        (proposal) => new Date(proposal.startsAt) < new Date(proposal.endsAt),
      );
    });
  }

  private async saveLogisticsPlan(
    organizationId: string,
    actor: Actor,
    plan: any,
    logisticsDepartmentId: string | undefined,
    submitted: Array<{ key: string; enabled: boolean; startsAt: string; endsAt: string }>,
  ) {
    const proposals = new Map(plan.logistics.map((proposal: any) => [proposal.key, proposal]));
    if (submitted.some((line) => !proposals.has(line.key))) {
      throw new BadRequestException('Une tâche logistique est étrangère à cet événement.');
    }
    if (submitted.some((line) => line.enabled)) {
      if (!logisticsDepartmentId) {
        throw new BadRequestException(
          'Choisissez le service responsable des tâches logistiques.',
        );
      }
      const department = await this.prisma.hrDepartment.findFirst({
        where: { id: logisticsDepartmentId, organizationId, isArchived: false },
      });
      if (!department) throw new BadRequestException('Le service logistique est introuvable.');
    }
    const taskIds: string[] = [];
    for (const line of submitted) {
      const proposal: any = proposals.get(line.key);
      const startsAt = new Date(line.startsAt);
      const endsAt = new Date(line.endsAt);
      if (
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        startsAt >= endsAt
      ) {
        throw new BadRequestException(`Créneau invalide pour « ${proposal.title} ».`);
      }
      const existing = await this.prisma.operationalTask.findUnique({
        where: {
          organizationId_sourceKey: {
            organizationId,
            sourceKey: line.key,
          },
        },
      });
      if (
        existing &&
        ['IN_PROGRESS', 'COMPLETED'].includes(existing.status) &&
        (!line.enabled ||
          existing.startsAt.getTime() !== startsAt.getTime() ||
          existing.endsAt.getTime() !== endsAt.getTime())
      ) {
        throw new BadRequestException(
          `La tâche « ${proposal.title} » a déjà commencé et ne peut plus être replanifiée.`,
        );
      }
      if (!line.enabled) {
        if (existing && existing.status === 'TODO') {
          await this.prisma.operationalTask.update({
            where: { id: existing.id },
            data: { status: 'CANCELLED', completedAt: null },
          });
        }
        continue;
      }
      const task = await this.prisma.operationalTask.upsert({
        where: {
          organizationId_sourceKey: {
            organizationId,
            sourceKey: line.key,
          },
        },
        create: {
          organizationId,
          sourceKey: line.key,
          title: proposal.title,
          description: proposal.description,
          category: 'LOGISTICS',
          status: 'TODO',
          source: 'MENU',
          departmentId: logisticsDepartmentId!,
          siteId: plan.event.productionSiteId,
          menuId: proposal.menuId,
          startsAt,
          endsAt,
          isTimeScheduled: false,
          createdById: actor.id,
        },
        update: {
          title: proposal.title,
          description: proposal.description,
          category: 'LOGISTICS',
          status: existing?.status === 'CANCELLED' ? 'TODO' : undefined,
          departmentId: logisticsDepartmentId!,
          siteId: plan.event.productionSiteId,
          menuId: proposal.menuId,
          startsAt,
          endsAt,
          isTimeScheduled:
            existing?.startsAt.getTime() === startsAt.getTime() &&
            existing?.endsAt.getTime() === endsAt.getTime()
              ? existing.isTimeScheduled
              : false,
        },
      });
      taskIds.push(task.id);
    }
    return taskIds;
  }

  private async decorateEventProductionLinks(organizationId: string, eventId: string) {
    const event = await this.prisma.catererEvent.findFirst({
      where: { id: eventId, organizationId },
      include: {
        prestations: {
          include: {
            menu: { include: { productionLinks: true } },
          },
        },
      },
    });
    if (!event) return;
    for (const prestation of event.prestations) {
      for (const link of prestation.menu.productionLinks) {
        const snapshot =
          link.snapshot && typeof link.snapshot === 'object' && !Array.isArray(link.snapshot)
            ? (link.snapshot as Record<string, any>)
            : {};
        await this.prisma.menuProductionLink.update({
          where: { id: link.id },
          data: {
            snapshot: {
              ...snapshot,
              catererEventId: eventId,
              catererPrestationId: prestation.id,
              catererReference: event.reference,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  private hasLockedProductionImpact(existing: any, dto: any) {
    const locked = existing.prestations.some((prestation: any) =>
      prestation.menu.productionLinks.some(
        (link: any) =>
          link.productionOrder &&
          ['VALIDATED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED'].includes(
            link.productionOrder.status,
          ),
      ),
    );
    if (!locked) return false;
    const current = {
      siteId: existing.productionSiteId ?? null,
      prestations: existing.prestations
        .map((prestation: any) => ({
          id: prestation.id,
          readyAt: prestation.readyAt?.toISOString() ?? null,
          handoffAt: prestation.handoffAt?.toISOString() ?? null,
          serviceAt: prestation.serviceAt?.toISOString() ?? null,
          expectedGuests: Number(prestation.expectedGuests),
          items: prestation.menu.items
            .map((item: any) => ({
              id: item.id,
              technicalSheetId: item.technicalSheetId ?? null,
              productId: item.productId ?? null,
              portionsOverride:
                item.portionsOverride == null ? null : Number(item.portionsOverride),
              servingQuantity: Number(item.servingQuantity ?? 1),
            }))
            .sort((left: any, right: any) => left.id.localeCompare(right.id)),
        }))
        .sort((left: any, right: any) => left.id.localeCompare(right.id)),
    };
    const requested = {
      siteId: dto.productionSiteId || null,
      prestations: (dto.prestations ?? [])
        .map((prestation: any) => ({
          id: prestation.id ?? null,
          readyAt: prestation.readyAt ? new Date(prestation.readyAt).toISOString() : null,
          handoffAt: prestation.handoffAt ? new Date(prestation.handoffAt).toISOString() : null,
          serviceAt: prestation.serviceAt ? new Date(prestation.serviceAt).toISOString() : null,
          expectedGuests: Number(prestation.expectedGuests),
          items: (prestation.items ?? [])
            .map((item: any) => ({
              id: item.id ?? null,
              technicalSheetId: item.technicalSheetId ?? null,
              productId: item.productId ?? null,
              portionsOverride:
                item.portionsOverride == null ? null : Number(item.portionsOverride),
              servingQuantity: Number(item.servingQuantity ?? 1),
            }))
            .sort((left: any, right: any) =>
              String(left.id).localeCompare(String(right.id)),
            ),
        }))
        .sort((left: any, right: any) =>
          String(left.id).localeCompare(String(right.id)),
        ),
    };
    return JSON.stringify(current) !== JSON.stringify(requested);
  }

  private eventInclude(): any {
    return {
      client: true,
      productionSite: true,
      prestations: {
        include: {
          menu: {
            include: {
              site: true,
              items: {
                include: {
                  menuCategory: true,
                  product: { include: { unit: true } },
                  technicalSheet: { include: { outputProduct: true, ingredients: { include: { allergens: { include: { allergen: true } } } } } },
                },
                orderBy: [{ section: 'asc' }, { position: 'asc' }],
              },
              productionLinks: { include: { productionOrder: true } },
            },
          },
        },
        orderBy: [{ position: 'asc' }, { serviceAt: 'asc' }],
      },
    };
  }

  private serializeEvent(event: any) {
    const prestations = (event.prestations ?? []).map((prestation: any) => ({
      ...prestation,
      menu: {
        ...prestation.menu,
        items: (prestation.menu?.items ?? []).map((item: any) => ({
          ...item,
          sourceType: item.productId ? 'PRODUCT' : 'TECHNICAL_SHEET',
          portionsOverride: item.portionsOverride == null ? null : Number(item.portionsOverride),
          servingQuantity: Number(item.servingQuantity ?? 1),
        })),
      },
    }));
    const menus = prestations.map((item: any) => item.menu);
    const productionState = menus.some((menu: any) => menu.productionDirtySince)
      ? 'DIRTY'
      : menus.length && menus.every((menu: any) => menu.productionGeneratedAt)
        ? this.productionState(menus)
        : 'NOT_GENERATED';
    return {
      ...event,
      prestations,
      totalGuests: prestations.reduce((sum: number, item: any) => sum + Number(item.expectedGuests ?? 0), 0),
      productionState,
    };
  }

  private productionState(menus: any[]) {
    const statuses = menus.flatMap((menu: any) => menu.productionLinks?.map((link: any) => link.productionOrder?.status).filter(Boolean) ?? []);
    if (statuses.length && statuses.every((status) => ['COMPLETED', 'CLOSED'].includes(status))) return 'COMPLETED';
    if (statuses.some((status) => ['IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(status))) return 'IN_PROGRESS';
    return 'PLANNED';
  }

  private clientSnapshot(client: any) {
    return { id: client.id, name: client.name, contactName: client.contactName, email: client.email, phone: client.phone, address: client.address };
  }

  private menuItemData(organizationId: string, menuId: string, item: any, position: number) {
    return {
      organizationId,
      menuId,
      section: item.section ?? 'OTHER',
      menuCategoryId: item.menuCategoryId || null,
      technicalSheetId: item.technicalSheetId || null,
      productId: item.productId || null,
      position: item.position ?? position,
      portionsOverride: item.portionsOverride == null ? null : new Prisma.Decimal(item.portionsOverride),
      servingQuantity: new Prisma.Decimal(item.servingQuantity ?? 1),
      targetReadyQuantity: null,
      lowStockThreshold: null,
      availabilityEnabled: item.availabilityEnabled ?? true,
      notes: item.notes || null,
    };
  }

  private async ensureMenuItemReference(organizationId: string, item: any) {
    const count = Number(Boolean(item.technicalSheetId)) + Number(Boolean(item.productId));
    if (count !== 1) throw new BadRequestException('Chaque article doit utiliser une fiche technique ou un produit Stocks.');
    if (item.technicalSheetId) {
      const sheet = await this.prisma.technicalSheet.findFirst({ where: { id: item.technicalSheetId, organizationId, status: 'ACTIVE', isArchived: false } });
      if (!sheet) throw new NotFoundException('Fiche technique active introuvable.');
      if (!sheet.outputProductId) throw new BadRequestException(`La fiche « ${sheet.name} » doit avoir un produit fini.`);
    }
    if (item.productId) {
      const product = await this.prisma.product.findFirst({ where: { id: item.productId, organizationId, isArchived: false } });
      if (!product) throw new NotFoundException('Produit Stocks actif introuvable.');
    }
  }

  private async ensureClient(organizationId: string, id: string) {
    const client = await this.prisma.catererClient.findFirst({ where: { id, organizationId, isArchived: false } });
    if (!client) throw new NotFoundException('Client Traiteur actif introuvable.');
    return client;
  }

  private async ensureSite(organizationId: string, id: string) {
    const site = await this.prisma.site.findFirst({ where: { id, organizationId, isArchived: false } });
    if (!site) throw new NotFoundException('Site actif introuvable.');
    return site;
  }

  private async assertInstalled(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { menusInstalledAt: true } });
    if (!organization?.menusInstalledAt) throw new BadRequestException('Le module Menus n’est pas installé.');
  }

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Droits Traiteur insuffisants.');
  }

  private assertManager(actor: Actor) {
    if (!MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Action réservée aux managers Traiteur.');
  }

  private timePart(value?: string | Date | null) {
    if (!value) return undefined;
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private renderPdf(event: any, kind: string, organization?: { name: string; logoDataUrl?: string | null } | null) {
    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
        info: {
          Title: `${kind === 'KITCHEN' ? 'Dossier cuisine' : kind === 'HANDOFF' ? 'Feuille de chargement' : 'Menu'} — ${event.reference}`,
          Author: organization?.name ?? 'ToqueHub',
        },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      if (kind === 'CLIENT') this.drawClientDocument(document, event, organization);
      else this.drawOperationalDocument(document, event, kind, organization);

      const range = document.bufferedPageRange();
      for (let page = range.start; page < range.start + range.count; page += 1) {
        document.switchToPage(page);
        document.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
          .text(
            kind === 'CLIENT'
              ? `${organization?.name ?? 'Traiteur'} · ${event.reference} · ${page + 1}/${range.count}`
              : `${event.reference} · Document opérationnel · Généré le ${new Date().toLocaleDateString('fr-FR')} · ${page + 1}/${range.count}`,
            42,
            808,
            { width: 511, align: 'center' },
          );
      }
      document.end();
    });
  }

  private drawOperationalDocument(document: PDFKit.PDFDocument, event: any, kind: string, organization?: any) {
    const title = kind === 'KITCHEN' ? 'DOSSIER CUISINE' : 'CHARGEMENT & REMISE';
    let y = this.drawCatererHeader(document, organization, title, event.reference, false);
    const eventName = this.pdfDisplayName(event.name);
    document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(19).text(eventName, 42, y, { width: 511 });
    y += document.heightOfString(eventName, { width: 511 }) + 13;

    const totalGuests = (event.prestations ?? []).reduce((sum: number, prestation: any) => sum + Number(prestation.expectedGuests ?? 0), 0);
    const metrics = [
      ['DATE', this.dayLabel(event.startsAt)],
      ['CLIENT', this.pdfDisplayName(event.clientSnapshot?.name ?? event.client?.name ?? 'À renseigner')],
      ['FORMAT', this.fulfillmentLabel(event.fulfillmentMode)],
      ['VOLUME', `${totalGuests} couverts · ${event.prestations?.length ?? 0} prestation${event.prestations?.length === 1 ? '' : 's'}`],
    ];
    metrics.forEach(([label, value], index) => this.drawInfoCard(document, 42 + index * 130, y, 121, label, value));
    y += 68;

    y = this.ensureCatererSpace(document, y, 95, organization, title, event.reference);
    this.drawSectionTitle(document, 'LOGISTIQUE', y);
    y += 23;
    const logistics = [
      ['Lieu', event.venueName ?? 'À renseigner'],
      ['Adresse', event.address ?? 'À renseigner'],
      ['Site de production', event.productionSite?.name ?? 'À renseigner'],
      ['Accès / consignes', event.accessNotes ?? 'Aucune consigne particulière'],
    ];
    y = this.drawDefinitionBlock(document, logistics, y);

    for (const [index, prestation] of (event.prestations ?? []).entries()) {
      const estimatedHeight = 102 + (prestation.menu?.items?.length ?? 0) * (kind === 'KITCHEN' ? 34 : 28);
      y = this.ensureCatererSpace(document, y + 14, Math.min(estimatedHeight, 280), organization, title, event.reference);
      document.roundedRect(42, y, 511, 38, 7).fill('#0f766e');
      document.fillColor('#ccfbf1').font('Helvetica-Bold').fontSize(8).text(`PRESTATION ${index + 1}`, 54, y + 8);
      document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(prestation.name, 54, y + 19, { width: 310 });
      document.font('Helvetica-Bold').fontSize(10).text(`${prestation.expectedGuests} couverts`, 426, y + 14, { width: 112, align: 'right' });
      y += 48;

      const times = kind === 'KITCHEN'
        ? [['FIN DE PRÉPARATION', this.hourLabel(prestation.readyAt)], ['REMISE', this.hourLabel(prestation.handoffAt)], ['SERVICE', this.hourLabel(prestation.serviceAt)]]
        : [['PRÊT À', this.hourLabel(prestation.readyAt)], ['DÉPART / REMISE', this.hourLabel(prestation.handoffAt)], ['SERVICE', this.hourLabel(prestation.serviceAt)]];
      times.forEach(([label, value], timeIndex) => {
        const x = 42 + timeIndex * 170;
        document.fillColor('#64748b').font('Helvetica-Bold').fontSize(7).text(label, x, y);
        document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(value, x, y + 11);
      });
      y += 34;

      document.rect(42, y, 511, 22).fill('#e2e8f0');
      document.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5).text(kind === 'KITCHEN' ? 'COMPOSITION À PRODUIRE' : 'À CHARGER / REMETTRE', 54, y + 7);
      document.text('QUANTITÉ', 413, y + 7, { width: 72, align: 'right' });
      document.text('OK', 508, y + 7, { width: 28, align: 'center' });
      y += 22;

      for (const item of prestation.menu?.items ?? []) {
        y = this.ensureCatererSpace(document, y, 38, organization, title, event.reference);
        const name = this.pdfDisplayName(item.technicalSheet?.name ?? item.product?.name ?? 'Article');
        const quantity = item.portionsOverride == null
          ? Number(prestation.expectedGuests) * Number(item.servingQuantity ?? 1)
          : Number(item.portionsOverride);
        const unit = item.product?.unit?.symbol ?? item.technicalSheet?.outputProduct?.unit?.symbol ?? 'portions';
        const allergens = this.catererAllergens(item);
        const rowHeight = kind === 'KITCHEN' && allergens.length ? 38 : 29;
        document.rect(42, y, 511, rowHeight).fillAndStroke(index % 2 ? '#ffffff' : '#f8fafc', '#e2e8f0');
        document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(name, 54, y + 7, { width: 330 });
        if (kind === 'KITCHEN' && allergens.length) {
          document.fillColor('#b45309').font('Helvetica').fontSize(7.5).text(`Allergènes : ${allergens.join(', ')}`, 54, y + 22, { width: 330 });
        }
        document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(
          `${this.quantityLabel(quantity)} ${unit}`,
          400,
          y + 8,
          { width: 85, align: 'right' },
        );
        document.rect(514, y + 8, 12, 12).stroke('#64748b');
        y += rowHeight;
      }

      if (prestation.notes) {
        y = this.ensureCatererSpace(document, y + 5, 35, organization, title, event.reference);
        document.fillColor('#475569').font('Helvetica-Oblique').fontSize(8.5)
          .text(`Consigne : ${prestation.notes}`, 54, y, { width: 487 });
        y += document.heightOfString(`Consigne : ${prestation.notes}`, { width: 487 }) + 6;
      }
    }

    y = this.ensureCatererSpace(document, y + 16, 96, organization, title, event.reference);
    if (kind === 'KITCHEN') {
      this.drawSectionTitle(document, 'CONTRÔLES AVANT DÉPART', y);
      y += 24;
      ['Quantités et conditionnement contrôlés', 'Étiquetage et allergènes contrôlés', 'Températures relevées', 'Matériel et consommables préparés']
        .forEach((label, index) => this.drawChecklistLine(document, label, 42 + (index % 2) * 255, y + Math.floor(index / 2) * 25, 245));
      y += 58;
    } else {
      this.drawSectionTitle(document, 'VALIDATION DE LA REMISE', y);
      y += 28;
      document.fillColor('#475569').font('Helvetica').fontSize(8).text('Préparé par', 42, y);
      document.text('Transporteur / responsable', 218, y);
      document.text('Réceptionnaire', 394, y);
      document.moveTo(42, y + 35).lineTo(195, y + 35).stroke('#94a3b8');
      document.moveTo(218, y + 35).lineTo(371, y + 35).stroke('#94a3b8');
      document.moveTo(394, y + 35).lineTo(553, y + 35).stroke('#94a3b8');
      y += 55;
    }
    if (event.notes) {
      y = this.ensureCatererSpace(document, y + 8, 55, organization, title, event.reference);
      document.roundedRect(42, y, 511, 48, 6).fill('#fff7ed');
      document.fillColor('#9a3412').font('Helvetica-Bold').fontSize(7.5).text('NOTE DOSSIER', 54, y + 9);
      document.fillColor('#431407').font('Helvetica').fontSize(8.5).text(event.notes, 54, y + 22, { width: 487, height: 20 });
    }
  }

  private drawClientDocument(document: PDFKit.PDFDocument, event: any, organization?: any) {
    let y = this.drawCatererHeader(document, organization, 'VOTRE ÉVÉNEMENT', event.reference, true);
    const eventName = this.pdfDisplayName(event.name);
    document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(26).text(eventName, 58, y, { width: 479, align: 'center' });
    y += document.heightOfString(eventName, { width: 479 }) + 13;
    document.fillColor('#0f766e').font('Helvetica-Bold').fontSize(11)
      .text(this.longDateLabel(event.startsAt), 58, y, { width: 479, align: 'center' });
    y += 28;
    if (event.venueName || event.address) {
      document.fillColor('#64748b').font('Helvetica').fontSize(9.5)
        .text([event.venueName, event.address].filter(Boolean).join(' · '), 72, y, { width: 451, align: 'center' });
      y += document.heightOfString([event.venueName, event.address].filter(Boolean).join(' · '), { width: 451 }) + 22;
    }
    document.moveTo(180, y).lineTo(415, y).strokeColor('#d6d3d1').lineWidth(1).stroke();
    y += 24;

    for (const prestation of event.prestations ?? []) {
      y = this.ensureCatererSpace(document, y, 100, organization, 'VOTRE ÉVÉNEMENT', event.reference, true);
      document.fillColor('#0f766e').font('Helvetica-Bold').fontSize(8)
        .text(`${this.serviceLabel(prestation.service)} · ${this.hourLabel(prestation.serviceAt)}`, 58, y, { width: 479, align: 'center', characterSpacing: 1.2 });
      y += 18;
      document.fillColor('#1c1917').font('Helvetica-Bold').fontSize(17)
        .text(prestation.name, 58, y, { width: 479, align: 'center' });
      y += document.heightOfString(prestation.name, { width: 479 }) + 18;

      const grouped = new Map<string, any[]>();
      for (const item of prestation.menu?.items ?? []) {
        const section = this.sectionLabel(item.section);
        if (!grouped.has(section)) grouped.set(section, []);
        grouped.get(section)!.push(item);
      }
      for (const [section, items] of grouped) {
        y = this.ensureCatererSpace(document, y, 38 + items.length * 35, organization, 'VOTRE ÉVÉNEMENT', event.reference, true);
        document.fillColor('#a16207').font('Helvetica-Bold').fontSize(8)
          .text(section.toUpperCase(), 82, y, { width: 431, align: 'center', characterSpacing: 1.4 });
        y += 17;
        for (const item of items) {
          const name = this.pdfDisplayName(item.technicalSheet?.name ?? item.product?.name ?? 'Article');
          const description = item.notes || item.technicalSheet?.description;
          document.fillColor('#1c1917').font('Helvetica-Bold').fontSize(11).text(name, 82, y, { width: 431, align: 'center' });
          y += document.heightOfString(name, { width: 431 }) + 3;
          if (description) {
            document.fillColor('#78716c').font('Helvetica-Oblique').fontSize(8.5)
              .text(description, 100, y, { width: 395, align: 'center', height: 25 });
            y += Math.min(document.heightOfString(description, { width: 395 }), 25) + 8;
          } else y += 9;
        }
        y += 7;
      }
      document.moveTo(220, y).lineTo(375, y).strokeColor('#e7e5e4').stroke();
      y += 22;
    }

    y = this.ensureCatererSpace(document, y, 70, organization, 'VOTRE ÉVÉNEMENT', event.reference, true);
    document.roundedRect(58, y, 479, 54, 8).fill('#f0fdfa');
    document.fillColor('#0f766e').font('Helvetica-Bold').fontSize(9).text('MERCI POUR VOTRE CONFIANCE', 72, y + 12, { width: 451, align: 'center' });
    document.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text(`${organization?.name ?? 'Votre traiteur'} vous accompagne pour faire de cet événement un moment mémorable.`, 72, y + 29, { width: 451, align: 'center' });
  }

  private drawCatererHeader(document: PDFKit.PDFDocument, organization: any, title: string, reference: string, client = false) {
    const dark = client ? '#fafaf9' : '#0f172a';
    document.rect(0, 0, 595, client ? 105 : 92).fill(dark);
    document.rect(0, client ? 101 : 88, 595, 4).fill(client ? '#d6b36a' : '#14b8a6');
    const logo = this.catererLogo(organization?.logoDataUrl);
    let textX = 42;
    if (logo) {
      try {
        document.image(logo, 42, 22, { fit: [48, 48], align: 'center', valign: 'center' });
        textX = 104;
      } catch {
        textX = 42;
      }
    }
    const primary = client ? '#1c1917' : '#ffffff';
    const secondary = client ? '#a16207' : '#5eead4';
    document.fillColor(primary).font('Helvetica-Bold').fontSize(client ? 15 : 13).text(organization?.name ?? 'ToqueHub Traiteur', textX, 26, { width: 300 });
    document.fillColor(secondary).font('Helvetica-Bold').fontSize(8).text(title, textX, 49, { characterSpacing: 1.2 });
    document.fillColor(client ? '#78716c' : '#cbd5e1').font('Helvetica').fontSize(8).text(reference, 420, 37, { width: 133, align: 'right' });
    return client ? 132 : 116;
  }

  private drawInfoCard(document: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string) {
    document.roundedRect(x, y, width, 54, 6).fillAndStroke('#f8fafc', '#e2e8f0');
    document.fillColor('#0f766e').font('Helvetica-Bold').fontSize(6.8).text(label, x + 9, y + 9, { width: width - 18 });
    document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(value, x + 9, y + 24, { width: width - 18, height: 23 });
  }

  private drawSectionTitle(document: PDFKit.PDFDocument, title: string, y: number) {
    document.fillColor('#0f766e').font('Helvetica-Bold').fontSize(8).text(title, 42, y, { characterSpacing: 1.2 });
    document.moveTo(135, y + 5).lineTo(553, y + 5).strokeColor('#cbd5e1').lineWidth(0.7).stroke();
  }

  private drawDefinitionBlock(document: PDFKit.PDFDocument, rows: string[][], y: number) {
    for (const [label, value] of rows) {
      const height = Math.max(25, document.heightOfString(value, { width: 382 }) + 12);
      document.rect(42, y, 511, height).fillAndStroke('#ffffff', '#e2e8f0');
      document.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), 53, y + 8, { width: 100 });
      document.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(value, 160, y + 7, { width: 382 });
      y += height;
    }
    return y;
  }

  private drawChecklistLine(document: PDFKit.PDFDocument, label: string, x: number, y: number, width: number) {
    document.rect(x, y, 12, 12).stroke('#64748b');
    document.fillColor('#334155').font('Helvetica').fontSize(8).text(label, x + 20, y + 1, { width: width - 20 });
  }

  private ensureCatererSpace(document: PDFKit.PDFDocument, y: number, required: number, organization: any, title: string, reference: string, client = false) {
    if (y + required < 795) return y;
    document.addPage({ size: 'A4', margin: 0 });
    return this.drawCatererHeader(document, organization, title, reference, client);
  }

  private catererLogo(value?: string | null) {
    if (!value) return null;
    const match = value.match(/^data:[^;]+;base64,(.+)$/);
    try {
      return match ? Buffer.from(match[1], 'base64') : null;
    } catch {
      return null;
    }
  }

  private catererAllergens(item: any) {
    return [...new Set(
      (item.technicalSheet?.ingredients ?? [])
        .flatMap((ingredient: any) => ingredient.allergens?.map((entry: any) => entry.allergen?.name) ?? [])
        .filter(Boolean),
    )].map(String).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  private quantityLabel(value: number) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  }

  private pdfDisplayName(value: string) {
    return value;
  }

  private fulfillmentLabel(value?: string) {
    return value === 'DELIVERY' ? 'Livraison' : value === 'PICKUP' ? 'Retrait' : value === 'ON_SITE' ? 'Sur place' : '—';
  }

  private serviceLabel(value?: string) {
    const labels: Record<string, string> = { BREAKFAST: 'Petit déjeuner', LUNCH: 'Déjeuner', DINNER: 'Dîner', SNACK: 'Collation', EVENT: 'Cocktail', BUFFET: 'Buffet' };
    return labels[value ?? ''] ?? 'Prestation';
  }

  private sectionLabel(value?: string) {
    const labels: Record<string, string> = { STARTER: 'Entrées & pièces salées', MAIN: 'Plats', SIDE: 'Accompagnements', CHEESE: 'Fromages', DESSERT: 'Douceurs', DRINK: 'Boissons', OTHER: 'Sélection' };
    return labels[value ?? ''] ?? 'Sélection';
  }

  private hourLabel(value?: string | Date | null) {
    return value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—';
  }

  private dayLabel(value?: string | Date | null) {
    return value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }) : '—';
  }

  private longDateLabel(value?: string | Date | null) {
    return value ? new Date(value).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'Date à confirmer';
  }

  private dateLabel(value?: string | Date | null) {
    return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : '—';
  }
}
