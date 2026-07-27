// @ts-nocheck
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, MenuActivity, MenuExportFormat, MenuHistoryAction, MenuKind, MenuProductionGenerationMode, MenuStatus, MenuUsageProfile, Prisma, ProductionMaterialStatus, ProductionPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionExecutionService } from '../production/production-execution.service';
import { ProductionPlanningService } from '../production/production-planning.service';
import { TechnicalSheetsService } from '../technical-sheets/technical-sheets.service';
import PDFDocument from 'pdfkit';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second'];
const MANAGER_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef'];
const DEFAULT_DIETS = ['Standard', 'Sans porc', 'Mixé', 'Haché', 'Diabétique', 'Sans sel', 'Végétarien', 'Végétalien', 'Texture modifiée', 'Autre'];
const DEFAULT_GUEST_GROUPS = [
  ['Résidents', 'RESIDENTS'], ['Patients', 'PATIENTS'], ['Élèves', 'STUDENTS'], ['Clients', 'CLIENTS'], ['Personnel', 'STAFF'], ['Invités', 'GUESTS'], ['Autre', 'OTHER'],
];
const MENU_PROFILE_DEFAULTS = {
  RESTAURANT_CAFE: { catalogEnabled: true, scheduledMenusEnabled: false, eventsEnabled: false, cyclesEnabled: false, dietsEnabled: false, guestForecastsEnabled: false, targetStockEnabled: true },
  CATERER: { catalogEnabled: true, scheduledMenusEnabled: true, eventsEnabled: true, cyclesEnabled: false, dietsEnabled: true, guestForecastsEnabled: true, targetStockEnabled: false },
  CENTRAL_KITCHEN: { catalogEnabled: false, scheduledMenusEnabled: true, eventsEnabled: false, cyclesEnabled: true, dietsEnabled: true, guestForecastsEnabled: true, targetStockEnabled: false },
  CUSTOM: { catalogEnabled: true, scheduledMenusEnabled: true, eventsEnabled: true, cyclesEnabled: true, dietsEnabled: true, guestForecastsEnabled: true, targetStockEnabled: true },
};
const MENU_PROFILE_CATEGORIES = {
  RESTAURANT_CAFE: [['Salé', '#0f766e', 'sandwich'], ['Sucré', '#b45309', 'cake'], ['Boissons', '#2563eb', 'coffee'], ['Suggestions', '#7c3aed', 'sparkles']],
  CATERER: [['Cocktail', '#7c3aed', 'glass'], ['Entrées', '#0f766e', 'starter'], ['Plats', '#dc2626', 'dish'], ['Desserts', '#b45309', 'cake'], ['Boissons', '#2563eb', 'glass']],
  CENTRAL_KITCHEN: [['Entrées', '#0f766e', 'starter'], ['Plats', '#dc2626', 'dish'], ['Accompagnements', '#65a30d', 'side'], ['Desserts', '#b45309', 'cake']],
  CUSTOM: [['Produits', '#475569', 'list']],
};
type Actor = { id: string; role: string };

