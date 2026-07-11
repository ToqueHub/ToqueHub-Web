import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, TechnicalSheetExportFormat, TechnicalSheetHistoryAction, TechnicalSheetStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { DuplicateTechnicalSheetDto, ProductionSimulationDto, TechnicalSheetListQueryDto, UpsertAllergenDto, UpsertRecipeCategoryDto, UpsertTechnicalSheetDto } from './dto/technical-sheets.dto';

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;
type UploadedRecipePdf = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type ImportedRecipeIngredient = { name?: string | null; quantity?: number | null; unit?: string | null; comment?: string | null; sku?: string | null; gtin?: string | null };
type ImportedRecipeStep = { title?: string | null; description?: string | null; estimatedTimeMinutes?: number | null };
type PreparedImportedIngredient = { productId?: string; productName?: string; productSku?: string; productGtin?: string; createProduct?: boolean; unitId: string; quantity: number; comment?: string; order: number };

const DEFAULT_CATEGORIES = ['Entrées', 'Plats', 'Desserts', 'Sauces', 'Accompagnements', 'Petit-déjeuner', 'Pâtisserie', 'Boulangerie', 'Boissons'];
const MAX_RECIPE_PDF_BYTES = 20 * 1024 * 1024;

@Injectable()
export class TechnicalSheetsService {
  constructor(private readonly prisma: PrismaService, private readonly mistralClient: MistralClientService) {}

  private page(q?: TechnicalSheetListQueryDto) { const take = Math.min(q?.pageSize ?? 50, 200); const skip = ((q?.page ?? 1) - 1) * take; return { take, skip }; }

