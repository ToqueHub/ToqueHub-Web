import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CatererEventStatus, MenuActivity, MenuKind, MenuProductionGenerationMode, MenuStatus, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { MenusService } from './menus.service';

type Actor = { id: string; role: string };
const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second'];
const MANAGER_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef'];

@Injectable()
export class CatererMenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
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
      include: { prestations: { include: { menu: true } } },
    }) : null;
    if (id && !existing) throw new NotFoundException('Événement Traiteur introuvable.');
    const client = dto.clientId ? await this.ensureClient(organizationId, dto.clientId) : null;
    if (dto.productionSiteId) await this.ensureSite(organizationId, dto.productionSiteId);
    for (const prestation of dto.prestations ?? []) {
      for (const item of prestation.items ?? []) await this.ensureMenuItemReference(organizationId, item);
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
          await tx.menuItem.deleteMany({ where: { menuId } });
        } else {
          const menu = await tx.menu.create({ data: { ...menuData, createdById: actor.id } });
          menuId = menu.id;
        }
        if (prestation.items?.length) {
          await tx.menuItem.createMany({
            data: prestation.items.map((item: any, itemPosition: number) => this.menuItemData(organizationId, menuId, item, itemPosition)),
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
    const event = await this.prisma.catererEvent.findFirst({ where: { id, organizationId }, include: { prestations: true } });
    if (!event) throw new NotFoundException('Événement Traiteur introuvable.');
    if (status === CatererEventStatus.CONFIRMED) {
      const readiness = await this.readiness(organizationId, id, false);
      if (!readiness.ready) throw new BadRequestException({ message: 'Confirmation impossible.', blockers: readiness.blockers });
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

  async generateProductions(organizationId: string, actor: Actor, id: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
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