@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productionPlanning: ProductionPlanningService,
    private readonly productionExecution: ProductionExecutionService,
    private readonly technicalSheets?: TechnicalSheetsService,
  ) {}

  private assertWrite(actor: Actor) { if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Droits Menus insuffisants'); }
  private assertManager(actor: Actor) { if (!MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Action réservée aux managers Menus'); }
  private page(q: any = {}) { const take = Math.min(q.pageSize ?? 50, 200); return { take, skip: ((q.page ?? 1) - 1) * take }; }
  private dayRange(date = new Date()) { const start = new Date(date); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; }
  private dateRange(q: any = {}) { return q.date ? this.dayRange(new Date(q.date)) : { start: q.startDate ? new Date(q.startDate) : undefined, end: q.endDate ? new Date(q.endDate) : undefined }; }

  private async assertInstalled(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { technicalSheetsInstalledAt: true, productionInstalledAt: true, menusInstalledAt: true } });
    if (!org?.technicalSheetsInstalledAt) throw new BadRequestException('Le module Fiches Techniques doit être installé avant Menus.');
    if (!org.productionInstalledAt) throw new BadRequestException('Le module Production doit être installé avant Menus.');
    if (!org.menusInstalledAt) throw new BadRequestException('Le module Menus n’est pas installé.');
  }

  async install(organizationId: string, actor: Actor) {
    this.assertManager(actor);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, rnmPricesInstalledAt: true, hrInstalledAt: true, planningInstalledAt: true, technicalSheetsInstalledAt: true, productionInstalledAt: true, menusInstalledAt: true } });
    if (!org) throw new NotFoundException('Organisation introuvable.');
    const installedAt = new Date();
    const installStocks = !org.stocksInstalledAt;
    const installTechnicalSheets = !org.technicalSheetsInstalledAt;
    const installProduction = !org.productionInstalledAt;
    await this.prisma.$transaction(async (tx) => {
      // Menus is usable immediately, while its culinary chain is configured
      // progressively. Provision its dependencies in their natural order.
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          stocksInstalledAt: org.stocksInstalledAt ?? installedAt,
          technicalSheetsInstalledAt: org.technicalSheetsInstalledAt ?? installedAt,
          productionInstalledAt: org.productionInstalledAt ?? installedAt,
          menusInstalledAt: org.menusInstalledAt ?? installedAt,
        },
      });
      if (installStocks) await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_STOCKS_INSTALLED, entityType: 'Module', entityId: 'stocks', entityName: 'Stocks', details: { source: 'menus-install' } } });
      if (installTechnicalSheets) await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_TECHNICAL_SHEETS_INSTALLED, entityType: 'Module', entityId: 'technical-sheets', entityName: 'Fiches Techniques', details: { source: 'menus-install' } } });
      if (installProduction) await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_PRODUCTION_INSTALLED, entityType: 'Module', entityId: 'production', entityName: 'Production', details: { source: 'menus-install' } } });
      await tx.menuSettings.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId, usageProfile: MenuUsageProfile.RESTAURANT_CAFE, ...MENU_PROFILE_DEFAULTS.RESTAURANT_CAFE },
      });
      for (const [position, [name, color, icon]] of MENU_PROFILE_CATEGORIES.RESTAURANT_CAFE.entries()) {
        await tx.menuCategory.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: {},
          create: { organizationId, name, color, icon, position },
        });
      }
      for (const name of DEFAULT_DIETS) await tx.menuDiet.upsert({ where: { organizationId_name: { organizationId, name } }, update: {}, create: { organizationId, name } });
      for (const [name, type] of DEFAULT_GUEST_GROUPS) await tx.menuGuestGroup.upsert({ where: { organizationId_name: { organizationId, name } }, update: {}, create: { organizationId, name, type } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_MENUS_INSTALLED, entityType: 'Module', entityId: 'menus', entityName: 'Menus' } });
    });
    return { installed: true, installedApplications: this.installedApps({ ...org, stocksInstalledAt: org.stocksInstalledAt ?? installedAt, technicalSheetsInstalledAt: org.technicalSheetsInstalledAt ?? installedAt, productionInstalledAt: org.productionInstalledAt ?? installedAt, menusInstalledAt: org.menusInstalledAt ?? installedAt }) };
  }

  async settings(organizationId: string) {
    await this.assertInstalled(organizationId);
    const settings = await this.ensureMenuSettings(organizationId);
    return { ...settings, categories: await this.categories(organizationId) };
  }

  async updateSettings(organizationId: string, actor: Actor, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    const profile = dto.usageProfile as MenuUsageProfile;
    const defaults = MENU_PROFILE_DEFAULTS[profile] ?? MENU_PROFILE_DEFAULTS.CUSTOM;
    const data = {
      ...defaults,
      ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
      usageProfile: profile,
      onboardingCompletedAt: new Date(),
    };
    const settings = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.menuSettings.upsert({
        where: { organizationId },
        update: data,
        create: { organizationId, ...data },
      });
      const categoryPreset = MENU_PROFILE_CATEGORIES[profile] ?? MENU_PROFILE_CATEGORIES.CUSTOM;
      for (const [position, [name, color, icon]] of categoryPreset.entries()) {
        await tx.menuCategory.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { isArchived: false, archivedAt: null },
          create: { organizationId, name, position, color, icon },
        });
      }
      await this.history(tx, organizationId, null, null, actor.id, MenuHistoryAction.SETTINGS_UPDATED, 'Configuration du parcours Menus', { usageProfile: profile });
      return saved;
    });
    return { ...settings, categories: await this.categories(organizationId) };
  }

  async categories(organizationId: string) {
    await this.assertInstalled(organizationId);
    return this.prisma.menuCategory.findMany({
      where: { organizationId, isArchived: false },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertCategory(organizationId: string, actor: Actor, dto: any, id?: string) {
    await this.assertInstalled(organizationId);
    this.assertWrite(actor);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Le nom de la rubrique est obligatoire.');
    const duplicate = await this.prisma.menuCategory.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) },
    });
    if (duplicate) throw new BadRequestException('Cette rubrique existe déjà.');
    if (id) {
      const existing = await this.prisma.menuCategory.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException('Rubrique Menu introuvable.');
      return this.prisma.menuCategory.update({ where: { id }, data: { ...dto, name } });
    }
    return this.prisma.menuCategory.create({ data: { organizationId, ...dto, name } });
  }

  async uninstall(organizationId: string, actor: Actor) {
    this.assertManager(actor);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, rnmPricesInstalledAt: true, hrInstalledAt: true, planningInstalledAt: true, technicalSheetsInstalledAt: true, productionInstalledAt: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { menusInstalledAt: null } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_MENUS_UNINSTALLED, entityType: 'Module', entityId: 'menus', entityName: 'Menus' } });
    });
    return { installed: false, installedApplications: this.installedApps({ ...org, menusInstalledAt: null }) };
  }

  async dashboard(organizationId: string, activity?: string) {
    await this.assertInstalled(organizationId); const today = this.dayRange(); const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); weekStart.setHours(0,0,0,0); const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const [activeMenus, weekMenus, cycles, todayMenus] = await Promise.all([
      this.prisma.menu.count({ where: { organizationId, activity: activity as any, status: { in: ['DRAFT','VALIDATED','PUBLISHED'] } } }),
      this.prisma.menu.findMany({ where: { organizationId, activity: activity as any, date: { gte: weekStart, lt: weekEnd } }, include: this.menuInclude() }),
      activity ? Promise.resolve(0) : this.prisma.menuCycle.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.menu.findMany({ where: { organizationId, activity: activity as any, date: { gte: today.start, lt: today.end } }, include: this.menuInclude() }),
    ]);
    const enriched = weekMenus.map((m) => this.serializeMenu(m));
    const todayEnriched = todayMenus.map((m) => this.serializeMenu(m));
    return { stats: { activeMenus, weekMenus: weekMenus.length, activeCycles: cycles, guestsToday: todayEnriched.reduce((s,m)=>s+m.totalGuests,0), averageCostPerMeal: this.avg(enriched.map(m=>m.costPerGuest)) }, alerts: enriched.flatMap((m) => m.alerts.map((a) => ({ ...a, menuId: m.id, menuName: m.name }))).slice(0, 20), week: enriched, today: todayEnriched };
  }

  async listMenus(organizationId: string, q: any = {}) { await this.assertInstalled(organizationId); const { start, end } = this.dateRange(q); const where: any = { organizationId, status: q.status, service: q.service, kind: q.kind, activity: q.activity, siteId: q.siteId, date: start || end ? { gte: start, lt: end } : undefined, OR: q.search ? [{ name: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] : undefined }; const [items,total] = await Promise.all([this.prisma.menu.findMany({ where, include: this.menuInclude(), orderBy: [{ isPrimary: 'desc' }, { date: 'asc' }, { service: 'asc' }], ...this.page(q) }), this.prisma.menu.count({ where })]); return { items: items.map((m)=>this.serializeMenu(m)), total, page: q.page ?? 1, pageSize: Math.min(q.pageSize ?? 50, 200) }; }
  async getMenu(organizationId: string, id: string) { await this.assertInstalled(organizationId); const m = await this.prisma.menu.findFirst({ where: { id, organizationId }, include: this.menuInclude(true) }); if (!m) throw new NotFoundException('Menu introuvable'); return this.serializeMenu(m); }
  calendar(organizationId: string, q: any = {}) { return this.listMenus(organizationId, q); }

  async createMenu(organizationId: string, actor: Actor, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertWrite(actor);
    await this.ensureRefs(organizationId, dto);
    const kind = dto.kind ?? MenuKind.SERVICE;
    const siteId = dto.siteId || (kind === MenuKind.CATALOG ? await this.resolvePrimarySiteId(organizationId) : null);
    const menuId = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await tx.menu.updateMany({ where: { organizationId, kind }, data: { isPrimary: false } });
      const menu = await tx.menu.create({ data: {
        organizationId,
        name: dto.name,
        date: dto.date ? new Date(dto.date) : null,
        service: dto.service,
        kind,
        activity: dto.activity ?? MenuActivity.RESTAURANT_CAFE,
        catalogType: dto.catalogType ?? null,
        siteId,
        description: dto.description,
        activeFrom: dto.activeFrom ? new Date(dto.activeFrom) : null,
        activeUntil: dto.activeUntil ? new Date(dto.activeUntil) : null,
        isPrimary: dto.isPrimary ?? false,
        expectedGuests: dto.expectedGuests ?? 0,
        createdById: actor.id,
      } });
      if (dto.items?.length) await tx.menuItem.createMany({ data: dto.items.map((i) => this.menuItemData(organizationId, menu.id, i)) });
      await this.history(tx, organizationId, menu.id, null, actor.id, MenuHistoryAction.CREATED, dto.kind === MenuKind.CATALOG ? 'Création de la carte' : 'Création du menu');
      return menu.id;
    });
    return this.getMenu(organizationId, menuId);
  }

  async updateMenu(organizationId: string, actor: Actor, id: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertWrite(actor);
    const current = await this.ensureMenu(organizationId, id);
    await this.ensureRefs(organizationId, dto);
    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await tx.menu.updateMany({ where: { organizationId, kind: dto.kind ?? current.kind, id: { not: id } }, data: { isPrimary: false } });
      await tx.menu.update({ where: { id }, data: {
        name: dto.name,
        date: dto.date ? new Date(dto.date) : null,
        service: dto.service,
        kind: dto.kind,
        activity: dto.activity ?? current.activity,
        catalogType: dto.catalogType ?? current.catalogType,
        siteId: dto.siteId || null,
        description: dto.description,
        activeFrom: dto.activeFrom ? new Date(dto.activeFrom) : null,
        activeUntil: dto.activeUntil ? new Date(dto.activeUntil) : null,
        isPrimary: dto.isPrimary,
        expectedGuests: dto.expectedGuests ?? 0,
        updatedById: actor.id,
        productionDirtySince: current.productionGeneratedAt ? new Date() : undefined,
      } });
      await tx.menuItem.deleteMany({ where: { menuId: id } });
      if (dto.items?.length) await tx.menuItem.createMany({ data: dto.items.map((i) => this.menuItemData(organizationId, id, i)) });
      await this.history(tx, organizationId, id, null, actor.id, MenuHistoryAction.UPDATED, current.kind === MenuKind.CATALOG ? 'Modification de la carte' : 'Modification du menu');
    });
    return this.getMenu(organizationId, id);
  }

  async changeStatus(organizationId: string, actor: Actor, id: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    await this.prisma.$transaction(async (tx) => {
      const menu = await tx.menu.findFirst({ where: { id, organizationId }, include: this.menuInclude() });
      if (!menu) throw new NotFoundException('Menu introuvable');
      if (['VALIDATED', 'PUBLISHED'].includes(dto.status)) {
        const alerts = this.serializeMenu(menu).alerts.filter((alert) => alert.blocking);
        if (alerts.length) throw new BadRequestException({ message: 'Validation impossible: alertes bloquantes.', alerts });
      }
      const action = dto.status === 'VALIDATED' ? MenuHistoryAction.VALIDATED : dto.status === 'PUBLISHED' ? MenuHistoryAction.PUBLISHED : dto.status === 'ARCHIVED' ? MenuHistoryAction.ARCHIVED : MenuHistoryAction.UPDATED;
      const serialized = this.serializeMenu(menu);
      await tx.menu.update({ where: { id }, data: { status: dto.status, publishedSnapshot: dto.status === 'PUBLISHED' ? serialized : undefined, updatedById: actor.id } });
      await this.history(tx, organizationId, id, null, actor.id, action, `Statut ${dto.status}`);
    });
    return this.getMenu(organizationId, id);
  }

  async diets(organizationId: string) { await this.assertInstalled(organizationId); return this.prisma.menuDiet.findMany({ where: { organizationId }, orderBy: [{ isArchived: 'asc' }, { name: 'asc' }] }); }
  async upsertDiet(organizationId: string, actor: Actor, dto: any, id?: string) { await this.assertInstalled(organizationId); this.assertManager(actor); return id ? this.prisma.menuDiet.update({ where: { id, organizationId }, data: dto }) : this.prisma.menuDiet.create({ data: { organizationId, ...dto } }); }
  async guestGroups(organizationId: string) { await this.assertInstalled(organizationId); return this.prisma.menuGuestGroup.findMany({ where: { organizationId }, orderBy: [{ isArchived: 'asc' }, { name: 'asc' }] }); }
  async upsertGuestGroup(organizationId: string, actor: Actor, dto: any, id?: string) { await this.assertInstalled(organizationId); this.assertManager(actor); return id ? this.prisma.menuGuestGroup.update({ where: { id, organizationId }, data: dto }) : this.prisma.menuGuestGroup.create({ data: { organizationId, ...dto } }); }
  async updateGuests(organizationId: string, actor: Actor, menuId: string, dto: any) { await this.assertInstalled(organizationId); this.assertWrite(actor); await this.ensureMenu(organizationId, menuId); for (const f of dto.forecasts) { await this.ensureGuestGroup(organizationId, f.guestGroupId); if (f.dietId) await this.ensureDiet(organizationId, f.dietId); } await this.prisma.$transaction(async (tx) => { await tx.menuGuestForecast.deleteMany({ where: { menuId } }); if (dto.forecasts.length) await tx.menuGuestForecast.createMany({ data: dto.forecasts.map((f) => ({ organizationId, menuId, ...f })) }); const total = dto.forecasts.reduce((s, f) => s + Number(f.count || 0), 0); await tx.menu.update({ where: { id: menuId }, data: { expectedGuests: total, productionDirtySince: (await tx.menu.findUnique({ where: { id: menuId } })).productionGeneratedAt ? new Date() : undefined } }); await this.history(tx, organizationId, menuId, null, actor.id, MenuHistoryAction.GUESTS_UPDATED, 'Modification des convives', { total }); }); return this.getMenu(organizationId, menuId); }

  async upsertVariant(organizationId: string, actor: Actor, menuId: string, dto: any, id?: string) { await this.assertInstalled(organizationId); this.assertWrite(actor); await this.ensureMenu(organizationId, menuId); await this.ensureDiet(organizationId, dto.dietId); for (const r of dto.replacements ?? []) await this.ensureTechnicalSheet(organizationId, r.replacementTechnicalSheetId); await this.prisma.$transaction(async (tx) => { const variant = id ? await tx.menuVariant.update({ where: { id, organizationId }, data: { dietId: dto.dietId, mode: dto.mode, name: dto.name, expectedGuests: dto.expectedGuests ?? 0, notes: dto.notes } }) : await tx.menuVariant.create({ data: { organizationId, menuId, dietId: dto.dietId, mode: dto.mode, name: dto.name, expectedGuests: dto.expectedGuests ?? 0, notes: dto.notes } }); await tx.menuVariantReplacement.deleteMany({ where: { variantId: variant.id } }); if (dto.replacements?.length) await tx.menuVariantReplacement.createMany({ data: dto.replacements.map((r) => ({ variantId: variant.id, ...r })) }); await tx.menu.update({ where: { id: menuId }, data: { productionDirtySince: (await tx.menu.findUnique({ where: { id: menuId } })).productionGeneratedAt ? new Date() : undefined } }); await this.history(tx, organizationId, menuId, null, actor.id, MenuHistoryAction.VARIANTS_UPDATED, 'Modification des variantes'); }); return this.getMenu(organizationId, menuId); }

  async cycles(organizationId: string, q: any={}) { await this.assertInstalled(organizationId); return this.prisma.menuCycle.findMany({ where: { organizationId, status: q.status }, include: { site: true, items: { include: { technicalSheet: true, diet: true }, orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { service: 'asc' }, { position: 'asc' }] }, forecasts: { include: { destinationSite: true, guestGroup: true, diet: true }, orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { service: 'asc' }] } }, orderBy: { updatedAt: 'desc' }, ...this.page(q) }); }
  async upsertCycle(organizationId: string, actor: Actor, dto: any, id?: string) {
    await this.assertInstalled(organizationId); this.assertManager(actor);
    if (dto.siteId) await this.ensureSite(organizationId, dto.siteId);
    for (const item of dto.items ?? []) { await this.ensureTechnicalSheet(organizationId, item.technicalSheetId); if (item.dietId) await this.ensureDiet(organizationId, item.dietId); }
    for (const forecast of dto.forecasts ?? []) {
      await this.ensureSite(organizationId, forecast.destinationSiteId);
      await this.ensureGuestGroup(organizationId, forecast.guestGroupId);
      if (forecast.dietId) await this.ensureDiet(organizationId, forecast.dietId);
    }
    return this.prisma.$transaction(async (tx) => {
      const cycle = id
        ? await tx.menuCycle.update({ where: { id, organizationId }, data: { name: dto.name, description: dto.description, durationWeeks: dto.durationWeeks, siteId: dto.siteId || null } })
        : await tx.menuCycle.create({ data: { organizationId, name: dto.name, description: dto.description, durationWeeks: dto.durationWeeks, siteId: dto.siteId || null } });
      await tx.menuCycleItem.deleteMany({ where: { cycleId: cycle.id } });
      await tx.menuCycleForecast.deleteMany({ where: { cycleId: cycle.id } });
      if (dto.items?.length) await tx.menuCycleItem.createMany({ data: dto.items.map((item) => ({ organizationId, cycleId: cycle.id, ...item })) });
      if (dto.forecasts?.length) await tx.menuCycleForecast.createMany({ data: dto.forecasts.map((forecast) => ({ organizationId, cycleId: cycle.id, ...forecast })) });
      return cycle;
    });
  }
  async replicateCycle(organizationId: string, actor: Actor, cycleId: string, dto: any) {
    await this.assertInstalled(organizationId); this.assertManager(actor);
    const cycle = await this.prisma.menuCycle.findFirst({ where: { id: cycleId, organizationId }, include: { items: true, forecasts: true } });
    if (!cycle) throw new NotFoundException('Cycle introuvable');
    const productionSiteId = dto.siteId || cycle.siteId;
    if (!productionSiteId) throw new BadRequestException('Le site de production du cycle est obligatoire.');
    const start = new Date(dto.startDate); const end = new Date(dto.endDate);
    let created = 0; let updated = 0; const skipped = [];
    return this.prisma.$transaction(async (tx) => {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        const diffDays = Math.floor((+d - +start) / 86400000);
        const weekNumber = (Math.floor(diffDays / 7) % cycle.durationWeeks) + 1;
        const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
        const services = new Set([
          ...cycle.items.filter((item) => item.weekNumber === weekNumber && item.dayOfWeek === dayOfWeek).map((item) => item.service),
          ...cycle.forecasts.filter((item) => item.weekNumber === weekNumber && item.dayOfWeek === dayOfWeek).map((item) => item.service),
        ]);
        for (const service of services) {
          const items = cycle.items.filter((item) => item.weekNumber === weekNumber && item.dayOfWeek === dayOfWeek && item.service === service);
          const forecasts = cycle.forecasts.filter((item) => item.weekNumber === weekNumber && item.dayOfWeek === dayOfWeek && item.service === service);
          const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
          const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);
          const current = await tx.menu.findFirst({ where: { organizationId, cycleId, date: { gte: dayStart, lt: dayEnd }, service, siteId: productionSiteId } });
          if (current && (current.status !== MenuStatus.DRAFT || current.productionGeneratedAt)) {
            skipped.push({ menuId: current.id, date: dayStart, service, reason: 'Menu verrouillé, publié ou déjà produit' });
            continue;
          }
          const expectedGuests = forecasts.length ? forecasts.reduce((sum, forecast) => sum + Number(forecast.count), 0) : Number(dto.expectedGuests ?? 0);
          const menuData = { name: `${cycle.name} - S${weekNumber} J${dayOfWeek} ${service}`, date: new Date(d), service, kind: MenuKind.CYCLE, activity: MenuActivity.CENTRAL_KITCHEN, siteId: productionSiteId, expectedGuests, cycleId, cycleWeek: weekNumber, cycleDay: dayOfWeek, updatedById: actor.id };
          const menu = current
            ? await tx.menu.update({ where: { id: current.id }, data: menuData })
            : await tx.menu.create({ data: { organizationId, ...menuData, createdById: actor.id } });
          if (current) updated++; else created++;
          await tx.menuItem.deleteMany({ where: { menuId: menu.id } });
          await tx.menuGuestForecast.deleteMany({ where: { menuId: menu.id } });
          await tx.menuDispatch.deleteMany({ where: { menuId: menu.id } });
          if (items.length) await tx.menuItem.createMany({ data: items.map((item) => ({ organizationId, menuId: menu.id, section: item.section, technicalSheetId: item.technicalSheetId, dietId: item.dietId, position: item.position, notes: item.notes, servingQuantity: 1 })) });
          const bySite = new Map();
          for (const forecast of forecasts) {
            const list = bySite.get(forecast.destinationSiteId) ?? [];
            list.push(forecast);
            bySite.set(forecast.destinationSiteId, list);
          }
          for (const [destinationSiteId, siteForecasts] of bySite.entries()) {
            const first = siteForecasts[0];
            const dispatch = await tx.menuDispatch.create({
              data: {
                organizationId, menuId: menu.id, destinationSiteId,
                departureAt: this.dateWithTime(d, first.departureTime),
                deliveryAt: this.dateWithTime(d, first.deliveryTime),
              },
            });
            await tx.menuGuestForecast.createMany({ data: siteForecasts.map((forecast) => ({ organizationId, menuId: menu.id, dispatchId: dispatch.id, destinationSiteId, guestGroupId: forecast.guestGroupId, dietId: forecast.dietId, count: forecast.count, notes: forecast.notes })) });
          }
        }
      }
      await this.history(tx, organizationId, null, cycleId, actor.id, MenuHistoryAction.CYCLE_REPLICATED, `${created} menus créés, ${updated} actualisés, ${skipped.length} ignorés`);
      return { created, updated, skipped };
    });
  }

  async dispatches(organizationId: string, q: any = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.menuDispatch.findMany({ where: { organizationId, menuId: q.menuId, status: q.status }, include: { destinationSite: true, menu: true, forecasts: { include: { guestGroup: true, diet: true } } }, orderBy: [{ departureAt: 'asc' }, { deliveryAt: 'asc' }] });
  }
  async updateDispatchStatus(organizationId: string, actor: Actor, id: string, status: any) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    const dispatch = await this.prisma.menuDispatch.findFirst({ where: { id, organizationId } });
    if (!dispatch) throw new NotFoundException('Distribution introuvable.');
    const saved = await this.prisma.menuDispatch.update({ where: { id }, data: { status } });
    await this.prisma.menuHistory.create({ data: { organizationId, menuId: dispatch.menuId, actorUserId: actor.id, action: MenuHistoryAction.UPDATED, summary: `Distribution ${status}`, details: { dispatchId: id, status } } });
    return saved;
  }

  async centralDocument(organizationId: string, actor: Actor, menuId: string, kind: string) {
    await this.assertInstalled(organizationId); this.assertWrite(actor);
    if (!['PRODUCTION', 'PACKING', 'DISPATCH'].includes(kind)) throw new BadRequestException('Type de document Cuisine centrale inconnu.');
    const menu = await this.prisma.menu.findFirst({ where: { id: menuId, organizationId, activity: MenuActivity.CENTRAL_KITCHEN }, include: this.menuInclude(true) });
    if (!menu) throw new NotFoundException('Menu Cuisine centrale introuvable.');
    const serialized = this.serializeMenu(menu);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 45 }); const chunks = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk))); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      doc.fontSize(20).text(kind === 'PRODUCTION' ? 'Plan de production global' : kind === 'PACKING' ? 'Fiche de conditionnement' : 'Bons de distribution');
      doc.moveDown(.3).fontSize(11).fillColor('#475569').text(`${menu.name} · ${menu.date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · ${serialized.totalGuests} repas`);
      doc.moveDown().fillColor('#0f172a');
      if (kind === 'PRODUCTION') {
        for (const line of this.effectiveProductionLines(menu)) doc.fontSize(11).text(`• ${line.technicalSheet.name} — ${line.portions} portion(s)`);
      } else {
        for (const dispatch of menu.dispatches ?? []) {
          doc.fontSize(14).text(dispatch.destinationSite.name);
          doc.fontSize(9).fillColor('#475569').text(`Départ ${dispatch.departureAt?.toLocaleString('fr-FR') ?? '—'} · Livraison ${dispatch.deliveryAt?.toLocaleString('fr-FR') ?? '—'} · ${dispatch.status}`);
          const forecasts = (menu.guestForecasts ?? []).filter((forecast) => forecast.dispatchId === dispatch.id);
          for (const forecast of forecasts) doc.fontSize(10).fillColor('#0f172a').text(`• ${forecast.guestGroup.name} · ${forecast.diet?.name ?? 'Standard'} — ${forecast.count} repas`);
          if (kind === 'PACKING') {
            for (const item of menu.items ?? []) {
              const guests = forecasts.filter((forecast) => (forecast.dietId ?? null) === (item.dietId ?? null)).reduce((sum, forecast) => sum + forecast.count, 0);
              if (guests) doc.fontSize(9).text(`  ${item.technicalSheet?.name ?? item.product?.name} — ${guests * Number(item.servingQuantity ?? 1)}`);
            }
          }
          doc.moveDown();
        }
      }
      doc.end();
    });
    await this.prisma.menuHistory.create({ data: { organizationId, menuId, actorUserId: actor.id, action: MenuHistoryAction.EXPORT_GENERATED, summary: `Document Cuisine centrale ${kind}`, details: { kind } } });
    return { buffer, filename: `cuisine-centrale-${kind.toLowerCase()}-${menu.id}.pdf`, mimeType: 'application/pdf' };
  }

  async availability(organizationId: string, menuId: string, requestedSiteId?: string) {
    await this.assertInstalled(organizationId);
    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, organizationId },
      include: {
        site: true,
        items: {
          include: {
            menuCategory: true,
            product: { include: { unit: true, category: true } },
            technicalSheet: { include: { outputProduct: { include: { unit: true } }, yieldUnit: true } },
          },
          orderBy: [{ position: 'asc' }],
        },
        guestForecasts: true,
      },
    });
    if (!menu) throw new NotFoundException('Menu introuvable');

    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { primarySiteId: true } });
    const siteId = requestedSiteId || menu.siteId || organization?.primarySiteId || (await this.prisma.site.findFirst({ where: { organizationId, isArchived: false }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    if (requestedSiteId) await this.ensureSite(organizationId, requestedSiteId);

    const sheets = await this.prisma.technicalSheet.findMany({
      where: { organizationId, isArchived: false },
      include: {
        outputProduct: { include: { unit: true } },
        yieldUnit: true,
        ingredients: {
          orderBy: { order: 'asc' },
          include: { product: { include: { unit: true } }, unit: true },
        },
      },
    });
    const sheetsById = new Map(sheets.map((sheet) => [sheet.id, sheet]));
    const productIds = [...new Set([
      ...sheets.flatMap((sheet) => [sheet.outputProductId, ...sheet.ingredients.map((line) => line.productId)]),
      ...menu.items.map((item) => item.productId),
    ].filter(Boolean))];
    const [stockRows, reservationRows, orders, conversions] = await Promise.all([
      productIds.length ? this.prisma.stock.groupBy({ by: ['productId'], where: { organizationId, productId: { in: productIds }, ...(siteId ? { siteId } : {}) }, _sum: { quantity: true } }) : [],
      productIds.length && siteId ? this.prisma.stockReservation.groupBy({ by: ['productId'], where: { organizationId, siteId, productId: { in: productIds }, status: 'ACTIVE' }, _sum: { quantity: true } }) : [],
      productIds.length ? this.prisma.productionOrder.findMany({ where: { organizationId, outputProductId: { in: productIds }, status: { in: ['PLANNED', 'VALIDATED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'] }, ...(siteId ? { siteId } : {}) }, select: { outputProductId: true, plannedPortions: true, proposedQuantity: true, validatedQuantity: true, realizedPortions: true, status: true } }) : [],
      this.prisma.unitConversion.findMany({ where: { organizationId } }),
    ]);
    const stockByProduct = new Map(stockRows.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]));
    const reservedByProduct = new Map(reservationRows.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]));
    const productionByProduct = new Map<string, number>();
    orders.forEach((order) => {
      if (!order.outputProductId) return;
      const planned = Math.max(Number(order.validatedQuantity ?? 0), Number(order.proposedQuantity ?? 0), Number(order.plannedPortions ?? 0));
      const remaining = Math.max(planned - Number(order.realizedPortions ?? 0), 0);
      productionByProduct.set(order.outputProductId, (productionByProduct.get(order.outputProductId) ?? 0) + remaining);
    });
    const conversionByPair = new Map(conversions.map((conversion) => [`${conversion.fromUnitId}:${conversion.toUnitId}`, Number(conversion.factor)]));
    const convert = (quantity: number, fromUnitId?: string | null, toUnitId?: string | null) => {
      if (!fromUnitId || !toUnitId || fromUnitId === toUnitId) return quantity;
      const direct = conversionByPair.get(`${fromUnitId}:${toUnitId}`);
      if (direct != null) return quantity * direct;
      const reverse = conversionByPair.get(`${toUnitId}:${fromUnitId}`);
      return reverse ? quantity / reverse : null;
    };
    const productBalance = (productId?: string | null) => Math.max((stockByProduct.get(productId ?? '') ?? 0) - (reservedByProduct.get(productId ?? '') ?? 0), 0);

    const buildComponents = (sheetId: string, requiredOutput: number, visited: string[] = []): any[] => {
      const sheet = sheetsById.get(sheetId);
      if (!sheet || visited.includes(sheetId) || requiredOutput <= 0) return [];
      const referenceYield = Math.max(Number(sheet.referencePortions ?? 1), 0.001);
      const factor = requiredOutput / referenceYield;
      return sheet.ingredients.map((line) => {
        const requiredInLineUnit = Number(line.quantity) * factor;
        if (line.sourceTechnicalSheetId) {
          const source = sheetsById.get(line.sourceTechnicalSheetId);
          if (!source?.outputProductId || !source.outputProduct || !source.yieldUnitId) {
            return { kind: 'SUB_RECIPE', technicalSheetId: line.sourceTechnicalSheetId, name: source?.name ?? line.product.name, requiredQuantity: requiredInLineUnit, unit: line.unit.symbol, status: 'NOT_CONFIGURED', missingQuantity: requiredInLineUnit, children: [] };
          }
          const requiredYield = convert(requiredInLineUnit, line.unitId, source.yieldUnitId);
          if (requiredYield == null) {
            return { kind: 'SUB_RECIPE', technicalSheetId: source.id, name: source.name, requiredQuantity: requiredInLineUnit, unit: line.unit.symbol, status: 'BLOCKED', reason: 'Conversion d’unité manquante', missingQuantity: requiredInLineUnit, children: [] };
          }
          const stockInYield = convert(productBalance(source.outputProductId), source.outputProduct.unitId, source.yieldUnitId) ?? 0;
          const productionInYield = convert(productionByProduct.get(source.outputProductId) ?? 0, source.outputProduct.unitId, source.yieldUnitId) ?? 0;
          const missing = Math.max(requiredYield - stockInYield - productionInYield, 0);
          const children = buildComponents(source.id, missing, [...visited, sheetId]);
          const blocked = children.some((child) => child.status === 'BLOCKED' || child.status === 'NOT_CONFIGURED');
          return { kind: 'SUB_RECIPE', technicalSheetId: source.id, productId: source.outputProductId, name: source.name, requiredQuantity: requiredYield, availableQuantity: stockInYield, inProductionQuantity: productionInYield, missingQuantity: missing, unit: source.yieldUnit?.symbol ?? source.outputProduct.unit.symbol, status: blocked ? 'BLOCKED' : missing > 0 ? 'TO_PRODUCE' : 'READY', children };
        }
        const requiredProductUnit = convert(requiredInLineUnit, line.unitId, line.product.unitId);
        if (requiredProductUnit == null) {
          return { kind: 'PRODUCT', productId: line.productId, name: line.product.name, requiredQuantity: requiredInLineUnit, availableQuantity: productBalance(line.productId), missingQuantity: requiredInLineUnit, unit: line.unit.symbol, status: 'BLOCKED', reason: 'Conversion d’unité manquante', children: [] };
        }
        const available = productBalance(line.productId);
        const missing = Math.max(requiredProductUnit - available, 0);
        return { kind: 'PRODUCT', productId: line.productId, name: line.product.name, requiredQuantity: requiredProductUnit, availableQuantity: available, missingQuantity: missing, unit: line.product.unit.symbol, status: missing > 0 ? 'BLOCKED' : 'READY', children: [] };
      });
    };

    const totalGuests = menu.guestForecasts.length ? menu.guestForecasts.reduce((sum, forecast) => sum + forecast.count, 0) : menu.expectedGuests;
    const items = menu.items.map((item) => {
      const servingQuantity = Math.max(Number(item.servingQuantity ?? 1), 0.001);
      const targetPortions = menu.kind === MenuKind.CATALOG ? Number(item.targetReadyQuantity ?? item.portionsOverride ?? 0) : Number(item.portionsOverride ?? totalGuests ?? 0);
      if (item.productId) {
        const product = item.product;
        if (!item.availabilityEnabled || !product) {
          return { id: item.id, sourceType: 'PRODUCT', productId: item.productId, name: product?.name ?? 'Produit Stocks', category: item.menuCategory, servingQuantity, targetPortions, status: 'NOT_CONFIGURED', message: !item.availabilityEnabled ? 'Suivi désactivé' : 'Produit Stocks indisponible', components: [] };
        }
        const stockQuantity = productBalance(product.id);
        const targetQuantity = targetPortions * servingQuantity;
        const missingQuantity = Math.max(targetQuantity - stockQuantity, 0);
        return {
          id: item.id,
          sourceType: 'PRODUCT',
          productId: product.id,
          name: product.name,
          category: item.menuCategory,
          outputProduct: { id: product.id, name: product.name, unit: product.unit },
          servingQuantity,
          targetPortions,
          lowStockThreshold: Number(item.lowStockThreshold ?? 0),
          stockQuantity,
          inProductionQuantity: 0,
          availablePortions: Math.floor(stockQuantity / servingQuantity),
          projectedPortions: Math.floor(stockQuantity / servingQuantity),
          toProduceQuantity: 0,
          toProducePortions: 0,
          missingStockQuantity: missingQuantity,
          status: missingQuantity > 0 ? 'BLOCKED' : 'READY',
          message: missingQuantity > 0 ? `Stock insuffisant : ${missingQuantity.toFixed(3)} ${product.unit?.symbol ?? ''} à approvisionner` : undefined,
          components: [{ kind: 'PRODUCT', productId: product.id, name: product.name, requiredQuantity: targetQuantity, availableQuantity: stockQuantity, missingQuantity, unit: product.unit?.symbol, status: missingQuantity > 0 ? 'BLOCKED' : 'READY', children: [] }],
        };
      }
      const sheet = sheetsById.get(item.technicalSheetId) ?? item.technicalSheet;
      const outputProduct = sheet?.outputProduct;
      if (!item.availabilityEnabled || !sheet?.outputProductId || !outputProduct || !sheet.yieldUnitId) {
        return { id: item.id, sourceType: 'TECHNICAL_SHEET', technicalSheetId: item.technicalSheetId, name: sheet?.name ?? 'Fiche technique', category: item.menuCategory, servingQuantity, targetPortions, status: 'NOT_CONFIGURED', message: !item.availabilityEnabled ? 'Suivi désactivé' : 'Produit fabriqué non configuré dans la fiche technique', components: [] };
      }
      const availableOutput = convert(productBalance(sheet.outputProductId), outputProduct.unitId, sheet.yieldUnitId) ?? 0;
      const inProductionOutput = convert(productionByProduct.get(sheet.outputProductId) ?? 0, outputProduct.unitId, sheet.yieldUnitId) ?? 0;
      const targetOutput = targetPortions * servingQuantity;
      const toProduceOutput = Math.max(targetOutput - availableOutput - inProductionOutput, 0);
      const components = buildComponents(sheet.id, toProduceOutput);
      const flattened = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...flattened(node.children ?? [])]);
      const allComponents = flattened(components);
      const hasBlockedComponent = allComponents.some((component) => component.status === 'BLOCKED' || component.status === 'NOT_CONFIGURED');
      const hasMissingPreparation = allComponents.some((component) => component.kind === 'SUB_RECIPE' && component.missingQuantity > 0);
      const availablePortions = Math.floor(availableOutput / servingQuantity);
      const projectedPortions = Math.floor((availableOutput + inProductionOutput) / servingQuantity);
      let status = 'READY';
      if (targetOutput > availableOutput) status = toProduceOutput <= 0 ? 'LOW_STOCK' : hasBlockedComponent ? 'BLOCKED' : hasMissingPreparation ? 'COMPONENT_MISSING' : 'TO_PRODUCE';
      return {
        id: item.id,
        sourceType: 'TECHNICAL_SHEET',
        technicalSheetId: item.technicalSheetId,
        name: sheet.name,
        category: item.menuCategory,
        outputProduct: { id: outputProduct.id, name: outputProduct.name, unit: sheet.yieldUnit ?? outputProduct.unit },
        servingQuantity,
        targetPortions,
        lowStockThreshold: Number(item.lowStockThreshold ?? 0),
        stockQuantity: availableOutput,
        inProductionQuantity: inProductionOutput,
        availablePortions,
        projectedPortions,
        toProduceQuantity: toProduceOutput,
        toProducePortions: Math.ceil(toProduceOutput / servingQuantity),
        status,
        components,
      };
    });
    const counts = items.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] ?? 0) + 1 }), {} as Record<string, number>);
    return { menu: { id: menu.id, name: menu.name, kind: menu.kind, siteId, site: menu.site }, generatedAt: new Date(), summary: { total: items.length, ready: counts.READY ?? 0, lowStock: counts.LOW_STOCK ?? 0, toProduce: (counts.TO_PRODUCE ?? 0) + (counts.COMPONENT_MISSING ?? 0), blocked: (counts.BLOCKED ?? 0) + (counts.NOT_CONFIGURED ?? 0) }, items };
  }

  async planShortages(organizationId: string, actor: Actor, menuId: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    const report = await this.availability(organizationId, menuId, dto.siteId);
    if (!report.menu.siteId) throw new BadRequestException('Choisissez un site pour planifier les manquants.');
    const selectedIds = new Set(dto.itemIds ?? []);
    const candidates = report.items.filter((item) => item.toProduceQuantity > 0 && item.outputProduct && (!selectedIds.size || selectedIds.has(item.id)));
    const neededAt = dto.neededAt ? new Date(dto.neededAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const created = [];
    const skipped = [];
    for (const item of candidates) {
      const profile = await this.prisma.productionProfile.findFirst({ where: { organizationId, siteId: report.menu.siteId, technicalSheetId: item.technicalSheetId, outputProductId: item.outputProduct.id }, include: { yieldUnit: true } });
      if (!profile) {
        skipped.push({ itemId: item.id, name: item.name, reason: 'Profil de production absent pour ce site' });
        continue;
      }
      const sourceReferenceId = `${menuId}:${item.id}`;
      const existing = await this.prisma.productionNeed.findFirst({ where: { organizationId, source: 'MENU', sourceReferenceType: 'MenuAvailabilityItem', sourceReferenceId, status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_COVERED'] } } });
      if (existing) {
        if (existing.status === 'DRAFT') {
          created.push(await this.prisma.productionNeed.update({ where: { id: existing.id }, data: { quantity: new Prisma.Decimal(item.toProduceQuantity), neededAt, notes: `Besoin actualisé depuis la carte ${report.menu.name}` } }));
        } else {
          skipped.push({ itemId: item.id, name: item.name, reason: 'Un besoin confirmé existe déjà' });
        }
        continue;
      }
      created.push(await this.productionPlanning.createNeed(organizationId, { id: actor.id, role: actor.role, permissions: [] }, { siteId: report.menu.siteId, productId: item.outputProduct.id, unitId: profile.yieldUnitId, source: 'MENU', sourceReferenceType: 'MenuAvailabilityItem', sourceReferenceId, quantity: new Prisma.Decimal(item.toProduceQuantity).toFixed(3), neededAt: neededAt.toISOString(), status: 'DRAFT', notes: `Besoin proposé depuis la carte ${report.menu.name}` }));
    }
    await this.prisma.menuHistory.create({ data: { organizationId, menuId, actorUserId: actor.id, action: MenuHistoryAction.AVAILABILITY_PLANNED, summary: `${created.length} besoin(s) Production préparé(s)`, details: { needIds: created.map((need) => need.id), skipped } } });
    return { created: created.length, needs: created, skipped, report: await this.availability(organizationId, menuId, dto.siteId) };
  }

  async planCatalogProductionDay(
    organizationId: string,
    actor: Actor,
    catalogId: string,
    dto: any,
  ) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    if (!dto.lines?.length) {
      throw new BadRequestException('Sélectionnez au moins un produit de la carte.');
    }
    const date = new Date(`${String(dto.date).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Date de production invalide.');
    }
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const [catalog, site, previousClosure] = await Promise.all([
      this.prisma.menu.findFirst({
        where: { id: catalogId, organizationId, kind: MenuKind.CATALOG },
        include: this.menuInclude(),
      }),
      this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, isArchived: false },
      }),
      this.prisma.productionDayClosure.findFirst({
        where: {
          organizationId,
          siteId: dto.siteId,
          date: { lt: date },
          status: 'CLOSED',
        },
        include: { items: true },
        orderBy: { date: 'desc' },
      }),
    ]);
    if (!catalog) throw new NotFoundException('Carte introuvable.');
    if (!site) throw new NotFoundException('Site introuvable.');

    const requested = new Map(dto.lines.map((line) => [line.menuItemId, line]));
    if (requested.size !== dto.lines.length) {
      throw new BadRequestException('Un produit de la carte est présent plusieurs fois.');
    }
    const sourceItems = (catalog.items ?? []).filter((item) => requested.has(item.id));
    if (
      sourceItems.length !== requested.size ||
      sourceItems.some((item) => !item.technicalSheetId || !item.technicalSheet)
    ) {
      throw new BadRequestException(
        'Un produit sélectionné ne correspond plus à une fiche technique active de la carte.',
      );
    }

    const profiles = this.technicalSheets
      ? await Promise.all(
          sourceItems.map((item) =>
            this.technicalSheets.ensureProductionProfile(
              organizationId,
              actor,
              item.technicalSheetId,
              dto.siteId,
            ),
          ),
        )
      : await this.prisma.productionProfile.findMany({
          where: {
            organizationId,
            siteId: dto.siteId,
            technicalSheetId: { in: sourceItems.map((item) => item.technicalSheetId) },
          },
          include: { outputProduct: true },
        });
    const profileBySheet = new Map(
      profiles.map((profile) => [profile.technicalSheetId, profile]),
    );
    const missingProfile = sourceItems.find(
      (item) => !profileBySheet.has(item.technicalSheetId),
    );
    if (missingProfile) {
      throw new BadRequestException({
        code: 'PRODUCTION_PROFILE_REQUIRED_FOR_MENU',
        technicalSheetId: missingProfile.technicalSheetId,
        technicalSheetName: missingProfile.technicalSheet.name,
        siteId: dto.siteId,
      });
    }

    const carryByProduct = new Map();
    for (const item of previousClosure?.items ?? []) {
      if (!item.outputProductId) continue;
      carryByProduct.set(
        item.outputProductId,
        (carryByProduct.get(item.outputProductId) ?? 0) +
          Number(item.carryOverNextPortions),
      );
    }

    const existingDailyMenu = await this.prisma.menu.findFirst({
      where: {
        organizationId,
        sourceMenuId: catalogId,
        siteId: dto.siteId,
        kind: MenuKind.SERVICE,
        date: { gte: date, lt: nextDate },
      },
      include: this.menuInclude(),
    });
    const linkedItemIds = new Set();
    const linkedSheetIds = new Set();
    const linkedProductionByItemId = new Map();
    const linkedProductionBySheetId = new Map();
    for (const link of existingDailyMenu?.productionLinks ?? []) {
      if (link.productionOrder?.status === 'CANCELLED') continue;
      if (link.productionOrder?.technicalSheetId) {
        linkedSheetIds.add(link.productionOrder.technicalSheetId);
        linkedProductionBySheetId.set(link.productionOrder.technicalSheetId, link);
      }
      const snapshotLines = Array.isArray(link.snapshot?.lines) ? link.snapshot.lines : [];
      snapshotLines.forEach((line) => {
        if (line?.menuItemId) {
          linkedItemIds.add(line.menuItemId);
          linkedProductionByItemId.set(line.menuItemId, link);
        }
        if (line?.technicalSheetId) {
          linkedProductionBySheetId.set(line.technicalSheetId, link);
        }
      });
    }

    const prepared = await this.prisma.$transaction(async (tx) => {
      const dailyMenu = existingDailyMenu
        ? await tx.menu.update({
            where: { id: existingDailyMenu.id },
            data: {
              status: MenuStatus.VALIDATED,
              updatedById: actor.id,
              productionDirtySince: existingDailyMenu.productionGeneratedAt
                ? new Date()
                : existingDailyMenu.productionDirtySince,
            },
          })
        : await tx.menu.create({
            data: {
              organizationId,
              name: `Vitrine · ${catalog.name} · ${new Intl.DateTimeFormat('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(date)}`,
              date,
              service: catalog.service ?? 'SNACK',
              kind: MenuKind.SERVICE,
              activity: MenuActivity.RESTAURANT_CAFE,
              siteId: dto.siteId,
              sourceMenuId: catalog.id,
              expectedGuests: 0,
              status: MenuStatus.VALIDATED,
              createdById: actor.id,
              updatedById: actor.id,
            },
          });

      const lines = [];
      for (const sourceItem of sourceItems) {
        const line = requested.get(sourceItem.id);
        const targetPortions = Number(line.targetPortions);
        if (!Number.isFinite(targetPortions) || targetPortions <= 0) {
          throw new BadRequestException(
            `L’objectif de ${sourceItem.technicalSheet.name} doit être supérieur à zéro.`,
          );
        }
        let dailyItem = existingDailyMenu?.items?.find(
          (item) =>
            item.technicalSheetId === sourceItem.technicalSheetId &&
            (item.dietId ?? null) === (sourceItem.dietId ?? null),
        );
        const existingProductionLink = dailyItem
          ? linkedProductionByItemId.get(dailyItem.id) ??
            linkedProductionBySheetId.get(dailyItem.technicalSheetId)
          : linkedProductionBySheetId.get(sourceItem.technicalSheetId);
        if (dailyItem) {
          dailyItem = await tx.menuItem.update({
            where: { id: dailyItem.id },
            data: { portionsOverride: new Prisma.Decimal(targetPortions) },
          });
        } else {
          dailyItem = await tx.menuItem.create({
            data: this.menuItemData(organizationId, dailyMenu.id, {
              section: sourceItem.section,
              menuCategoryId: sourceItem.menuCategoryId,
              technicalSheetId: sourceItem.technicalSheetId,
              dietId: sourceItem.dietId,
              position: sourceItem.position,
              portionsOverride: targetPortions,
              servingQuantity: sourceItem.servingQuantity,
              availabilityEnabled: sourceItem.availabilityEnabled,
              notes: `Produit repris depuis la carte ${catalog.name}`,
            }),
          });
        }
        const profile = profileBySheet.get(sourceItem.technicalSheetId);
        const outputProductId =
          profile.outputProductId ?? sourceItem.technicalSheet.outputProductId;
        const availableCarry = outputProductId
          ? Number(carryByProduct.get(outputProductId) ?? 0)
          : 0;
        const openingCarryOverPortions = Math.min(availableCarry, targetPortions);
        if (outputProductId) {
          carryByProduct.set(
            outputProductId,
            Math.max(availableCarry - openingCarryOverPortions, 0),
          );
        }
        lines.push({
          menuItemId: dailyItem.id,
          portions: Math.max(targetPortions - openingCarryOverPortions, 0),
          targetPortions,
          openingCarryOverPortions,
          plannedTime: line.plannedTime || dto.plannedTime || '08:00',
          ...(existingProductionLink
            ? {
                existingProductionOrderId: existingProductionLink.productionOrderId,
                existingProductionLinkId: existingProductionLink.id,
              }
            : {}),
        });
      }
      return { dailyMenuId: dailyMenu.id, lines };
    });

    const existingLines = prepared.lines.filter(
      (line) => line.existingProductionOrderId && line.existingProductionLinkId,
    );
    const newLines = prepared.lines.filter((line) => !line.existingProductionOrderId);
    const updatedOrders = [];
    for (const line of existingLines) {
      const updated = await this.productionExecution.rescheduleCampaign(
        organizationId,
        { ...actor, permissions: [] },
        line.existingProductionOrderId,
        {
          grossRequirement: new Prisma.Decimal(line.portions).toFixed(3),
          plannedTime: line.plannedTime,
          serviceId: dto.serviceId,
        },
      );
      const existingLink = (existingDailyMenu?.productionLinks ?? []).find(
        (link) => link.id === line.existingProductionLinkId,
      );
      const snapshot =
        existingLink?.snapshot && typeof existingLink.snapshot === 'object'
          ? existingLink.snapshot
          : {};
      const snapshotLines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
      await this.prisma.menuProductionLink.update({
        where: { id: line.existingProductionLinkId },
        data: {
          snapshot: {
            ...snapshot,
            lines: snapshotLines.map((snapshotLine) =>
              snapshotLine?.menuItemId === line.menuItemId
                ? {
                    ...snapshotLine,
                    portions: line.portions,
                    targetPortions: line.targetPortions,
                    openingCarryOverPortions: line.openingCarryOverPortions,
                    plannedTime: line.plannedTime,
                  }
                : snapshotLine,
            ),
          },
        },
      });
      updatedOrders.push(updated);
    }
    const generation = newLines.length
      ? await this.generateProductions(
          organizationId,
          actor,
          prepared.dailyMenuId,
          {
            mode: MenuProductionGenerationMode.DETAILED,
            serviceId: dto.serviceId,
            plannedTime: dto.plannedTime || '08:00',
            lines: newLines,
          },
        )
      : {
          created: 0,
          orders: [],
          skipped: [],
          allMenuProductsPlanned: true,
        };
    if (existingLines.length) {
      await this.prisma.menu.update({
        where: { id: prepared.dailyMenuId },
        data: { productionDirtySince: null },
      });
    }
    return {
      menu: await this.getMenu(organizationId, prepared.dailyMenuId),
      generation: {
        ...generation,
        updated: updatedOrders.length,
        orders: [...updatedOrders, ...(generation.orders ?? [])],
      },
      previousClosureDate: previousClosure?.date ?? null,
      lines: prepared.lines,
    };
  }

  async generateProductions(organizationId: string, actor: Actor, menuId: string, dto: any) {
    await this.assertInstalled(organizationId);
    this.assertManager(actor);
    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, organizationId },
      include: this.menuInclude(),
    });
    if (!menu) throw new NotFoundException('Menu introuvable');
    const serialized = this.serializeMenu(menu);
    const hasLineSelection = Array.isArray(dto.lines) && dto.lines.length > 0;
    if (!['VALIDATED', 'PUBLISHED'].includes(menu.status))
      throw new BadRequestException('Le menu doit être validé ou publié.');
    if (!hasLineSelection && !serialized.totalGuests)
      throw new BadRequestException('Les convives doivent être renseignés.');
    const blocking = serialized.alerts.filter((alert) => alert.blocking);
    if (blocking.length)
      throw new BadRequestException({
        message: 'Génération impossible: alertes bloquantes.',
        alerts: blocking,
      });
    if (!menu.siteId)
      throw new BadRequestException('Un site est obligatoire pour générer la production.');
    if (!menu.date)
      throw new BadRequestException('Une date est obligatoire pour planifier la production du menu.');
    if (!hasLineSelection && menu.productionGeneratedAt && !dto.force)
      throw new BadRequestException(
        'Productions déjà générées: confirmation force requise.',
      );

    const effectiveAll = this.effectiveProductionLines(menu);
    const requestedLines = new Map(
      (dto.lines ?? []).map((line) => [line.menuItemId, line]),
    );
    if (
      hasLineSelection &&
      [...requestedLines.keys()].some(
        (menuItemId) => !effectiveAll.some((line) => line.menuItemId === menuItemId),
      )
    ) {
      throw new BadRequestException(
        'Un produit sélectionné ne correspond plus à une fiche technique active du menu.',
      );
    }
    const linkedItemIds = new Set();
    const linkedSheetIds = new Set();
    for (const link of menu.productionLinks ?? []) {
      if (link.productionOrder?.status === 'CANCELLED') continue;
      if (link.productionOrder?.technicalSheetId) {
        linkedSheetIds.add(link.productionOrder.technicalSheetId);
      }
      const snapshotLines = Array.isArray(link.snapshot?.lines) ? link.snapshot.lines : [];
      snapshotLines.forEach((line) => {
        if (line?.menuItemId) linkedItemIds.add(line.menuItemId);
      });
    }
    effectiveAll.forEach((line) => {
      if (linkedSheetIds.has(line.technicalSheetId)) linkedItemIds.add(line.menuItemId);
    });

    const skipped = [];
    const effective = effectiveAll
      .filter((line) => !hasLineSelection || requestedLines.has(line.menuItemId))
      .map((line) => {
        const requested = requestedLines.get(line.menuItemId);
        return {
          ...line,
          portions: requested ? Number(requested.portions) : line.portions,
          plannedTime: requested?.plannedTime || dto.plannedTime || '08:00',
        };
      })
      .filter((line) => {
        if (!hasLineSelection || dto.force || !linkedItemIds.has(line.menuItemId)) return true;
        skipped.push({
          menuItemId: line.menuItemId,
          name: line.technicalSheet.name,
          reason: 'Déjà planifié dans Fabrication',
        });
        return false;
      });

    const groups =
      dto.mode === MenuProductionGenerationMode.DETAILED
        ? effective.map((line) => ({ key: line.menuItemId, lines: [line] }))
        : [...effective.reduce((map, line) => {
            const current = map.get(line.technicalSheetId) ?? [];
            current.push(line);
            map.set(line.technicalSheetId, current);
            return map;
          }, new Map()).entries()].map(([key, lines]) => ({ key, lines }));

    const prepared = [];
    for (const group of groups) {
      const technicalSheetId = group.lines[0].technicalSheetId;
      const profile = this.technicalSheets
        ? await this.technicalSheets.ensureProductionProfile(
            organizationId,
            actor,
            technicalSheetId,
            menu.siteId,
          )
        : await this.prisma.productionProfile.findFirst({
            where: { organizationId, siteId: menu.siteId, technicalSheetId },
            include: { outputProduct: true, outputVariant: true, yieldUnit: true },
          });
      if (!profile) {
        throw new BadRequestException({
          code: 'PRODUCTION_PROFILE_REQUIRED_FOR_MENU',
          technicalSheetId,
          technicalSheetName: group.lines[0].technicalSheet.name,
          siteId: menu.siteId,
        });
      }
      prepared.push({ group, profile });
    }

    const created = [];
    for (const { group, profile } of prepared) {
      const portions = group.lines.reduce((sum, line) => sum + line.portions, 0);
      const reference = hasLineSelection
        ? `${menu.id}:${group.lines.map((line) => line.menuItemId).sort().join(',')}`
        : `${menu.id}:${group.key}:${menu.productionDirtySince?.toISOString() ?? 'initial'}`;
      let need = await this.prisma.productionNeed.findFirst({
        where: {
          organizationId,
          source: 'MENU',
          sourceReferenceType: 'MenuProductionGroup',
          sourceReferenceId: reference,
        },
      });
      if (!need) {
        need = await this.productionPlanning.createNeed(
          organizationId,
          { id: actor.id, role: actor.role, permissions: [] },
          {
            siteId: menu.siteId,
            productId: profile.outputProductId,
            variantId: profile.outputVariantId ?? undefined,
            unitId: profile.yieldUnitId,
            source: 'MENU',
            sourceReferenceType: 'MenuProductionGroup',
            sourceReferenceId: reference,
            quantity: new Prisma.Decimal(portions).toFixed(3),
            neededAt: menu.date.toISOString(),
            status: 'CONFIRMED',
            notes: `Besoin généré depuis le menu ${menu.name}`,
          },
        );
      }
      const campaign = await this.productionExecution.createCampaign(
        organizationId,
        { id: actor.id, role: actor.role, permissions: [] },
        {
          profileId: profile.id,
          grossRequirement: new Prisma.Decimal(portions).toFixed(3),
          neededAt: menu.date.toISOString(),
          plannedTime: group.lines[0].plannedTime || dto.plannedTime || '08:00',
          serviceId: dto.serviceId,
          name:
            dto.mode === MenuProductionGenerationMode.GROUPED
              ? `Menu ${menu.name} - ${group.lines[0].technicalSheet.name}`
              : group.lines[0].technicalSheet.name,
          priority: ProductionPriority.NORMAL,
          needIds: [need.id],
          createSubRecipeNeeds: true,
          comments: `Généré depuis Menus: ${menu.name}`,
        },
      );
      await this.prisma.menuProductionLink.create({
        data: {
          organizationId,
          menuId,
          productionOrderId: campaign.id,
          generationMode: dto.mode,
          snapshot: {
            menuId,
            needId: need.id,
            profileId: profile.id,
            recipeVersionId: campaign.recipeVersionId,
            lines: group.lines.map((line) => ({
              menuItemId: line.menuItemId,
              technicalSheetId: line.technicalSheetId,
              section: line.section,
              portions: line.portions,
              targetPortions:
                requestedLines.get(line.menuItemId)?.targetPortions ?? line.portions,
              openingCarryOverPortions:
                requestedLines.get(line.menuItemId)?.openingCarryOverPortions ?? 0,
              plannedTime: line.plannedTime,
            })),
          },
        },
      });
      created.push(campaign);
    }
    const plannedAfter = new Set(linkedItemIds);
    prepared.forEach(({ group }) => {
      group.lines.forEach((line) => plannedAfter.add(line.menuItemId));
    });
    const allMenuProductsPlanned =
      effectiveAll.length > 0 &&
      effectiveAll.every((line) => plannedAfter.has(line.menuItemId));
    await this.prisma.$transaction(async (tx) => {
      await tx.menu.update({
        where: { id: menuId },
        data: {
          productionGeneratedAt: allMenuProductsPlanned
            ? new Date()
            : menu.productionGeneratedAt,
          productionDirtySince: allMenuProductsPlanned
            ? null
            : menu.productionDirtySince,
        },
      });
      await this.history(
        tx,
        organizationId,
        menuId,
        null,
        actor.id,
        MenuHistoryAction.PRODUCTION_GENERATED,
        `${created.length} campagne(s) de production planifiée(s)`,
        {
          mode: dto.mode,
          campaignIds: created.map((campaign) => campaign.id),
          menuItemIds: prepared.flatMap(({ group }) =>
            group.lines.map((line) => line.menuItemId),
          ),
          skipped,
          allMenuProductsPlanned,
        },
      );
    });
    return {
      created: created.length,
      orders: created,
      skipped,
      allMenuProductsPlanned,
    };
  }

  async exports(organizationId: string, q: any = {}) { await this.assertInstalled(organizationId); return this.prisma.menuExport.findMany({ where: { organizationId, menuId: q.menuId }, include: { requestedBy: { select: { email: true, firstName: true, lastName: true } }, menu: true }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }
  async prepareExport(organizationId: string, actor: Actor, dto: any) { await this.assertInstalled(organizationId); this.assertManager(actor); const menus = dto.menuId ? [await this.getMenu(organizationId, dto.menuId)] : (await this.listMenus(organizationId, { startDate: dto.startDate, endDate: dto.endDate, pageSize: 200 })).items; const snapshot = { generatedAt: new Date().toISOString(), audience: dto.audience, menus }; const ext = dto.format === MenuExportFormat.EXCEL ? 'xlsx' : dto.format === MenuExportFormat.PDF ? 'pdf' : 'print'; const exp = await this.prisma.menuExport.create({ data: { organizationId, menuId: dto.menuId || null, requestedById: actor.id, format: dto.format, audience: dto.audience, filename: `menus-${dto.audience.toLowerCase()}-${Date.now()}.${ext}`, filters: dto.filters, snapshot } }); await this.prisma.menuHistory.create({ data: { organizationId, menuId: dto.menuId || null, actorUserId: actor.id, action: MenuHistoryAction.EXPORT_GENERATED, summary: `Export ${dto.audience} ${dto.format}`, details: { exportId: exp.id } } }); return exp; }
  async historyList(organizationId: string, q: any = {}) { await this.assertInstalled(organizationId); return this.prisma.menuHistory.findMany({ where: { organizationId, menuId: q.menuId, cycleId: q.cycleId, action: q.action, menu: q.activity ? { activity: q.activity } : undefined }, include: { actorUser: { select: { email: true, firstName: true, lastName: true } }, menu: true, cycle: true }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }

  private menuInclude(full=false) { return { site: true, cycle: true, items: { include: { menuCategory: true, diet: true, product: { include: { unit: true, category: true } }, technicalSheet: { include: this.sheetInclude() } }, orderBy: [{ section: 'asc' }, { position: 'asc' }] }, variants: { include: { diet: true, replacements: { include: { menuItem: true, replacementTechnicalSheet: { include: this.sheetInclude() } } } } }, guestForecasts: { include: { guestGroup: true, diet: true, destinationSite: true } }, dispatches: { include: { destinationSite: true } }, productionLinks: { include: { productionOrder: true } }, ...(full ? { exports: { orderBy: { createdAt: 'desc' }, take: 20 }, history: { orderBy: { createdAt: 'desc' }, take: 50, include: { actorUser: { select: { email: true, firstName: true, lastName: true } } } } } : {}) }; }
  private sheetInclude() { return { outputProduct: { include: { unit: true } }, yieldUnit: true, ingredients: { include: { allergens: { include: { allergen: true } } } } }; }
  private serializeMenu(m: any) {
    const totalGuests = (m.guestForecasts?.length ? m.guestForecasts.reduce((sum, forecast) => sum + forecast.count, 0) : m.expectedGuests) || 0;
    const menuItems = m.items ?? [];
    const technicalItems = menuItems.filter((item) => item.technicalSheetId);
    const productItems = menuItems.filter((item) => item.productId);
    const sheets = technicalItems.map((item) => item.technicalSheet).filter(Boolean);
    const allergens = [...new Set(sheets.flatMap((sheet) => sheet.ingredients?.flatMap((ingredient) => ingredient.allergens?.map((entry) => entry.allergen?.name).filter(Boolean) ?? []) ?? []))];
    const estimatedCost = menuItems.reduce((sum, item) => {
      const portions = Number(item.portionsOverride ?? (m.kind === MenuKind.CATALOG ? item.targetReadyQuantity ?? 0 : totalGuests));
      if (item.productId) return sum + Number(item.product?.averagePrice ?? 0) * Number(item.servingQuantity ?? 1) * portions;
      return sum + Number(item.technicalSheet?.costPerPortion ?? 0) * portions;
    }, 0);
    const alerts = [];
    if (!menuItems.length) alerts.push({ code: 'INCOMPLETE_MENU', severity: 'WARNING', title: 'Menu sans composition', blocking: true });
    if (m.kind !== MenuKind.CATALOG && !totalGuests) alerts.push({ code: 'NO_GUESTS', severity: 'WARNING', title: 'Convives non renseignés', blocking: false });
    if (technicalItems.some((item) => item.technicalSheet?.status !== 'ACTIVE' || item.technicalSheet?.isArchived)) alerts.push({ code: 'TECHNICAL_SHEET_INACTIVE', severity: 'CRITICAL', title: 'Fiche technique manquante, inactive ou archivée', blocking: true });
    if (technicalItems.some((item) => !item.technicalSheet?.outputProductId)) alerts.push({ code: 'OUTPUT_PRODUCT_REQUIRED', severity: 'CRITICAL', title: 'Enregistrez à nouveau la fiche technique pour activer son suivi', blocking: true });
    if (productItems.some((item) => !item.product || item.product.isArchived)) alerts.push({ code: 'STOCK_PRODUCT_INACTIVE', severity: 'CRITICAL', title: 'Produit Stocks manquant ou archivé', blocking: true });
    if (allergens.length) alerts.push({ code: 'ALLERGENS', severity: 'INFO', title: 'Allergènes présents', blocking: false, allergens });
    if (m.kind !== MenuKind.CATALOG && ['VALIDATED', 'PUBLISHED'].includes(m.status) && !m.productionGeneratedAt) alerts.push({ code: 'PRODUCTION_NOT_GENERATED', severity: 'WARNING', title: 'Production non générée', blocking: false });
    if (m.productionDirtySince) alerts.push({ code: 'PRODUCTION_DIRTY', severity: 'WARNING', title: 'Menu modifié après génération Production', blocking: false });
    const items = menuItems.map((item) => ({ ...item, sourceType: item.productId ? 'PRODUCT' : 'TECHNICAL_SHEET', portionsOverride: item.portionsOverride == null ? null : Number(item.portionsOverride), servingQuantity: Number(item.servingQuantity ?? 1), targetReadyQuantity: item.targetReadyQuantity == null ? null : Number(item.targetReadyQuantity), lowStockThreshold: item.lowStockThreshold == null ? null : Number(item.lowStockThreshold) }));
    return { ...m, items, totalGuests, estimatedCost, costPerGuest: totalGuests ? estimatedCost / totalGuests : 0, allergens, alerts, hasBlockingAlerts: alerts.some((alert) => alert.blocking) };
  }
  private effectiveProductionLines(menu: any) {
    const totalGuests =
      menu.guestForecasts?.reduce((sum, forecast) => sum + forecast.count, 0) ||
      menu.expectedGuests ||
      0;
    return (menu.items ?? [])
      .filter((item) => item.technicalSheetId && item.technicalSheet)
      .map((item) => {
        const itemGuests =
          menu.activity === MenuActivity.CENTRAL_KITCHEN && menu.guestForecasts?.length
            ? menu.guestForecasts
                .filter(
                  (forecast) => (forecast.dietId ?? null) === (item.dietId ?? null),
                )
                .reduce((sum, forecast) => sum + forecast.count, 0)
            : totalGuests;
        return {
          menuItemId: item.id,
          technicalSheetId: item.technicalSheetId,
          technicalSheet: item.technicalSheet,
          section: item.section,
          portions: Number(
            item.portionsOverride ??
              (menu.activity === MenuActivity.RESTAURANT_CAFE
                ? itemGuests
                : itemGuests * Number(item.servingQuantity ?? 1)),
          ),
        };
      });
  }
  private dateWithTime(date: Date, time?: string | null) { if (!time) return null; const [hours, minutes] = time.split(':').map(Number); const value = new Date(date); value.setHours(hours || 0, minutes || 0, 0, 0); return value; }
  private avg(v: number[]) { const f = v.filter(Number.isFinite); return f.length ? f.reduce((a,b)=>a+b,0)/f.length : 0; }
  private async ensureRefs(org: string, dto: any) {
    if (dto.siteId) await this.ensureSite(org, dto.siteId);
    for (const item of dto.items ?? []) {
      if (item.menuCategoryId) await this.ensureMenuCategory(org, item.menuCategoryId);
      if (item.dietId) await this.ensureDiet(org, item.dietId);
      const sourceCount = Number(Boolean(item.technicalSheetId)) + Number(Boolean(item.productId));
      if (sourceCount !== 1) throw new BadRequestException('Choisissez soit un produit Stocks, soit une fiche technique.');
      if (item.productId) {
        await this.ensureProduct(org, item.productId);
        continue;
      }
      const sheet = await this.ensureTechnicalSheet(org, item.technicalSheetId);
      if (!sheet.outputProductId) throw new BadRequestException(`La fiche « ${sheet.name} » doit être enregistrée à nouveau avant d’être ajoutée au menu.`);
    }
  }
  private async ensureMenu(org: string, id: string) { const x = await this.prisma.menu.findFirst({ where: { id, organizationId: org } }); if (!x) throw new NotFoundException('Menu introuvable'); return x; }
  private async ensureSite(org: string, id: string) { const x = await this.prisma.site.findFirst({ where: { id, organizationId: org, isArchived: false } }); if (!x) throw new NotFoundException('Site introuvable'); return x; }
  private async resolvePrimarySiteId(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { primarySiteId: true },
    });
    if (organization?.primarySiteId) return organization.primarySiteId;
    const firstSite = await this.prisma.site.findFirst({
      where: { organizationId, isArchived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!firstSite) throw new BadRequestException('Aucun site actif n’est configuré pour cette organisation.');
    return firstSite.id;
  }
  private async ensureDiet(org: string, id: string) { const x = await this.prisma.menuDiet.findFirst({ where: { id, organizationId: org, isArchived: false } }); if (!x) throw new NotFoundException('Régime introuvable'); return x; }
  private async ensureGuestGroup(org: string, id: string) { const x = await this.prisma.menuGuestGroup.findFirst({ where: { id, organizationId: org, isArchived: false } }); if (!x) throw new NotFoundException('Groupe de convives introuvable'); return x; }
  private async ensureTechnicalSheet(org: string, id: string) { const x = await this.prisma.technicalSheet.findFirst({ where: { id, organizationId: org, isArchived: false, status: 'ACTIVE' } }); if (!x) throw new NotFoundException('Fiche technique active introuvable'); return x; }
  private async ensureProduct(org: string, id: string) { const x = await this.prisma.product.findFirst({ where: { id, organizationId: org, isArchived: false } }); if (!x) throw new NotFoundException('Produit Stocks actif introuvable'); return x; }
  private async ensureMenuCategory(org: string, id: string) { const x = await this.prisma.menuCategory.findFirst({ where: { id, organizationId: org, isArchived: false } }); if (!x) throw new NotFoundException('Rubrique Menu introuvable'); return x; }
  private async ensureMenuSettings(organizationId: string) { return this.prisma.menuSettings.upsert({ where: { organizationId }, update: {}, create: { organizationId, usageProfile: MenuUsageProfile.RESTAURANT_CAFE, ...MENU_PROFILE_DEFAULTS.RESTAURANT_CAFE } }); }
  private menuItemData(organizationId: string, menuId: string, item: any) { return { organizationId, menuId, section: item.section ?? 'OTHER', menuCategoryId: item.menuCategoryId || null, technicalSheetId: item.technicalSheetId || null, productId: item.productId || null, dietId: item.dietId || null, position: item.position ?? 0, portionsOverride: item.portionsOverride == null ? null : new Prisma.Decimal(item.portionsOverride), servingQuantity: new Prisma.Decimal(item.servingQuantity ?? 1), targetReadyQuantity: item.targetReadyQuantity == null ? null : new Prisma.Decimal(item.targetReadyQuantity), lowStockThreshold: item.lowStockThreshold == null ? null : new Prisma.Decimal(item.lowStockThreshold), availabilityEnabled: item.availabilityEnabled ?? true, notes: item.notes }; }
  private async recalculateProductionOrderTx(tx: any, organizationId: string, orderId: string) { const order = await tx.productionOrder.findFirst({ where: { id: orderId, organizationId }, include: { technicalSheet: { include: { ingredients: { include: { product: { include: { unit: true, primarySupplier: true, stocks: true } }, unit: true } } } } } }); if (!order) return; await tx.productionMaterialRequirement.deleteMany({ where: { orderId } }); const factor = new Prisma.Decimal(order.plannedPortions).div(order.technicalSheet.referencePortions || 1); let estimatedCost = new Prisma.Decimal(0); for (const ing of order.technicalSheet.ingredients) { const required = new Prisma.Decimal(ing.quantity).mul(factor); const available = ing.product.stocks.reduce((s, st) => s.add(st.quantity), new Prisma.Decimal(0)); const status = ing.product.isArchived ? ProductionMaterialStatus.PRODUCT_ARCHIVED : available.isZero() ? ProductionMaterialStatus.STOCK_UNKNOWN : available.lt(required) ? ProductionMaterialStatus.INSUFFICIENT_STOCK : available.sub(required).lte(ing.product.minimumStock) ? ProductionMaterialStatus.POTENTIAL_SHORTAGE : ProductionMaterialStatus.OK; const cost = ing.cost == null ? null : new Prisma.Decimal(ing.cost).mul(factor); if (cost) estimatedCost = estimatedCost.add(cost); await tx.productionMaterialRequirement.create({ data: { organizationId, orderId, technicalSheetIngredientId: ing.id, productId: ing.productId, unitId: ing.unitId, supplierId: ing.product.primarySupplierId, requiredQuantity: required, stockAvailable: available, varianceQuantity: available.sub(required), status, estimatedCost: cost, productNameSnapshot: ing.product.name, unitSymbolSnapshot: ing.unit.symbol, supplierNameSnapshot: ing.product.primarySupplier?.name, details: { source: 'MENUS', sourceMenuOrderId: orderId } } }); } await tx.productionOrder.update({ where: { id: orderId }, data: { estimatedCost } }); }
  private async nextProductionNumber(tx: any, org: string) { const year = new Date().getFullYear(); const count = await tx.productionOrder.count({ where: { organizationId: org, number: { startsWith: `OP-${year}-` } } }); return `OP-${year}-${String(count + 1).padStart(4, '0')}`; }
  private history(tx: any, organizationId: string, menuId: string | null, cycleId: string | null, actorUserId: string | null, action: any, summary: string, details?: any) { return tx.menuHistory.create({ data: { organizationId, menuId, cycleId, actorUserId, action, summary, details } }); }
  private installedApps(org: any) { return [...(org?.stocksInstalledAt ? ['stocks'] : []), ...(org?.rnmPricesInstalledAt ? ['rnm-prices'] : []), ...(org?.hrInstalledAt ? ['hr'] : []), ...(org?.planningInstalledAt ? ['planning'] : []), ...(org?.technicalSheetsInstalledAt ? ['technical-sheets'] : []), ...(org?.productionInstalledAt ? ['production'] : []), ...(org?.menusInstalledAt ? ['menus'] : [])]; }
}