  private async assertInstalled(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, technicalSheetsInstalledAt: true } });
    if (!org?.stocksInstalledAt) throw new BadRequestException('Le module Stocks doit être installé avant les Fiches Techniques.');
    if (!org.technicalSheetsInstalledAt) throw new BadRequestException('Le module Fiches Techniques n’est pas installé pour cette organisation.');
  }

  async install(organizationId: string, actor: Actor) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, rnmPricesInstalledAt: true, hrInstalledAt: true, planningInstalledAt: true } });
    if (!org?.stocksInstalledAt) throw new BadRequestException('Installation impossible: Stocks est obligatoire.');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { technicalSheetsInstalledAt: new Date() } });
      await tx.technicalSheetCategory.createMany({ data: DEFAULT_CATEGORIES.map((name) => ({ organizationId, name })), skipDuplicates: true });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_TECHNICAL_SHEETS_INSTALLED, entityType: 'Module', entityId: 'technical-sheets', entityName: 'Fiches Techniques' } });
    });
    return { installed: true, installedApplications: this.installedApps({ ...org, technicalSheetsInstalledAt: new Date() }) };
  }

  async uninstall(organizationId: string, actor: Actor) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { stocksInstalledAt: true, rnmPricesInstalledAt: true, hrInstalledAt: true, planningInstalledAt: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { technicalSheetsInstalledAt: null } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_TECHNICAL_SHEETS_UNINSTALLED, entityType: 'Module', entityId: 'technical-sheets', entityName: 'Fiches Techniques' } });
    });
    return { installed: false, installedApplications: this.installedApps({ ...org, technicalSheetsInstalledAt: null }) };
  }

  async dashboard(organizationId: string) {
    await this.assertInstalled(organizationId);
    const [recipeCount, categoryCount, sheets, latest, used] = await Promise.all([
      this.prisma.technicalSheet.count({ where: { organizationId, isArchived: false } }),
      this.prisma.technicalSheetCategory.count({ where: { organizationId, isArchived: false } }),
      this.prisma.technicalSheet.findMany({ where: { organizationId, isArchived: false }, select: { totalCost: true } }),
      this.prisma.technicalSheet.findMany({ where: { organizationId }, include: this.recipeInclude(), orderBy: { updatedAt: 'desc' }, take: 8 }),
      this.prisma.technicalSheetIngredient.groupBy({ by: ['productId'], where: { organizationId }, _count: { productId: true }, orderBy: { _count: { productId: 'desc' } }, take: 10 }),
    ]);
    const products = await this.prisma.product.findMany({ where: { id: { in: used.map((u) => u.productId) } }, include: { unit: true, category: true } });
    const total = sheets.reduce((sum, s) => sum + Number(s.totalCost), 0);
    return { recipeCount, categoryCount, averageMaterialCost: sheets.length ? total / sheets.length : 0, usedStockProductsCount: used.length, latestRecipes: latest.map((s) => this.serializeRecipe(s)), topProducts: used.map((u) => { const product = products.find((p) => p.id === u.productId); return { productId: u.productId, name: product?.name ?? 'Produit Stocks', count: u._count.productId, product }; }), lastModifiedAt: latest[0]?.updatedAt?.toISOString?.() ?? null };
  }

  async listCategories(organizationId: string, q: TechnicalSheetListQueryDto = {}) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetCategory.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  async createCategory(organizationId: string, dto: UpsertRecipeCategoryDto) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetCategory.create({ data: { ...dto, organizationId } }); }
  async updateCategory(organizationId: string, id: string, dto: UpsertRecipeCategoryDto) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetCategory.update({ where: { id, organizationId }, data: dto }); }
  async archiveCategory(organizationId: string, id: string) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetCategory.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() } }); }
  async listAllergens(organizationId: string, q: TechnicalSheetListQueryDto = {}) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetAllergen.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  async createAllergen(organizationId: string, dto: UpsertAllergenDto) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetAllergen.create({ data: { name: dto.name, description: dto.description, organizationId } }); }
  async updateAllergen(organizationId: string, id: string, dto: UpsertAllergenDto) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetAllergen.update({ where: { id, organizationId }, data: dto }); }
  async archiveAllergen(organizationId: string, id: string) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetAllergen.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() } }); }

  async listRecipes(organizationId: string, q: TechnicalSheetListQueryDto = {}) {
    await this.assertInstalled(organizationId);
    const where = { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), categoryId: q.categoryId, status: q.status, OR: q.search ? [{ name: { contains: q.search, mode: 'insensitive' as const } }, { description: { contains: q.search, mode: 'insensitive' as const } }, { category: { name: { contains: q.search, mode: 'insensitive' as const } } }, { ingredients: { some: { product: { name: { contains: q.search, mode: 'insensitive' as const } } } } }] : undefined };
    const [items, total] = await Promise.all([this.prisma.technicalSheet.findMany({ where, include: this.recipeInclude(), orderBy: { updatedAt: 'desc' }, ...this.page(q) }), this.prisma.technicalSheet.count({ where })]);
    return { items: items.map((i) => this.serializeRecipe(i)), total, page: q.page ?? 1, pageSize: Math.min(q.pageSize ?? 50, 200) };
  }

  async getRecipe(organizationId: string, id: string) { await this.assertInstalled(organizationId); const recipe = await this.prisma.technicalSheet.findFirst({ where: { id, organizationId }, include: this.recipeInclude(true) }); if (!recipe) throw new NotFoundException('Fiche technique introuvable'); return this.serializeRecipe(recipe); }

  async createRecipe(organizationId: string, actor: Actor, dto: UpsertTechnicalSheetDto) {
    await this.assertInstalled(organizationId); if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId);
    return this.prisma.$transaction(async (tx) => { const created = await tx.technicalSheet.create({ data: this.recipeCreateData(organizationId, dto) }); await this.replaceChildren(tx, organizationId, created.id, dto, actor.id); await this.history(tx, organizationId, created.id, actor.id, TechnicalSheetHistoryAction.CREATED, 'Création de la fiche technique'); await this.recalculateCostTx(tx, organizationId, created.id, actor.id, false); return this.serializeRecipe(await tx.technicalSheet.findUnique({ where: { id: created.id }, include: this.recipeInclude(true) })); });
  }

  async updateRecipe(organizationId: string, actor: Actor, id: string, dto: UpsertTechnicalSheetDto) {
    await this.assertInstalled(organizationId); await this.ensureRecipe(organizationId, id); if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId);
    return this.prisma.$transaction(async (tx) => { await tx.technicalSheet.update({ where: { id, organizationId }, data: this.recipeUpdateData(dto) }); if (dto.ingredients) await this.replaceIngredients(tx, organizationId, id, dto.ingredients, actor.id); if (dto.steps) await this.replaceSteps(tx, organizationId, id, dto.steps); await this.history(tx, organizationId, id, actor.id, TechnicalSheetHistoryAction.GENERAL_UPDATED, 'Modification de la fiche technique'); await this.recalculateCostTx(tx, organizationId, id, actor.id, false); return this.serializeRecipe(await tx.technicalSheet.findUnique({ where: { id }, include: this.recipeInclude(true) })); });
  }

  async archiveRecipe(organizationId: string, actor: Actor, id: string) { await this.assertInstalled(organizationId); await this.ensureRecipe(organizationId, id); return this.prisma.$transaction(async (tx) => { const sheet = await tx.technicalSheet.update({ where: { id, organizationId }, data: { status: TechnicalSheetStatus.ARCHIVED, isArchived: true, archivedAt: new Date() }, include: this.recipeInclude(true) }); await this.history(tx, organizationId, id, actor.id, TechnicalSheetHistoryAction.ARCHIVED, 'Archivage de la fiche technique'); return this.serializeRecipe(sheet); }); }

  async duplicateRecipe(organizationId: string, actor: Actor, id: string, dto: DuplicateTechnicalSheetDto) {
    await this.assertInstalled(organizationId); const source = await this.getRecipe(organizationId, id) as any; const name = dto.name || `${source.name} (copie)`;
    return this.prisma.$transaction(async (tx) => { const created = await tx.technicalSheet.create({ data: { organizationId, sourceTechnicalSheetId: id, name, description: dto.copyGeneral === false ? undefined : source.description, categoryId: dto.copyCategory === false ? undefined : source.categoryId, photoUrl: dto.copyPhoto === false ? undefined : source.photoUrl, photoDataUrl: dto.copyPhoto === false ? undefined : source.photoDataUrl, referencePortions: dto.copyGeneral === false ? 1 : source.referencePortions, preparationTimeMinutes: dto.copyGeneral === false ? 0 : source.preparationTimeMinutes, cookingTimeMinutes: dto.copyGeneral === false ? 0 : source.cookingTimeMinutes, totalTimeMinutes: dto.copyGeneral === false ? 0 : source.totalTimeMinutes, status: TechnicalSheetStatus.DRAFT } }); if (dto.copyIngredients !== false) await this.replaceIngredients(tx, organizationId, created.id, source.ingredients.map((i: any) => ({ productId: i.productId, unitId: i.unitId, quantity: Number(i.quantity), comment: i.comment, order: i.order }))); if (dto.copySteps !== false) await this.replaceSteps(tx, organizationId, created.id, source.steps.map((s: any) => ({ order: s.order, title: s.title, description: s.description, estimatedMinutes: s.estimatedMinutes ?? s.estimatedTimeMinutes }))); await this.history(tx, organizationId, created.id, actor.id, TechnicalSheetHistoryAction.DUPLICATED, `Duplication depuis ${source.name}`, { sourceTechnicalSheetId: id }); await this.recalculateCostTx(tx, organizationId, created.id, actor.id, false); return this.serializeRecipe(await tx.technicalSheet.findUnique({ where: { id: created.id }, include: this.recipeInclude(true) })); });
  }

  async recalculateCost(organizationId: string, actor: Actor, id: string) { await this.assertInstalled(organizationId); await this.ensureRecipe(organizationId, id); return this.serializeRecipe(await this.prisma.$transaction((tx) => this.recalculateCostTx(tx, organizationId, id, actor.id, true))); }
  async costs(organizationId: string, q: TechnicalSheetListQueryDto = {}) { return this.listRecipes(organizationId, q); }
  async historyList(organizationId: string, id: string, q: TechnicalSheetListQueryDto = {}) { await this.assertInstalled(organizationId); return this.prisma.technicalSheetHistory.findMany({ where: { organizationId, technicalSheetId: id }, include: { user: { select: { email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }

  async importRecipePdf(organizationId: string, file: UploadedRecipePdf) {
    await this.assertInstalled(organizationId);
    this.validateRecipePdf(file);
    const [products, units, categories] = await Promise.all([
      this.prisma.product.findMany({ where: { organizationId, isArchived: false }, include: { unit: true, category: true }, orderBy: { name: 'asc' } }),
      this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' } }),
      this.prisma.technicalSheetCategory.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' } }),
    ]);
    if (!units.length) throw new BadRequestException('Aucune unité Stocks active disponible.');
    const ocr = await this.mistralClient.ocrMarkdown(organizationId, { buffer: file.buffer, mimeType: this.recipePdfMime(file), withAnnotation: true });
    const aiImported = await this.extractRecipeFromOcr(organizationId, ocr.markdown, file.originalname);
    const imported = this.applyKesproRecipeData(ocr.markdown, aiImported);
    const warnings = [...(imported.warnings ?? [])];
    const categoryId = this.matchCategory(imported.categoryName, categories)?.id ?? categories[0]?.id ?? '';
    let matchedIngredientsCount = 0;
    let newProductsCount = 0;
    const preparedIngredients = (imported.ingredients ?? []).map((ingredient: ImportedRecipeIngredient, index: number): PreparedImportedIngredient | null => {
      if (!ingredient.name?.trim()) {
        warnings.push(`Ingrédient sans nom ignoré à la ligne ${index + 1}.`);
        return null;
      }
      const product = this.matchProduct(ingredient.name ?? '', products, ingredient.sku, ingredient.gtin);
      const unit = this.matchUnit(ingredient.unit, units) ?? (product ? units.find((item) => item.id === product.unitId) ?? product.unit : null) ?? units[0];
      const common = {
        unitId: unit.id,
        quantity: Math.max(Number(ingredient.quantity ?? 1) || 1, 0.001),
        comment: ingredient.comment || undefined,
        order: index,
      };
      if (product) {
        matchedIngredientsCount += 1;
        return { ...common, productId: product.id };
      }
      newProductsCount += 1;
      return {
        ...common,
        productName: ingredient.name.trim().slice(0, 180),
        productSku: ingredient.sku?.trim() || undefined,
        productGtin: ingredient.gtin?.trim() || undefined,
        createProduct: true,
      };
    }).filter((ingredient: PreparedImportedIngredient | null): ingredient is PreparedImportedIngredient => Boolean(ingredient));
    return {
      filename: file.originalname,
      pageCount: ocr.pageCount,
      matchedIngredientsCount,
      newProductsCount,
      skippedIngredientsCount: Math.max((imported.ingredients ?? []).length - preparedIngredients.length, 0),
      warnings,
      payload: {
        name: imported.name || this.nameFromFilename(file.originalname),
        description: imported.description || undefined,
        categoryId,
        referencePortions: Math.max(Number(imported.referencePortions ?? 1) || 1, 0.001),
        prepTimeMinutes: Math.max(Number(imported.prepTimeMinutes ?? 0) || 0, 0),
        cookTimeMinutes: Math.max(Number(imported.cookTimeMinutes ?? 0) || 0, 0),
        status: TechnicalSheetStatus.DRAFT,
        ingredients: preparedIngredients,
        steps: (imported.steps ?? []).map((step: ImportedRecipeStep, index: number) => ({
          order: index + 1,
          title: step.title || `Étape ${index + 1}`,
          description: step.description || '',
          estimatedTimeMinutes: Math.max(Number(step.estimatedTimeMinutes ?? 0) || 0, 0),
        })),
      },
    };
  }

  async simulate(organizationId: string, actor: Actor, dto: ProductionSimulationDto) {
    await this.assertInstalled(organizationId); const technicalSheetId = dto.technicalSheetId ?? dto.recipeId; if (!technicalSheetId) throw new BadRequestException('Fiche technique requise pour la simulation'); const recipe = await this.getRecipe(organizationId, technicalSheetId) as any;
    const factor = new Prisma.Decimal(dto.requestedPortions).div(recipe.referencePortions); const allergenNames = [...new Set<string>(recipe.ingredients.flatMap((i: any) => this.productAllergenNames(i.product)))];
    const lines = recipe.ingredients.map((i: any) => ({ ingredientId: i.id, productId: i.productId, productName: i.product?.name ?? i.productNameSnapshot, quantity: Number(new Prisma.Decimal(i.quantity).mul(factor)), unit: i.unit?.symbol, unitSymbol: i.unit?.symbol, estimatedCost: i.cost == null ? null : Number(new Prisma.Decimal(i.cost).mul(factor)), isCalculable: i.isCalculable, nonCalculableReason: i.nonCalculableReason, allergens: this.productAllergenNames(i.product) }));
    const sim = await this.prisma.technicalSheetSimulation.create({ data: { organizationId, technicalSheetId: recipe.id, requestedPortions: dto.requestedPortions, factor, totalEstimatedCost: new Prisma.Decimal(recipe.totalCost ?? 0).mul(factor), hasNonCalculableLines: recipe.hasNonCalculableLines, lines, allergenNames, createdById: actor.id }, include: { technicalSheet: true } });
    await this.prisma.technicalSheetHistory.create({ data: { organizationId, technicalSheetId: recipe.id, userId: actor.id, action: TechnicalSheetHistoryAction.SIMULATION_CREATED, summary: `Simulation pour ${dto.requestedPortions} portions` } });
    return { ...sim, recipeId: recipe.id, recipe, estimatedCost: Number(sim.totalEstimatedCost), allergens: allergenNames.map((name) => ({ id: name, name })), simulatedAt: sim.createdAt, lines };
  }

  async exportSimulation(organizationId: string, actor: Actor, simulationId: string, format: TechnicalSheetExportFormat) {
    await this.assertInstalled(organizationId);
    const sim = await this.prisma.technicalSheetSimulation.findFirst({ where: { id: simulationId, organizationId }, include: { technicalSheet: true } });
    if (!sim) throw new NotFoundException('Simulation introuvable');
    const extension = format === TechnicalSheetExportFormat.CSV ? 'csv' : 'pdf';
    const filename = `production-theorique-${this.slug(sim.technicalSheet.name)}-${this.dateSlug(sim.createdAt)}.${extension}`;
    await this.prisma.technicalSheetExport.create({ data: { organizationId, technicalSheetId: sim.technicalSheetId, simulationId: sim.id, format, filename, payload: { simulationId: sim.id }, createdById: actor.id } });
    await this.prisma.technicalSheetHistory.create({ data: { organizationId, technicalSheetId: sim.technicalSheetId, userId: actor.id, action: TechnicalSheetHistoryAction.EXPORT_CREATED, summary: `Export ${format} préparé` } });
    return format === TechnicalSheetExportFormat.CSV
      ? { filename, contentType: 'text/csv; charset=utf-8', body: this.simulationCsv(sim as any) }
      : { filename, contentType: 'application/pdf', body: await this.simulationPdf(sim as any) };
  }

  private recipeInclude(full = false) { return { category: true, ingredients: { orderBy: { order: 'asc' as const }, include: { product: { include: { unit: true, category: true } }, unit: true, allergens: { include: { allergen: true } } } }, steps: { orderBy: { order: 'asc' as const } }, ...(full ? { costSnapshots: { orderBy: { createdAt: 'desc' as const }, take: 20 }, history: { orderBy: { createdAt: 'desc' as const }, take: 20, include: { user: { select: { email: true, firstName: true, lastName: true } } } } } : {}) }; }
  private serializeRecipe(sheet: any) { if (!sheet) return sheet; const ingredients = (sheet.ingredients ?? []).map((line: any) => ({ ...line, quantity: Number(line.quantity), cost: line.cost == null ? null : Number(line.cost), costTotal: line.cost == null ? null : Number(line.cost), allergens: this.productAllergens(line.product) })); const allergensById = new Map<string, any>(); ingredients.forEach((line: any) => (line.allergens ?? []).forEach((allergen: any) => allergensById.set(allergen.id ?? allergen.name, allergen))); return { ...sheet, referencePortions: Number(sheet.referencePortions ?? 0), portions: Number(sheet.referencePortions ?? 0), prepTimeMinutes: sheet.preparationTimeMinutes, cookTimeMinutes: sheet.cookingTimeMinutes, costTotal: sheet.totalCost == null ? null : Number(sheet.totalCost), totalCost: sheet.totalCost == null ? null : Number(sheet.totalCost), costPerPortion: sheet.costPerPortion == null ? null : Number(sheet.costPerPortion), costPerKg: sheet.costPerKg == null ? null : Number(sheet.costPerKg), costPerLiter: sheet.costPerLiter == null ? null : Number(sheet.costPerLiter), duplicatedFromId: sheet.sourceTechnicalSheetId, ingredients, steps: (sheet.steps ?? []).map((step: any) => ({ ...step, estimatedTimeMinutes: step.estimatedMinutes })), allergens: [...allergensById.values()], nonCalculableLinesCount: ingredients.filter((line: any) => !line.isCalculable).length }; }
  private recipeCreateData(organizationId: string, dto: UpsertTechnicalSheetDto): Prisma.TechnicalSheetUncheckedCreateInput { const prep = dto.preparationTimeMinutes ?? dto.prepTimeMinutes ?? 0; const cook = dto.cookingTimeMinutes ?? dto.cookTimeMinutes ?? 0; return { organizationId, name: dto.name, description: dto.description, categoryId: dto.categoryId || null, photoUrl: dto.photoUrl, photoDataUrl: dto.photoDataUrl, referencePortions: dto.referencePortions, preparationTimeMinutes: prep, cookingTimeMinutes: cook, totalTimeMinutes: dto.totalTimeMinutes ?? prep + cook, status: dto.status ?? TechnicalSheetStatus.DRAFT }; }
  private recipeUpdateData(dto: UpsertTechnicalSheetDto): Prisma.TechnicalSheetUncheckedUpdateInput { const prep = dto.preparationTimeMinutes ?? dto.prepTimeMinutes ?? 0; const cook = dto.cookingTimeMinutes ?? dto.cookTimeMinutes ?? 0; return { name: dto.name, description: dto.description, categoryId: dto.categoryId || null, photoUrl: dto.photoUrl, photoDataUrl: dto.photoDataUrl, referencePortions: dto.referencePortions, preparationTimeMinutes: prep, cookingTimeMinutes: cook, totalTimeMinutes: dto.totalTimeMinutes ?? prep + cook, status: dto.status ?? TechnicalSheetStatus.DRAFT }; }
  private async replaceChildren(tx: Tx, organizationId: string, id: string, dto: UpsertTechnicalSheetDto, actorId?: string | null) { if (dto.ingredients) await this.replaceIngredients(tx, organizationId, id, dto.ingredients, actorId); if (dto.steps) await this.replaceSteps(tx, organizationId, id, dto.steps); }
  private async replaceIngredients(tx: Tx, organizationId: string, technicalSheetId: string, ingredients: NonNullable<UpsertTechnicalSheetDto['ingredients']>, actorId?: string | null) {
    await tx.technicalSheetIngredient.deleteMany({ where: { technicalSheetId } });
    for (const [idx, line] of ingredients.entries()) {
      const unit = await tx.unit.findFirst({ where: { id: line.unitId, organizationId, isArchived: false } });
      if (!unit) throw new NotFoundException('Unité Stocks introuvable');
      let product = line.productId
        ? await tx.product.findFirst({ where: { id: line.productId, organizationId, isArchived: false }, include: { unit: true } })
        : null;
      if (!product && line.createProduct && line.productName?.trim()) {
        const name = line.productName.trim();
        const sku = line.productSku?.trim() || null;
        const gtin = line.productGtin?.trim() || null;
        product = await tx.product.findFirst({
          where: {
            organizationId,
            isArchived: false,
            OR: [
              { name: { equals: name, mode: 'insensitive' } },
              ...(sku ? [{ sku }] : []),
              ...(gtin ? [{ gtin }] : []),
            ],
          },
          include: { unit: true },
        });
        if (!product) {
          product = await tx.product.create({
            data: { organizationId, name, sku, gtin, unitId: unit.id, averagePrice: new Prisma.Decimal(0) },
            include: { unit: true },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              userId: actorId || null,
              action: AuditAction.PRODUCT_CREATED,
              entityType: 'Product',
              entityId: product.id,
              entityName: product.name,
              details: { source: 'technical-sheet-pdf-import', technicalSheetId } as Prisma.InputJsonValue,
            },
          });
        }
      }
      if (!product) throw new BadRequestException('Chaque ingrédient doit être associé à un produit Stocks ou marqué comme nouveau produit.');
      await tx.technicalSheetIngredient.create({ data: { organizationId, technicalSheetId, productId: product.id, unitId: unit.id, quantity: line.quantity, comment: line.comment, order: line.order ?? idx, productNameSnapshot: product.name, unitSymbolSnapshot: unit.symbol, productUnitIdSnapshot: product.unitId, productUnitSymbolSnapshot: product.unit.symbol, productArchivedSnapshot: product.isArchived } });
    }
  }
  private async replaceSteps(tx: Tx, organizationId: string, technicalSheetId: string, steps: NonNullable<UpsertTechnicalSheetDto['steps']>) { await tx.technicalSheetStep.deleteMany({ where: { technicalSheetId } }); await tx.technicalSheetStep.createMany({ data: steps.map((s, idx) => ({ organizationId, technicalSheetId, order: s.order ?? idx, title: s.title ?? `Étape ${idx + 1}`, description: s.description ?? '', estimatedMinutes: s.estimatedMinutes ?? s.estimatedTimeMinutes })) }); }
  private async recalculateCostTx(tx: Tx, organizationId: string, technicalSheetId: string, userId: string | null, snapshot: boolean) { const recipe = await tx.technicalSheet.findUnique({ where: { id: technicalSheetId }, include: { ingredients: { include: { product: { include: { unit: true } }, unit: true } } } }); if (!recipe) throw new NotFoundException('Fiche technique introuvable'); let total = new Prisma.Decimal(0); const details: any[] = []; let hasNonCalculable = false; for (const line of recipe.ingredients) { const calc = await this.calculateLine(tx, organizationId, line); hasNonCalculable ||= !calc.isCalculable; if (calc.cost) total = total.add(calc.cost); await tx.technicalSheetIngredient.update({ where: { id: line.id }, data: { cost: calc.cost, unitPriceSnapshot: line.product.averagePrice, isCalculable: calc.isCalculable, nonCalculableReason: calc.reason, productArchivedSnapshot: line.product.isArchived } }); details.push({ ingredientId: line.id, productId: line.productId, productName: line.product.name, cost: calc.cost?.toString() ?? null, isCalculable: calc.isCalculable, reason: calc.reason }); } const perPortion = recipe.referencePortions.isZero() ? new Prisma.Decimal(0) : total.div(recipe.referencePortions); const updated = await tx.technicalSheet.update({ where: { id: technicalSheetId }, data: { totalCost: total, costPerPortion: perPortion, hasNonCalculableLines: hasNonCalculable, lastCostCalculationAt: new Date() }, include: this.recipeInclude(true) }); if (snapshot) await tx.technicalSheetCostSnapshot.create({ data: { organizationId, technicalSheetId, totalCost: total, costPerPortion: perPortion, hasNonCalculableLines: hasNonCalculable, lineDetails: details } }); await this.history(tx, organizationId, technicalSheetId, userId, TechnicalSheetHistoryAction.COST_RECALCULATED, 'Recalcul du coût matière', { totalCost: total.toString(), hasNonCalculableLines: hasNonCalculable }); return updated; }
  private async calculateLine(tx: Tx, organizationId: string, line: any) { if (line.product.isArchived) return { isCalculable: false, cost: null, reason: 'Produit Stocks archivé' }; let qty = new Prisma.Decimal(line.quantity); if (line.unitId !== line.product.unitId) { const conv = await tx.unitConversion.findFirst({ where: { organizationId, fromUnitId: line.unitId, toUnitId: line.product.unitId } }); if (!conv) return { isCalculable: false, cost: null, reason: 'Conversion unité indisponible dans Stocks' }; qty = qty.mul(conv.factor); } return { isCalculable: true, cost: qty.mul(line.product.averagePrice), reason: null }; }
  private async history(tx: Tx, organizationId: string, technicalSheetId: string, userId: string | null, action: TechnicalSheetHistoryAction, summary: string, details?: Prisma.InputJsonValue) { await tx.technicalSheetHistory.create({ data: { organizationId, technicalSheetId, userId: userId || null, action, summary, details } }); }
  private async ensureCategory(organizationId: string, id: string) { const item = await this.prisma.technicalSheetCategory.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Catégorie recette introuvable'); return item; }
  private async ensureRecipe(organizationId: string, id: string) { const item = await this.prisma.technicalSheet.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Fiche technique introuvable'); return item; }
  private installedApps(org: any) { return [...(org?.stocksInstalledAt ? ['stocks'] : []), ...(org?.rnmPricesInstalledAt ? ['rnm-prices'] : []), ...(org?.hrInstalledAt ? ['hr'] : []), ...(org?.planningInstalledAt ? ['planning'] : []), ...(org?.technicalSheetsInstalledAt ? ['technical-sheets'] : [])]; }
  private simulationCsv(sim: any) {
    const lines = Array.isArray(sim.lines) ? sim.lines : [];
    const rows: unknown[][] = [
      ['Fiche technique', sim.technicalSheet?.name ?? ''],
      ['Portions demandees', sim.requestedPortions ?? ''],
      ['Cout estime', this.formatMoney(sim.totalEstimatedCost ?? 0)],
      ['Allergenes produits', (sim.allergenNames ?? []).join(', ')],
      [],
      ['Produit', 'Quantite', 'Unite', 'Cout estime', 'Allergenes produits'],
      ...lines.map((line: any) => [line.productName, this.formatNumber(line.quantity), line.unitSymbol ?? line.unit ?? '', this.formatMoney(line.estimatedCost ?? 0), (line.allergens ?? []).join(', ')]),
    ];
    return `\ufeff${rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
  }

  private async simulationPdf(sim: any) {
    const lines = Array.isArray(sim.lines) ? sim.lines : [];
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Production theorique - ${sim.technicalSheet?.name ?? ''}`, Author: 'ToqueHub' } });
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const width = doc.page.width;
      doc.rect(0, 0, width, 118).fill('#073f3a');
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('ToqueHub', 42, 34);
      doc.fillColor('#d1fae5').fontSize(10).font('Helvetica').text('Production theorique', 42, 58);
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(sim.technicalSheet?.name ?? 'Fiche technique', 42, 78, { width: width - 84 });

      let y = 148;
      const summary = [
        ['Portions', this.formatNumber(sim.requestedPortions)],
        ['Cout estime', this.formatMoney(sim.totalEstimatedCost ?? 0)],
        ['Allergenes produits', (sim.allergenNames ?? []).join(', ') || 'Aucun renseigne'],
      ];
      const cardWidth = (width - 84 - 20) / 3;
      summary.forEach(([label, value], index) => {
        const x = 42 + index * (cardWidth + 10);
        doc.roundedRect(x, y, cardWidth, 64, 8).fillAndStroke('#f8fafc', '#dbeafe');
        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x + 12, y + 12, { width: cardWidth - 24 });
        doc.fillColor('#0f172a').fontSize(index === 2 ? 10 : 14).font('Helvetica-Bold').text(value, x + 12, y + 30, { width: cardWidth - 24, height: 24 });
      });
      y += 94;

      doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text('Ingredients requis', 42, y);
      y += 24;
      this.drawPdfTableHeader(doc, y);
      y += 26;
      lines.forEach((line: any) => {
        if (y > doc.page.height - 72) {
          doc.addPage({ size: 'A4', margin: 42 });
          y = 52;
          this.drawPdfTableHeader(doc, y);
          y += 26;
        }
        const allergens = (line.allergens ?? []).join(', ');
        doc.fillColor('#0f172a').fontSize(9).font('Helvetica').text(line.productName ?? '', 50, y, { width: 205 });
        doc.text(`${this.formatNumber(line.quantity)} ${line.unitSymbol ?? line.unit ?? ''}`, 260, y, { width: 98, align: 'right' });
        doc.text(this.formatMoney(line.estimatedCost ?? 0), 382, y, { width: 78, align: 'right' });
        doc.fillColor('#64748b').text(allergens || '-', 474, y, { width: 78 });
        doc.moveTo(42, y + 20).lineTo(width - 42, y + 20).strokeColor('#e2e8f0').stroke();
        y += 28;
      });

      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(`Genere par ToqueHub le ${new Date().toLocaleDateString('fr-FR')}`, 42, doc.page.height - 48, { align: 'center', width: width - 84 });
      doc.end();
    });
  }

  private drawPdfTableHeader(doc: PDFKit.PDFDocument, y: number) {
    doc.roundedRect(42, y, doc.page.width - 84, 22, 6).fill('#ecfdf5');
    doc.fillColor('#065f46').fontSize(8).font('Helvetica-Bold');
    doc.text('PRODUIT', 50, y + 7, { width: 205 });
    doc.text('QUANTITE', 260, y + 7, { width: 98, align: 'right' });
    doc.text('COUT', 382, y + 7, { width: 78, align: 'right' });
    doc.text('ALLERGENES', 474, y + 7, { width: 78 });
  }

  private validateRecipePdf(file: UploadedRecipePdf) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun PDF fourni');
    const name = file.originalname?.toLowerCase() ?? '';
    if (file.size > MAX_RECIPE_PDF_BYTES) throw new BadRequestException('Le PDF recette ne doit pas dépasser 20 Mo.');
    if (file.mimetype !== 'application/pdf' && !name.endsWith('.pdf')) throw new BadRequestException('Seuls les fichiers PDF sont acceptés pour importer une recette.');
  }

  private recipePdfMime(file: UploadedRecipePdf) {
    return file.mimetype === 'application/pdf' || file.originalname?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.mimetype;
  }

  private async extractRecipeFromOcr(organizationId: string, markdown: string, filename: string) {
    if (!markdown.trim()) throw new BadRequestException('Le PDF ne contient pas de texte exploitable après OCR.');
    return this.mistralClient.chatJson<any>(organizationId, [
      {
        role: 'system',
        content: [
          'Tu analyses une recette ou fiche technique de cuisine pour ToqueHub.',
          'Retourne uniquement un JSON conforme au schema.',
          'Objectif: extraire les informations utiles a la creation d une fiche technique.',
          'Les ingredients doivent rester dans la langue du document, avec quantite numerique et unite courte si disponible.',
          'Les etapes doivent etre ordonnees et redigees en francais si le document est francais, sinon conserve la langue source.',
          'N invente pas d ingredient manquant et signale les incertitudes dans warnings.',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify({ filename, ocrMarkdown: markdown.slice(0, 45_000) }) },
    ], 'toquehub_recipe_pdf_import', this.recipeImportSchema());
  }

  private recipeImportSchema() {
    const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'description', 'categoryName', 'referencePortions', 'prepTimeMinutes', 'cookTimeMinutes', 'ingredients', 'steps', 'warnings'],
      properties: {
        name: nullableString,
        description: nullableString,
        categoryName: nullableString,
        referencePortions: nullableNumber,
        prepTimeMinutes: nullableNumber,
        cookTimeMinutes: nullableNumber,
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'quantity', 'unit', 'comment', 'sku', 'gtin'],
            properties: { name: nullableString, quantity: nullableNumber, unit: nullableString, comment: nullableString, sku: nullableString, gtin: nullableString },
          },
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'description', 'estimatedTimeMinutes'],
            properties: { title: nullableString, description: nullableString, estimatedTimeMinutes: nullableNumber },
          },
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    };
  }

  private applyKesproRecipeData(markdown: string, imported: any) {
    if (!/(?:Kespro\.com|oma\.kespro\.com)/i.test(markdown)) return imported;
    const ingredients = this.parseKesproIngredients(markdown);
    if (!ingredients.length) return imported;
    const documentTitle = markdown.match(/^(.+?)\s+-\s+Kespro\.com\s*$/m)?.[1];
    const heading = (documentTitle || markdown.match(/^#\s+(.+?)\s*$/m)?.[1])?.replace(/\s+\d+\s+kpl\b.*$/i, '').trim();
    const portions = this.decimalFromText(markdown.match(/Plate serving\s+([\d.,]+)\s+servings?/i)?.[1]);
    const warnings = Array.isArray(imported?.warnings)
      ? imported.warnings.filter((warning: unknown) => !/quantit(?:e|é).*?(?:non|pas|absent|pr(?:e|é)cis|estim)/i.test(String(warning)))
      : [];
    return {
      ...imported,
      name: heading || imported?.name,
      referencePortions: portions ?? imported?.referencePortions,
      ingredients,
      warnings,
    };
  }

  private parseKesproIngredients(markdown: string): ImportedRecipeIngredient[] {
    const lines = markdown.split(/\r?\n/);
    const ingredients: ImportedRecipeIngredient[] = [];
    let inIngredientTable = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^\|\s*PRODUCT\s*\|\s*AMOUNT\s*\|/i.test(line)) {
        inIngredientTable = true;
        continue;
      }
      if (!inIngredientTable) continue;
      if (!line.startsWith('|')) break;
      if (/^\|(?:\s*:?-+:?\s*\|)+$/i.test(line)) continue;
      const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((cell) => cell.trim());
      if (cells.length < 2) continue;
      const sourceName = cells[0].replace(/\*\*/g, '').trim();
      const amount = cells[1].match(/^([\d.,]+)\s*([^\s|]+)?/);
      const quantity = this.decimalFromText(amount?.[1]);
      if (!sourceName || quantity == null) continue;
      const gtin = sourceName.match(/\bGTIN\s+(\d{8,14})\b/i)?.[1] ?? null;
      const sku = sourceName.match(/\bSAP\s+([A-Za-z0-9-]+)\b/i)?.[1] ?? null;
      const name = sourceName.replace(/\s+GTIN\s+\d{8,14}\s*-?\s*SAP\s+[A-Za-z0-9-]+.*$/i, '').trim();
      const additionalInfo = cells[2] && cells[2] !== '-' ? cells[2] : null;
      ingredients.push({ name, quantity, unit: amount?.[2] ?? null, comment: additionalInfo, sku, gtin });
    }
    return ingredients;
  }

  private decimalFromText(value?: string | null) {
    if (!value) return null;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private matchProduct(name: string, products: any[], sku?: string | null, gtin?: string | null) {
    const target = this.norm(name);
    if (!target) return null;
    const exactReference = products.find((product) => (sku && product.sku === sku) || (gtin && product.gtin === gtin));
    if (exactReference) return exactReference;
    let best: { product: any; score: number } | null = null;
    for (const product of products) {
      const candidate = this.norm([product.name, product.sku, product.gtin, product.description].filter(Boolean).join(' '));
      const score = this.textScore(target, candidate);
      if (!best || score > best.score) best = { product, score };
    }
    return best && best.score >= 0.58 ? best.product : null;
  }

  private matchUnit(unit: string | null | undefined, units: any[]) {
    const target = this.norm(unit ?? '');
    if (!target) return null;
    return units.find((item) => [item.symbol, item.name].some((value) => this.norm(value ?? '') === target)) ?? null;
  }

  private matchCategory(name: string | null | undefined, categories: any[]) {
    const target = this.norm(name ?? '');
    if (!target) return null;
    return categories.find((item) => this.norm(item.name) === target) ?? null;
  }

  private productAllergens(product: any) {
    const present = Array.isArray(product?.allergensPresent) ? product.allergensPresent : [];
    const traces = Array.isArray(product?.possibleTraces) ? product.possibleTraces : [];
    return [
      ...present.map((name: string) => ({ id: `present:${this.slug(name)}`, name, source: 'product', type: 'present' })),
      ...traces.map((name: string) => ({ id: `trace:${this.slug(name)}`, name: `Traces possibles: ${name}`, source: 'product', type: 'trace' })),
    ];
  }

  private productAllergenNames(product: any) {
    return this.productAllergens(product).map((allergen) => allergen.name).filter(Boolean);
  }

  private textScore(target: string, candidate: string) {
    if (!candidate) return 0;
    if (candidate === target) return 1;
    const targetWords = target.split(' ').filter((word) => word.length > 2);
    if (!targetWords.length) return 0;
    const candidateWords = candidate.split(' ').filter((word) => word.length > 2);
    const candidateSet = new Set(candidateWords);
    const overlap = targetWords.filter((word) => candidateSet.has(word)).length;
    const coverage = overlap / Math.max(targetWords.length, candidateSet.size, 1);
    if (overlap === targetWords.length && candidateSet.size <= Math.ceil(targetWords.length * 1.5)) return 0.9;
    if (overlap === candidateSet.size && targetWords.length <= Math.ceil(candidateSet.size * 1.5)) return 0.86;
    return coverage;
  }

  private norm(value: string) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
  }

  private slug(value: string) {
    return this.norm(value).replace(/\s+/g, '-').slice(0, 80) || 'fiche';
  }

  private nameFromFilename(filename: string) {
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Recette importee';
  }

  private dateSlug(value?: Date | string | null) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(+date) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  private formatNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number.toLocaleString('fr-FR', { maximumFractionDigits: 3 }) : '0';
  }

  private formatMoney(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? `${number.toFixed(2)} EUR` : '0.00 EUR';
  }
}
